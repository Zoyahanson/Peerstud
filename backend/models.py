from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, Boolean, DateTime, Float, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["UserProfile"] = relationship(back_populates="user", uselist=False)
    google_calendar_connection: Mapped["GoogleCalendarConnection | None"] = relationship(
        back_populates="user",
        uselist=False,
    )
    settings: Mapped["UserSettings | None"] = relationship(
        back_populates="user",
        uselist=False,
    )
    courses_taught: Mapped[list["Course"]] = relationship(back_populates="instructor")
    hosted_sessions: Mapped[list["Session"]] = relationship(back_populates="host")
    joined_sessions: Mapped[list["SessionParticipant"]] = relationship(back_populates="user")
    authored_session_ratings: Mapped[list["SessionRating"]] = relationship(
        back_populates="rater",
        foreign_keys="SessionRating.rater_user_id",
    )
    sent_chat_messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="sender",
        foreign_keys="ChatMessage.sender_user_id",
    )
    chat_participations: Mapped[list["ConversationParticipant"]] = relationship(back_populates="user")
    study_groups_created: Mapped[list["StudyGroup"]] = relationship(back_populates="creator")
    study_group_memberships: Mapped[list["StudyGroupMember"]] = relationship(back_populates="user")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    year_of_study: Mapped[str | None] = mapped_column(String(50), nullable=True)
    faculty: Mapped[str | None] = mapped_column(String(150), nullable=True)
    campus: Mapped[str | None] = mapped_column(String(150), nullable=True)
    major: Mapped[str | None] = mapped_column(String(150), nullable=True)
    minor: Mapped[str | None] = mapped_column(String(150), nullable=True)
    current_courses: Mapped[list[str]] = mapped_column(
        ARRAY(String(120)),
        nullable=False,
        default=list,
        server_default=text("'{}'"),
    )
    qualifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    tutoring_experience: Mapped[str | None] = mapped_column(Text, nullable=True)
    available_for_tutoring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    strengths: Mapped[str | None] = mapped_column(Text, nullable=True)
    weak_topics: Mapped[str | None] = mapped_column(Text, nullable=True)
    credibility_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    ratings_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    interests: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="profile")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    instructor: Mapped[User] = relationship(back_populates="courses_taught")
    sessions: Mapped[list["Session"]] = relationship(back_populates="course")
    resources: Mapped[list["Resource"]] = relationship(back_populates="course")
    study_groups: Mapped[list["StudyGroup"]] = relationship(back_populates="course")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    host_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    classroom_name: Mapped[str] = mapped_column(String(120), nullable=False)
    topic_focus: Mapped[str] = mapped_column(String(200), nullable=False, default="General Study Session")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    meet_link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="scheduled")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped[Course] = relationship(back_populates="sessions")
    host: Mapped[User] = relationship(back_populates="hosted_sessions")
    participants: Mapped[list["SessionParticipant"]] = relationship(back_populates="session")
    ratings: Mapped[list["SessionRating"]] = relationship(back_populates="session")


class SessionParticipant(Base):
    __tablename__ = "session_participants"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="confirmed")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[Session] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(back_populates="joined_sessions")


class SessionRating(Base):
    __tablename__ = "session_ratings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rater_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tutor_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    score: Mapped[int] = mapped_column(nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[Session] = relationship(back_populates="ratings")
    rater: Mapped[User] = relationship(back_populates="authored_session_ratings", foreign_keys=[rater_user_id])


class StudyGroup(Base):
    __tablename__ = "study_groups"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    creator_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    topic_focus: Mapped[str] = mapped_column(String(200), nullable=False)
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    target_size: Mapped[int] = mapped_column(nullable=False, default=6)
    min_size: Mapped[int] = mapped_column(nullable=False, default=5)
    max_size: Mapped[int] = mapped_column(nullable=False, default=15)
    attendance_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inactive_after_days: Mapped[int] = mapped_column(nullable=False, default=21)
    system_suggested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    course: Mapped[Course] = relationship(back_populates="study_groups")
    creator: Mapped[User] = relationship(back_populates="study_groups_created")
    members: Mapped[list["StudyGroupMember"]] = relationship(back_populates="group")


class StudyGroupMember(Base):
    __tablename__ = "study_group_members"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("study_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    attendance_count: Mapped[int] = mapped_column(nullable=False, default=0)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    group: Mapped[StudyGroup] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="study_group_memberships")


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    storage_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False, default="link")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped[Course] = relationship(back_populates="resources")


class GoogleCalendarConnection(Base):
    __tablename__ = "google_calendar_connections"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    google_email: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    access_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="google_calendar_connection")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    email_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    calendar_auto_meet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    adaptive_layout: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    desktop_reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reminder_minutes_before: Mapped[int] = mapped_column(nullable=False, default=30)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="settings")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="direct")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    participants: Mapped[list["ConversationParticipant"]] = relationship(back_populates="conversation")
    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="conversation")


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(back_populates="chat_participations")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    sender: Mapped[User] = relationship(back_populates="sent_chat_messages")
