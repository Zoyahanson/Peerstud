from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status


class GoogleMeetService:
    def __init__(self) -> None:
        self.service_account_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")
        self.calendar_id = os.getenv("GOOGLE_CALENDAR_ID", "primary")
        self.mock_mode = os.getenv("GOOGLE_MEET_MOCK_MODE", "false").lower() == "true"

    def create_meet_event(
        self,
        *,
        title: str,
        description: str | None,
        start_time: datetime,
        end_time: datetime,
        attendee_emails: list[str],
        reminder_minutes_before: int | None = None,
    ) -> dict[str, str | None]:
        if self.mock_mode:
            fake_id = str(uuid4())
            return {
                "event_id": fake_id,
                "meet_link": f"https://meet.google.com/mock-{fake_id[:3]}-{fake_id[3:7]}-{fake_id[7:10]}",
            }

        if not self.service_account_file:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Google Meet is not configured. Set GOOGLE_SERVICE_ACCOUNT_FILE "
                    "or enable GOOGLE_MEET_MOCK_MODE=true."
                ),
            )

        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="google-api-python-client dependencies are not installed.",
            ) from exc

        scopes = ["https://www.googleapis.com/auth/calendar.events"]
        credentials = service_account.Credentials.from_service_account_file(
            self.service_account_file,
            scopes=scopes,
        )
        calendar_service = build("calendar", "v3", credentials=credentials)

        event = {
            "summary": title,
            "description": description or "",
            "start": {"dateTime": _as_utc_iso(start_time), "timeZone": "UTC"},
            "end": {"dateTime": _as_utc_iso(end_time), "timeZone": "UTC"},
            "attendees": [{"email": email} for email in attendee_emails],
            "conferenceData": {
                "createRequest": {
                    "requestId": str(uuid4()),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }
        if reminder_minutes_before is not None:
            event["reminders"] = {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": reminder_minutes_before},
                    {"method": "email", "minutes": reminder_minutes_before},
                ],
            }

        created_event = (
            calendar_service.events()
            .insert(
                calendarId=self.calendar_id,
                body=event,
                conferenceDataVersion=1,
                sendUpdates="all",
            )
            .execute()
        )

        meeting_uri = None
        conference_data = created_event.get("conferenceData", {})
        for entry_point in conference_data.get("entryPoints", []):
            if entry_point.get("entryPointType") == "video":
                meeting_uri = entry_point.get("uri")
                break

        return {
            "event_id": created_event.get("id"),
            "meet_link": meeting_uri,
        }


def _as_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()
