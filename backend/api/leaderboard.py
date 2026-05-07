from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.schemas import (
    StudentLeaderboardEntryResponse,
    TutorBadgeResponse,
    TutorLeaderboardEntryResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Resource, Session as StudySession, SessionParticipant, StudyGroupMember, User, UserProfile


router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _calculate_streak_days(activity_dates: list[datetime | None]) -> int:
    valid_dates = [item for item in activity_dates if item is not None]
    if not valid_dates:
        return 0

    ordered_days = sorted({item.date() for item in valid_dates}, reverse=True)
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


def _build_badges(*, profile: UserProfile, sessions_hosted: int) -> list[TutorBadgeResponse]:
    badges: list[TutorBadgeResponse] = []
    strengths_text = (profile.strengths or "").lower()
    if profile.ratings_count >= 10 and profile.credibility_score >= 4.5:
        badges.append(
            TutorBadgeResponse(
                code="top-peer-tutor",
                label="Top Peer Tutor",
                description="Maintains excellent ratings across many tutoring sessions.",
            )
        )
    if profile.ratings_count >= 5 and profile.credibility_score >= 4.0:
        badges.append(
            TutorBadgeResponse(
                code="helpful-peer",
                label="Helpful Peer",
                description="Frequently rated positively by classmates.",
            )
        )
    if "math" in strengths_text and profile.credibility_score >= 4.0:
        badges.append(
            TutorBadgeResponse(
                code="top-math-tutor",
                label="Top Math Tutor",
                description="Recognized for high-quality math tutoring.",
            )
        )
    if sessions_hosted >= 8:
        badges.append(
            TutorBadgeResponse(
                code="session-leader",
                label="Session Leader",
                description="Has hosted many successful study sessions.",
            )
        )
    return badges


@router.get("/tutors", response_model=list[TutorLeaderboardEntryResponse])
def get_tutor_leaderboard(
    limit: int = 10,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TutorLeaderboardEntryResponse]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    rows = (
        db.query(
            User,
            UserProfile,
            func.count(StudySession.id).label("sessions_hosted"),
        )
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(StudySession, StudySession.host_user_id == User.id)
        .group_by(User.id, UserProfile.id)
        .order_by(
            UserProfile.credibility_score.desc(),
            UserProfile.ratings_count.desc(),
            func.count(StudySession.id).desc(),
            User.created_at.asc(),
        )
        .limit(limit)
        .all()
    )

    return [
        TutorLeaderboardEntryResponse(
            rank=index + 1,
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            credibility_score=float(profile.credibility_score),
            ratings_count=int(profile.ratings_count),
            sessions_hosted=int(sessions_hosted or 0),
            badges=_build_badges(profile=profile, sessions_hosted=int(sessions_hosted or 0)),
        )
        for index, (user, profile, sessions_hosted) in enumerate(rows)
    ]


@router.get("/students", response_model=list[StudentLeaderboardEntryResponse])
def get_student_leaderboard(
    limit: int = 10,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudentLeaderboardEntryResponse]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    users = db.query(User).order_by(User.created_at.asc()).all()

    joined_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(SessionParticipant.user_id, func.count(SessionParticipant.id))
            .group_by(SessionParticipant.user_id)
            .all()
        )
    }
    resource_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(Resource.uploaded_by_user_id, func.count(Resource.id))
            .group_by(Resource.uploaded_by_user_id)
            .all()
        )
    }
    group_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(StudyGroupMember.user_id, func.count(StudyGroupMember.id))
            .group_by(StudyGroupMember.user_id)
            .all()
        )
    }

    activity_by_user: dict[str, list[datetime | None]] = {}

    for user_id, joined_at in db.query(SessionParticipant.user_id, SessionParticipant.joined_at).all():
        key = str(user_id)
        activity_by_user.setdefault(key, []).append(joined_at)

    for user_id, joined_at in db.query(StudyGroupMember.user_id, StudyGroupMember.joined_at).all():
        key = str(user_id)
        activity_by_user.setdefault(key, []).append(joined_at)

    for user_id, created_at in db.query(Resource.uploaded_by_user_id, Resource.created_at).all():
        key = str(user_id)
        activity_by_user.setdefault(key, []).append(created_at)

    entries: list[StudentLeaderboardEntryResponse] = []
    for user in users:
        user_id = str(user.id)
        sessions_joined = joined_counts.get(user_id, 0)
        resources_shared = resource_counts.get(user_id, 0)
        study_groups_joined = group_counts.get(user_id, 0)
        streak_days = _calculate_streak_days(activity_by_user.get(user_id, []))

        study_points = (
            (sessions_joined * 10)
            + (resources_shared * 12)
            + (study_groups_joined * 8)
            + (streak_days * 6)
        )

        if study_points <= 0:
            continue

        entries.append(
            StudentLeaderboardEntryResponse(
                rank=0,
                user_id=user.id,
                full_name=user.full_name,
                email=user.email,
                study_points=study_points,
                sessions_joined=sessions_joined,
                resources_shared=resources_shared,
                streak_days=streak_days,
                study_groups_joined=study_groups_joined,
            )
        )

    entries.sort(
        key=lambda item: (
            item.study_points,
            item.sessions_joined,
            item.resources_shared,
            item.streak_days,
        ),
        reverse=True,
    )

    ranked = entries[:limit]
    return [
        StudentLeaderboardEntryResponse(
            rank=index + 1,
            user_id=item.user_id,
            full_name=item.full_name,
            email=item.email,
            study_points=item.study_points,
            sessions_joined=item.sessions_joined,
            resources_shared=item.resources_shared,
            streak_days=item.streak_days,
            study_groups_joined=item.study_groups_joined,
        )
        for index, item in enumerate(ranked)
    ]
