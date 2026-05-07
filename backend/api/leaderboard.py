from __future__ import annotations

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
from backend.services.points_engine import recompute_all_user_points


router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


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

    points_map = recompute_all_user_points(db)
    rows = (db.query(User, UserProfile, func.count(StudySession.id).label("sessions_hosted"))
            .join(UserProfile, UserProfile.user_id == User.id)
            .outerjoin(StudySession, StudySession.host_user_id == User.id)
            .group_by(User.id, UserProfile.id).all())

    entries = []
    for user, profile, sessions_hosted in rows:
        points = points_map.get(str(user.id))
        if not points:
            continue
        entries.append(TutorLeaderboardEntryResponse(
            rank=0,
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            tutor_points=int(points.tutor_points),
            total_points=int(points.total_points),
            credibility_score=float(profile.credibility_score),
            ratings_count=int(profile.ratings_count),
            sessions_hosted=int(sessions_hosted or 0),
            badges=_build_badges(profile=profile, sessions_hosted=int(sessions_hosted or 0)),
        ))

    entries.sort(key=lambda x: (x.tutor_points, x.credibility_score, x.ratings_count, x.sessions_hosted), reverse=True)
    ranked = entries[:limit]
    return [TutorLeaderboardEntryResponse(rank=i + 1, **x.model_dump(exclude={"rank"})) for i, x in enumerate(ranked)]


@router.get("/students", response_model=list[StudentLeaderboardEntryResponse])
def get_student_leaderboard(
    limit: int = 10,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudentLeaderboardEntryResponse]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    points_map = recompute_all_user_points(db)
    users = db.query(User).order_by(User.created_at.asc()).all()
    entries = []
    for user in users:
        points = points_map.get(str(user.id))
        if not points:
            continue
        entries.append(StudentLeaderboardEntryResponse(
            rank=0,
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            study_points=points.study_points,
            total_points=points.total_points,
            sessions_joined=points.sessions_joined,
            resources_shared=points.resources_shared,
            streak_days=points.streak_days,
            study_groups_joined=points.study_groups_joined,
        ))

    entries.sort(key=lambda x: (x.study_points, x.total_points, x.sessions_joined, x.resources_shared, x.streak_days), reverse=True)
    ranked = entries[:limit]
    return [StudentLeaderboardEntryResponse(rank=i + 1, **x.model_dump(exclude={"rank"})) for i, x in enumerate(ranked)]
