from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.api.schemas import (
    GoogleCalendarLinkCompleteRequest,
    GoogleCalendarLinkStartResponse,
    GoogleCalendarStatusResponse,
    UserProfileResponse,
    UserProfileUpsert,
    UserResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import GoogleCalendarConnection, User, UserProfile
from backend.services.google_calendar_oauth import (
    build_google_calendar_authorization_url,
    consume_oauth_state_for_user,
    create_oauth_state_for_user,
    exchange_code_for_tokens,
    fetch_google_user_email,
)


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        firebase_uid=current_user.firebase_uid,
        email=current_user.email,
        full_name=current_user.full_name,
    )


@router.get("/me/google-calendar/status", response_model=GoogleCalendarStatusResponse)
def get_google_calendar_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoogleCalendarStatusResponse:
    connection = (
        db.query(GoogleCalendarConnection)
        .filter(GoogleCalendarConnection.user_id == current_user.id)
        .first()
    )
    if not connection:
        return GoogleCalendarStatusResponse(linked=False)
    return GoogleCalendarStatusResponse(linked=True, google_email=connection.google_email)


@router.post("/me/google-calendar/link/start", response_model=GoogleCalendarLinkStartResponse)
def start_google_calendar_link(
    current_user: User = Depends(get_current_user),
) -> GoogleCalendarLinkStartResponse:
    state = create_oauth_state_for_user(str(current_user.id))
    authorization_url = build_google_calendar_authorization_url(state=state)
    return GoogleCalendarLinkStartResponse(authorization_url=authorization_url)


@router.post("/me/google-calendar/link/complete", response_model=GoogleCalendarStatusResponse)
def complete_google_calendar_link(
    payload: GoogleCalendarLinkCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoogleCalendarStatusResponse:
    consume_oauth_state_for_user(state=payload.state, user_id=str(current_user.id))

    token_data = exchange_code_for_tokens(code=payload.code)
    access_token = str(token_data.get("access_token") or "")
    refresh_token = token_data.get("refresh_token")
    expires_raw = token_data.get("expires_in")
    expires_in = int(expires_raw) if isinstance(expires_raw, (int, str)) else 0

    if not access_token or not refresh_token or expires_in <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth response missing access/refresh token",
        )

    google_email = fetch_google_user_email(access_token=access_token)
    connection = (
        db.query(GoogleCalendarConnection)
        .filter(GoogleCalendarConnection.user_id == current_user.id)
        .first()
    )

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    if connection:
        connection.google_email = google_email
        connection.access_token = access_token
        connection.refresh_token = str(refresh_token)
        connection.access_token_expires_at = expires_at
    else:
        connection = GoogleCalendarConnection(
            user_id=current_user.id,
            google_email=google_email,
            access_token=access_token,
            refresh_token=str(refresh_token),
            access_token_expires_at=expires_at,
        )

    db.add(connection)
    db.commit()

    return GoogleCalendarStatusResponse(linked=True, google_email=google_email)


@router.delete("/me/google-calendar/link", response_model=GoogleCalendarStatusResponse)
def unlink_google_calendar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoogleCalendarStatusResponse:
    connection = (
        db.query(GoogleCalendarConnection)
        .filter(GoogleCalendarConnection.user_id == current_user.id)
        .first()
    )
    if connection:
        db.delete(connection)
        db.commit()
    return GoogleCalendarStatusResponse(linked=False)


@router.put("/me/profile", response_model=UserProfileResponse)
def upsert_profile(
    payload: UserProfileUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileResponse:
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    if not profile:
        profile = UserProfile(
            user_id=current_user.id,
            bio=payload.bio,
            interests=payload.interests,
            embedding=payload.embedding,
        )
    else:
        profile.bio = payload.bio
        profile.interests = payload.interests
        profile.embedding = payload.embedding

    db.add(profile)
    db.commit()
    db.refresh(profile)

    return UserProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        bio=profile.bio,
        interests=profile.interests,
        has_embedding=profile.embedding is not None,
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user_by_id(
    user_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return UserResponse(
        id=user.id,
        firebase_uid=user.firebase_uid,
        email=user.email,
        full_name=user.full_name,
    )
