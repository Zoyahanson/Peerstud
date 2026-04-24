from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from backend.config import settings
from backend.models import GoogleCalendarConnection


_TOKEN_URL = "https://oauth2.googleapis.com/token"
_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
_OAUTH_STATE_TTL_MINUTES = 10


_oauth_state_store: dict[str, tuple[str, datetime]] = {}


def create_oauth_state_for_user(user_id: str) -> str:
    state = token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OAUTH_STATE_TTL_MINUTES)
    _oauth_state_store[state] = (str(user_id), expires_at)
    return state


def consume_oauth_state_for_user(*, state: str, user_id: str) -> None:
    payload = _oauth_state_store.pop(state, None)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    state_user_id, expires_at = payload
    now = datetime.now(timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state expired")

    if state_user_id != str(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state mismatch")


def build_google_calendar_authorization_url(*, state: str) -> str:
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and "
                "GOOGLE_OAUTH_CLIENT_SECRET."
            ),
        )

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar.events",
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    return f"{_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(*, code: str) -> dict[str, object]:
    form = {
        "code": code,
        "client_id": settings.google_oauth_client_id,
        "client_secret": settings.google_oauth_client_secret,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "grant_type": "authorization_code",
    }
    return _token_request(form)


def refresh_access_token(*, refresh_token: str) -> dict[str, object]:
    form = {
        "client_id": settings.google_oauth_client_id,
        "client_secret": settings.google_oauth_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    return _token_request(form)


def fetch_google_user_email(*, access_token: str) -> str:
    req = Request(
        _USERINFO_URL,
        method="GET",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urlopen(req, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        message = _extract_http_error_message(exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch Google user info: {message}",
        ) from exc

    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google user email missing from OAuth response",
        )
    return str(email)


def ensure_fresh_access_token(connection: GoogleCalendarConnection) -> str:
    now = datetime.now(timezone.utc)
    if (
        connection.access_token
        and connection.access_token_expires_at
        and connection.access_token_expires_at > now + timedelta(seconds=60)
    ):
        return connection.access_token

    token_data = refresh_access_token(refresh_token=connection.refresh_token)
    access_token = str(token_data.get("access_token") or "")
    expires_raw = token_data.get("expires_in")
    expires_in = int(expires_raw) if isinstance(expires_raw, (int, str)) else 0
    if not access_token or expires_in <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to refresh Google OAuth access token",
        )

    connection.access_token = access_token
    connection.access_token_expires_at = now + timedelta(seconds=expires_in)
    return access_token


def create_meet_event_for_linked_account(
    *,
    connection: GoogleCalendarConnection,
    calendar_id: str,
    title: str,
    description: str | None,
    start_time: datetime,
    end_time: datetime,
    attendee_emails: list[str],
    reminder_minutes_before: int | None = None,
) -> dict[str, str | None]:
    access_token = ensure_fresh_access_token(connection)
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds)

    event = {
        "summary": title,
        "description": description or "",
        "start": {"dateTime": _as_utc_iso(start_time), "timeZone": "UTC"},
        "end": {"dateTime": _as_utc_iso(end_time), "timeZone": "UTC"},
        "conferenceData": {
            "createRequest": {
                "requestId": token_urlsafe(16),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    if attendee_emails:
        event["attendees"] = [{"email": email} for email in attendee_emails]
    if reminder_minutes_before is not None:
        event["reminders"] = {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": reminder_minutes_before},
                {"method": "email", "minutes": reminder_minutes_before},
            ],
        }

    try:
        created_event = (
            service.events()
            .insert(
                calendarId=calendar_id,
                body=event,
                conferenceDataVersion=1,
                sendUpdates="all" if attendee_emails else "none",
            )
            .execute()
        )
    except HTTPError as exc:
        message = _extract_http_error_message(exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google Calendar API error: {message}",
        ) from exc

    meet_link = None
    conference_data = created_event.get("conferenceData", {})
    for entry_point in conference_data.get("entryPoints", []):
        if entry_point.get("entryPointType") == "video":
            meet_link = entry_point.get("uri")
            break

    return {
        "event_id": created_event.get("id"),
        "meet_link": meet_link,
    }


def _token_request(form_data: dict[str, str]) -> dict[str, object]:
    body = urlencode(form_data).encode("utf-8")
    req = Request(
        _TOKEN_URL,
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        message = _extract_http_error_message(exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth token exchange failed: {message}",
        ) from exc


def _extract_http_error_message(exc: HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8")
        payload = json.loads(raw)
        error = payload.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or raw)
        return str(payload.get("error_description") or payload.get("error") or raw)
    except Exception:
        return str(exc)


def _as_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()
