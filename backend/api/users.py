from __future__ import annotations

from datetime import datetime, timedelta, timezone
from itertools import chain

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.schemas import (
    GoogleCalendarLinkCompleteRequest,
    GoogleCalendarLinkStartResponse,
    GoogleCalendarStatusResponse,
    SchoolEmailPolicyResponse,
    ProgressPointResponse,
    SessionHistoryItemResponse,
    UserAnalyticsResponse,
    UserProfileDetailResponse,
    UserProgressResponse,
    UserProfileResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    UserProfileUpsert,
    UserResponse,
)
from backend.auth import get_allowed_school_domains
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import (
    GoogleCalendarConnection,
    Resource,
    Session as StudySession,
    SessionParticipant,
    StudyGroupMember,
    User,
    UserProfile,
    UserSettings,
)
from backend.services.google_calendar_oauth import (
    build_google_calendar_authorization_url,
    consume_oauth_state_for_user,
    create_oauth_state_for_user,
    exchange_code_for_tokens,
    fetch_google_user_email,
)


router = APIRouter(prefix="/users", tags=["users"])


def _calculate_current_streak_days(activity_dates: list[datetime]) -> int:
    if not activity_dates:
        return 0

    ordered_days = sorted({item.date() for item in activity_dates}, reverse=True)
    streak = 0
    previous_day = None
    for day in ordered_days:
        if previous_day is None:
            streak = 1
            previous_day = day
            continue
        if (previous_day - day).days == 1:
            streak += 1
            previous_day = day
            continue
        break
    return streak


def _compute_profile_milestones(
    *,
    hosted_sessions: int,
    joined_sessions: int,
    ratings_count: int,
    credibility_score: float,
) -> list[str]:
    milestones: list[str] = []
    if hosted_sessions >= 1:
        milestones.append("First tutoring session hosted")
    if hosted_sessions >= 5:
        milestones.append("Consistent tutor: hosted 5+ sessions")
    if joined_sessions >= 10:
        milestones.append("Collaborative learner: joined 10+ sessions")
    if ratings_count >= 5:
        milestones.append("Community verified: earned 5+ ratings")
    if ratings_count >= 10 and credibility_score >= 4.5:
        milestones.append("Top-rated tutor: 4.5+ score with 10+ ratings")
    return milestones


@router.get("/auth-policy", response_model=SchoolEmailPolicyResponse)
def get_auth_policy() -> SchoolEmailPolicyResponse:
    return SchoolEmailPolicyResponse(allowed_domains=get_allowed_school_domains())


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        firebase_uid=current_user.firebase_uid,
        email=current_user.email,
        full_name=current_user.full_name,
    )


@router.get("/me/progress", response_model=UserProgressResponse)
def get_my_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProgressResponse:
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    hosted_sessions = len(current_user.hosted_sessions)
    joined_session_rows = db.query(SessionParticipant).filter(SessionParticipant.user_id == current_user.id).all()
    joined_sessions = len(joined_session_rows)
    joined_group_rows = db.query(StudyGroupMember).filter(StudyGroupMember.user_id == current_user.id).all()
    resources_shared = db.query(Resource).filter(Resource.uploaded_by_user_id == current_user.id).count()

    activity_dates = list(
        chain(
            [session.created_at for session in current_user.hosted_sessions],
            [item.joined_at for item in joined_session_rows],
            [item.joined_at for item in joined_group_rows],
        )
    )

    return UserProgressResponse(
        hosted_sessions=hosted_sessions,
        joined_sessions=joined_sessions,
        study_groups_joined=len(joined_group_rows),
        resources_shared=resources_shared,
        current_streak_days=_calculate_current_streak_days(activity_dates),
        credibility_score=float(profile.credibility_score if profile else 0.0),
        ratings_count=int(profile.ratings_count if profile else 0),
    )


@router.get("/me/analytics", response_model=UserAnalyticsResponse)
def get_my_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserAnalyticsResponse:
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    hosted_rows = db.query(StudySession).filter(StudySession.host_user_id == current_user.id).all()
    joined_rows = db.query(SessionParticipant).filter(SessionParticipant.user_id == current_user.id).all()
    joined_group_rows = db.query(StudyGroupMember).filter(StudyGroupMember.user_id == current_user.id).all()
    resources_shared = db.query(Resource).filter(Resource.uploaded_by_user_id == current_user.id).count()

    now = datetime.now(timezone.utc)
    labels = []
    for offset in range(5, -1, -1):
        cursor = (now.replace(day=1) - timedelta(days=offset * 30)).replace(day=1)
        labels.append(cursor.strftime("%b %Y"))

    label_to_counts: dict[str, dict[str, int]] = {
        label: {"hosted": 0, "joined": 0}
        for label in labels
    }

    for row in hosted_rows:
        label = row.start_time.strftime("%b %Y")
        if label in label_to_counts:
            label_to_counts[label]["hosted"] += 1

    for row in joined_rows:
        label = row.joined_at.strftime("%b %Y")
        if label in label_to_counts:
            label_to_counts[label]["joined"] += 1

    progress_points = [
        ProgressPointResponse(
            label=label,
            hosted_sessions=label_to_counts[label]["hosted"],
            joined_sessions=label_to_counts[label]["joined"],
        )
        for label in labels
    ]

    activity_dates = list(
        chain(
            [session.created_at for session in hosted_rows],
            [item.joined_at for item in joined_rows],
            [item.joined_at for item in joined_group_rows],
        )
    )

    credibility_score = float(profile.credibility_score if profile else 0.0)
    ratings_count = int(profile.ratings_count if profile else 0)
    milestones = _compute_profile_milestones(
        hosted_sessions=len(hosted_rows),
        joined_sessions=len(joined_rows),
        ratings_count=ratings_count,
        credibility_score=credibility_score,
    )

    return UserAnalyticsResponse(
        hosted_sessions=len(hosted_rows),
        joined_sessions=len(joined_rows),
        study_groups_joined=len(joined_group_rows),
        resources_shared=resources_shared,
        current_streak_days=_calculate_current_streak_days(activity_dates),
        milestones=milestones,
        progress_points=progress_points,
        session_history=[
            SessionHistoryItemResponse(
                role="host",
                topic_focus=session.topic_focus,
                classroom_name=session.classroom_name,
                start_time=session.start_time,
                end_time=session.end_time,
            )
            for session in sorted(hosted_rows, key=lambda item: item.start_time, reverse=True)[:6]
        ]
        + [
            SessionHistoryItemResponse(
                role="participant",
                topic_focus=row.session.topic_focus,
                classroom_name=row.session.classroom_name,
                start_time=row.session.start_time,
                end_time=row.session.end_time,
            )
            for row in (
                db.query(SessionParticipant)
                .join(StudySession, StudySession.id == SessionParticipant.session_id)
                .filter(SessionParticipant.user_id == current_user.id)
                .order_by(StudySession.start_time.desc())
                .limit(6)
                .all()
            )
        ],
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
    current_user.full_name = payload.full_name

    if not profile:
        profile = UserProfile(
            user_id=current_user.id,
            year_of_study=payload.year_of_study,
            faculty=payload.faculty,
            campus=payload.campus,
            major=payload.major,
            minor=payload.minor,
            current_courses=payload.current_courses,
            qualifications=payload.qualifications,
            tutoring_experience=payload.tutoring_experience,
            available_for_tutoring=payload.available_for_tutoring,
            strengths=payload.strengths,
            weak_topics=payload.weak_topics,
            bio=payload.bio,
            interests=payload.interests,
            embedding=payload.embedding,
        )
    else:
        profile.year_of_study = payload.year_of_study
        profile.faculty = payload.faculty
        profile.campus = payload.campus
        profile.major = payload.major
        profile.minor = payload.minor
        profile.current_courses = payload.current_courses
        profile.qualifications = payload.qualifications
        profile.tutoring_experience = payload.tutoring_experience
        profile.available_for_tutoring = payload.available_for_tutoring
        profile.strengths = payload.strengths
        profile.weak_topics = payload.weak_topics
        profile.bio = payload.bio
        profile.interests = payload.interests
        profile.embedding = payload.embedding

    db.add(current_user)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    db.refresh(current_user)

    return UserProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        full_name=current_user.full_name,
        year_of_study=profile.year_of_study,
        faculty=profile.faculty,
        campus=profile.campus,
        major=profile.major,
        minor=profile.minor,
        current_courses=profile.current_courses,
        qualifications=profile.qualifications,
        tutoring_experience=profile.tutoring_experience,
        available_for_tutoring=profile.available_for_tutoring,
        strengths=profile.strengths,
        weak_topics=profile.weak_topics,
        credibility_score=profile.credibility_score,
        ratings_count=profile.ratings_count,
        bio=profile.bio,
        interests=profile.interests,
        has_embedding=profile.embedding is not None,
    )


@router.get("/me/profile", response_model=UserProfileDetailResponse)
def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileDetailResponse:
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        return UserProfileDetailResponse(
            user_id=current_user.id,
            full_name=current_user.full_name,
            year_of_study=None,
            faculty=None,
            campus=None,
            major=None,
            minor=None,
            current_courses=[],
            qualifications=None,
            tutoring_experience=None,
            available_for_tutoring=True,
            strengths=None,
            weak_topics=None,
            credibility_score=0,
            ratings_count=0,
            bio=None,
            interests=None,
            has_embedding=False,
        )

    return UserProfileDetailResponse(
        user_id=profile.user_id,
        full_name=current_user.full_name,
        year_of_study=profile.year_of_study,
        faculty=profile.faculty,
        campus=profile.campus,
        major=profile.major,
        minor=profile.minor,
        current_courses=profile.current_courses,
        qualifications=profile.qualifications,
        tutoring_experience=profile.tutoring_experience,
        available_for_tutoring=profile.available_for_tutoring,
        strengths=profile.strengths,
        weak_topics=profile.weak_topics,
        credibility_score=profile.credibility_score,
        ratings_count=profile.ratings_count,
        bio=profile.bio,
        interests=profile.interests,
        has_embedding=profile.embedding is not None,
    )


def _get_or_create_user_settings(*, current_user: User, db: Session) -> UserSettings:
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if settings:
        return settings

    settings = UserSettings(user_id=current_user.id)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/me/settings", response_model=UserSettingsResponse)
def get_my_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingsResponse:
    settings = _get_or_create_user_settings(current_user=current_user, db=db)
    return UserSettingsResponse(
        email_alerts=settings.email_alerts,
        calendar_auto_meet=settings.calendar_auto_meet,
        adaptive_layout=settings.adaptive_layout,
        desktop_reminders=settings.desktop_reminders,
        reminder_minutes_before=settings.reminder_minutes_before,
    )


@router.put("/me/settings", response_model=UserSettingsResponse)
def update_my_settings(
    payload: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingsResponse:
    settings = _get_or_create_user_settings(current_user=current_user, db=db)
    settings.email_alerts = payload.email_alerts
    settings.calendar_auto_meet = payload.calendar_auto_meet
    settings.adaptive_layout = payload.adaptive_layout
    settings.desktop_reminders = payload.desktop_reminders
    settings.reminder_minutes_before = payload.reminder_minutes_before
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return UserSettingsResponse(
        email_alerts=settings.email_alerts,
        calendar_auto_meet=settings.calendar_auto_meet,
        adaptive_layout=settings.adaptive_layout,
        desktop_reminders=settings.desktop_reminders,
        reminder_minutes_before=settings.reminder_minutes_before,
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
