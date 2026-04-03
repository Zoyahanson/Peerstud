from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ClassroomCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    capacity: int = Field(ge=1, le=500)
    location: Optional[str] = Field(default=None, max_length=200)


class Classroom(ClassroomCreate):
    id: UUID


class ScheduleCreate(BaseModel):
    classroom_id: UUID
    title: str = Field(min_length=2, max_length=150)
    description: Optional[str] = Field(default=None, max_length=1000)
    start_time: datetime
    end_time: datetime
    attendee_emails: list[EmailStr] = Field(default_factory=list)
    create_meet_link: bool = True


class Schedule(BaseModel):
    id: UUID
    classroom_id: UUID
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    attendee_emails: list[EmailStr] = Field(default_factory=list)
    meet_link: Optional[str] = None
    calendar_event_id: Optional[str] = None
