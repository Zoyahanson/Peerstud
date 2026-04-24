from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.schemas import TutorBadgeResponse, TutorLeaderboardEntryResponse
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Session as StudySession, User, UserProfile


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
