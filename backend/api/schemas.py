from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserResponse(BaseModel):
    id: UUID
    firebase_uid: str
    email: EmailStr
    full_name: str | None


class UserProfileUpsert(BaseModel):
    bio: str | None = None
    interests: str | None = None
    embedding: list[float] | None = Field(default=None, min_length=1536, max_length=1536)


class UserProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    bio: str | None
    interests: str | None
    has_embedding: bool


class GoogleCalendarLinkStartResponse(BaseModel):
    authorization_url: str


class GoogleCalendarLinkCompleteRequest(BaseModel):
    code: str
    state: str


class GoogleCalendarStatusResponse(BaseModel):
    linked: bool
    google_email: EmailStr | None = None


class SessionCreate(BaseModel):
    course_id: UUID
    classroom_name: str = Field(min_length=2, max_length=120)
    start_time: datetime
    end_time: datetime
    meet_link: str | None = None
    generate_meet: bool = False


class SessionResponse(BaseModel):
    id: UUID
    course_id: UUID
    host_user_id: UUID
    classroom_name: str
    start_time: datetime
    end_time: datetime
    meet_link: str | None
    status: str


class MatchResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str | None
    distance: float
