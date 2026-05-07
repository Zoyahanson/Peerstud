from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserResponse(BaseModel):
    id: UUID
    auth_uid: str
    email: EmailStr
    full_name: str | None


class UserProfileUpsert(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    year_of_study: str | None = Field(default=None, max_length=50)
    faculty: str | None = Field(default=None, max_length=150)
    campus: str | None = Field(default=None, max_length=150)
    major: str | None = Field(default=None, max_length=150)
    minor: str | None = Field(default=None, max_length=150)
    current_courses: list[str] = Field(default_factory=list, max_length=20)
    qualifications: str | None = None
    tutoring_experience: str | None = None
    available_for_tutoring: bool = True
    strengths: str | None = None
    weak_topics: str | None = None
    bio: str | None = None
    interests: str | None = None
    embedding: list[float] | None = Field(default=None, min_length=1536, max_length=1536)
    offer_text: str | None = None
    need_text: str | None = None
    offer_vector: list[float] | None = Field(default=None, min_length=1536, max_length=1536)
    need_vector: list[float] | None = Field(default=None, min_length=1536, max_length=1536)


class UserProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str | None
    year_of_study: str | None
    faculty: str | None
    campus: str | None
    major: str | None
    minor: str | None
    current_courses: list[str]
    qualifications: str | None
    tutoring_experience: str | None
    available_for_tutoring: bool
    strengths: str | None
    weak_topics: str | None
    credibility_score: float
    ratings_count: int
    bio: str | None
    interests: str | None
    offer_text: str | None
    need_text: str | None
    has_embedding: bool
    has_offer_vector: bool
    has_need_vector: bool


class UserProfileDetailResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    year_of_study: str | None
    faculty: str | None
    campus: str | None
    major: str | None
    minor: str | None
    current_courses: list[str]
    qualifications: str | None
    tutoring_experience: str | None
    available_for_tutoring: bool
    strengths: str | None
    weak_topics: str | None
    credibility_score: float
    ratings_count: int
    bio: str | None
    interests: str | None
    offer_text: str | None
    need_text: str | None
    has_embedding: bool
    has_offer_vector: bool
    has_need_vector: bool


class GoogleCalendarLinkStartResponse(BaseModel):
    authorization_url: str


class GoogleCalendarLinkCompleteRequest(BaseModel):
    code: str
    state: str


class GoogleCalendarStatusResponse(BaseModel):
    linked: bool
    google_email: EmailStr | None = None


class SchoolEmailPolicyResponse(BaseModel):
    allowed_domains: list[str]
    requires_verified_email: bool = True


class UserProgressResponse(BaseModel):
    hosted_sessions: int
    joined_sessions: int
    study_groups_joined: int
    resources_shared: int
    current_streak_days: int
    credibility_score: float
    ratings_count: int


class UserSettingsResponse(BaseModel):
    email_alerts: bool
    calendar_auto_meet: bool
    adaptive_layout: bool
    desktop_reminders: bool
    reminder_minutes_before: int


class UserSettingsUpdate(BaseModel):
    email_alerts: bool
    calendar_auto_meet: bool
    adaptive_layout: bool
    desktop_reminders: bool
    reminder_minutes_before: int = Field(ge=5, le=1440)


class SessionCreate(BaseModel):
    course_id: UUID
    classroom_name: str = Field(min_length=2, max_length=120)
    topic_focus: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=1500)
    start_time: datetime
    end_time: datetime
    meet_link: str | None = None
    generate_meet: bool = False
    reminder_minutes_before: int | None = Field(default=None, ge=5, le=1440)
    invite_emails: list[EmailStr] = Field(default_factory=list)


class SessionParticipantResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr
    status: str
    joined_at: datetime


class SessionResponse(BaseModel):
    id: UUID
    course_id: UUID
    course_title: str
    host_user_id: UUID
    host_name: str | None
    classroom_name: str
    topic_focus: str
    description: str | None
    start_time: datetime
    end_time: datetime
    meet_link: str | None
    calendar_event_id: str | None
    status: str
    participant_count: int
    invited_count: int
    joined: bool
    average_rating: float | None
    participants: list[SessionParticipantResponse]


class SessionRatingCreate(BaseModel):
    score: int = Field(ge=1, le=5)
    feedback: str | None = Field(default=None, max_length=1000)


class SessionRatingResponse(BaseModel):
    session_id: UUID
    tutor_user_id: UUID
    score: int
    feedback: str | None
    created_at: datetime


class MatchResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str | None
    distance: float
    match_score: float | None = None
    complementarity_score: float | None = None
    credibility_score: float | None = None
    matching_strategy: str | None = None


class CourseSummaryResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    instructor_id: UUID
    sessions_count: int
    resources_count: int


class ResourceSummaryResponse(BaseModel):
    id: UUID
    course_id: UUID
    session_id: UUID | None
    title: str
    url: str
    storage_path: str | None
    file_name: str | None
    mime_type: str | None
    file_size_bytes: int | None
    resource_type: str
    created_at: datetime


class StudyGroupMemberResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr
    status: str
    attendance_count: int
    joined_at: datetime
    last_active_at: datetime


class StudyGroupResponse(BaseModel):
    id: UUID
    course_id: UUID
    course_title: str
    topic_focus: str
    scheduled_start: datetime
    scheduled_end: datetime
    target_size: int
    min_size: int
    max_size: int
    attendance_required: bool
    inactive_after_days: int
    system_suggested: bool
    status: str
    member_count: int
    open_slots: int
    joined: bool
    members: list[StudyGroupMemberResponse]


class StudyGroupCreate(BaseModel):
    course_id: UUID
    topic_focus: str = Field(min_length=3, max_length=200)
    scheduled_start: datetime
    scheduled_end: datetime
    target_size: int = Field(default=6, ge=5, le=15)


class StudyGroupRecommendationResponse(BaseModel):
    course_id: UUID
    course_title: str
    enrolled_count: int
    recommendation_type: str
    message: str
    suggested_group: StudyGroupResponse | None = None
    suggested_topic_focus: str | None = None
    suggested_start: datetime | None = None
    suggested_end: datetime | None = None
    complementary_signals: list[str] = Field(default_factory=list)


class ChatContactResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr
    credibility_score: float
    ratings_count: int


# ── Friends ──────────────────────────────────────────────────────────────────

class UserSearchResult(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr


class FriendAddRequest(BaseModel):
    friend_user_id: UUID


class FriendEntryResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr
    mutual_sessions: int
    streak_days: int


# ─────────────────────────────────────────────────────────────────────────────

class ChatConversationCreate(BaseModel):
    peer_user_id: UUID


class ChatConversationSummaryResponse(BaseModel):
    conversation_id: UUID
    peer: ChatContactResponse
    last_message: str | None
    last_message_at: datetime | None
    unread_count: int


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class ChatMessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_user_id: UUID
    sender_full_name: str | None
    content: str
    created_at: datetime


class TutorLeaderboardEntryResponse(BaseModel):
    rank: int
    user_id: UUID
    full_name: str | None
    email: EmailStr
    tutor_points: int
    total_points: int
    credibility_score: float
    ratings_count: int
    sessions_hosted: int
    badges: list["TutorBadgeResponse"] = Field(default_factory=list)


class StudentLeaderboardEntryResponse(BaseModel):
    rank: int
    user_id: UUID
    full_name: str | None
    email: EmailStr
    study_points: int
    total_points: int
    sessions_joined: int
    resources_shared: int
    streak_days: int
    study_groups_joined: int


class TutorBadgeResponse(BaseModel):
    code: str
    label: str
    description: str


class TutorReviewResponse(BaseModel):
    session_id: UUID
    score: int
    feedback: str | None
    created_at: datetime
    rater_name: str | None


class TutorDirectoryEntryResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr
    year_of_study: str | None
    faculty: str | None
    campus: str | None
    current_courses: list[str]
    strengths: str | None
    qualifications: str | None
    tutoring_experience: str | None
    available_for_tutoring: bool
    credibility_score: float
    ratings_count: int
    upcoming_sessions_count: int
    badges: list[TutorBadgeResponse]


class TutorSuggestionResponse(TutorDirectoryEntryResponse):
    match_score: float
    match_reason: str
    topic_overlaps: list[str]


class TutorProfilePublicResponse(BaseModel):
    user_id: UUID
    full_name: str | None
    email: EmailStr
    year_of_study: str | None
    faculty: str | None
    campus: str | None
    major: str | None
    minor: str | None
    current_courses: list[str]
    strengths: str | None
    qualifications: str | None
    tutoring_experience: str | None
    available_for_tutoring: bool
    credibility_score: float
    ratings_count: int
    badges: list[TutorBadgeResponse]
    recent_reviews: list[TutorReviewResponse]


class ProgressPointResponse(BaseModel):
    label: str
    hosted_sessions: int
    joined_sessions: int


class SessionHistoryItemResponse(BaseModel):
    role: str
    topic_focus: str
    classroom_name: str
    start_time: datetime
    end_time: datetime


class UserAnalyticsResponse(BaseModel):
    hosted_sessions: int
    joined_sessions: int
    study_groups_joined: int
    resources_shared: int
    current_streak_days: int
    milestones: list[str]
    progress_points: list[ProgressPointResponse]
    session_history: list[SessionHistoryItemResponse]
