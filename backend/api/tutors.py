from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from backend.api.schemas import (
    TutorBadgeResponse,
    TutorDirectoryEntryResponse,
    TutorProfilePublicResponse,
    TutorReviewResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Session as StudySession
from backend.models import SessionRating, User, UserProfile


router = APIRouter(prefix="/tutors", tags=["tutors"])


def _build_badges(
    *,
    profile: UserProfile | None,
    sessions_hosted: int,
    upcoming_sessions_count: int,
) -> list[TutorBadgeResponse]:
    badges: list[TutorBadgeResponse] = []
    credibility = float(profile.credibility_score if profile else 0.0)
    ratings_count = int(profile.ratings_count if profile else 0)
    strengths_text = (profile.strengths or "").lower() if profile else ""

    if ratings_count >= 10 and credibility >= 4.5:
        badges.append(
            TutorBadgeResponse(
                code="top-peer-tutor",
                label="Top Peer Tutor",
                description="Maintains a high rating with substantial student feedback.",
            )
        )
    if ratings_count >= 5 and credibility >= 4.0:
        badges.append(
            TutorBadgeResponse(
                code="helpful-peer",
                label="Helpful Peer",
                description="Consistently receives positive reviews from peers.",
            )
        )
    if "math" in strengths_text and credibility >= 4.0:
        badges.append(
            TutorBadgeResponse(
                code="top-math-tutor",
                label="Top Math Tutor",
                description="Recognized for strong support in math subjects.",
            )
        )
    if sessions_hosted >= 8:
        badges.append(
            TutorBadgeResponse(
                code="session-leader",
                label="Session Leader",
                description="Has hosted many study sessions for the community.",
            )
        )
    if upcoming_sessions_count >= 1:
        badges.append(
            TutorBadgeResponse(
                code="available-now",
                label="Available Tutor",
                description="Has upcoming tutoring availability.",
            )
        )
    return badges


@router.get("/search", response_model=list[TutorDirectoryEntryResponse])
def search_tutors(
    subject: str | None = None,
    grade_level: str | None = None,
    min_rating: float = 0.0,
    campus: str | None = None,
    faculty: str | None = None,
    available_only: bool = False,
    limit: int = 25,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TutorDirectoryEntryResponse]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    if min_rating < 0 or min_rating > 5:
        raise HTTPException(status_code=400, detail="min_rating must be between 0 and 5")

    now = datetime.now(timezone.utc)
    upcoming_alias = aliased(StudySession)

    query = (
        db.query(
            User,
            UserProfile,
            func.count(func.distinct(upcoming_alias.id)).label("upcoming_sessions_count"),
            func.count(func.distinct(StudySession.id)).label("sessions_hosted"),
        )
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(
            upcoming_alias,
            and_(upcoming_alias.host_user_id == User.id, upcoming_alias.start_time >= now),
        )
        .outerjoin(StudySession, StudySession.host_user_id == User.id)
        .group_by(User.id, UserProfile.id)
    )

    if subject:
        needle = f"%{subject.lower()}%"
        query = query.filter(
            or_(
                func.lower(UserProfile.strengths).like(needle),
                func.lower(UserProfile.qualifications).like(needle),
                func.lower(func.array_to_string(UserProfile.current_courses, " ")).like(needle),
            )
        )
    if grade_level:
        query = query.filter(func.lower(UserProfile.year_of_study) == grade_level.lower())
    if campus:
        query = query.filter(func.lower(UserProfile.campus) == campus.lower())
    if faculty:
        query = query.filter(func.lower(UserProfile.faculty) == faculty.lower())
    if available_only:
        query = query.filter(UserProfile.available_for_tutoring.is_(True))
    if min_rating > 0:
        query = query.filter(UserProfile.credibility_score >= min_rating)

    rows = (
        query.order_by(
            UserProfile.credibility_score.desc(),
            UserProfile.ratings_count.desc(),
            func.count(func.distinct(upcoming_alias.id)).desc(),
            User.full_name.asc().nulls_last(),
        )
        .limit(limit)
        .all()
    )

    return [
        TutorDirectoryEntryResponse(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            year_of_study=profile.year_of_study,
            faculty=profile.faculty,
            campus=profile.campus,
            current_courses=profile.current_courses,
            strengths=profile.strengths,
            qualifications=profile.qualifications,
            tutoring_experience=profile.tutoring_experience,
            available_for_tutoring=profile.available_for_tutoring,
            credibility_score=float(profile.credibility_score),
            ratings_count=int(profile.ratings_count),
            upcoming_sessions_count=int(upcoming_sessions_count or 0),
            badges=_build_badges(
                profile=profile,
                sessions_hosted=int(sessions_hosted or 0),
                upcoming_sessions_count=int(upcoming_sessions_count or 0),
            ),
        )
        for user, profile, upcoming_sessions_count, sessions_hosted in rows
    ]


@router.get("/{user_id}/reviews", response_model=list[TutorReviewResponse])
def list_tutor_reviews(
    user_id: str,
    limit: int = 20,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TutorReviewResponse]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    rater_alias = aliased(User)
    rows = (
        db.query(SessionRating, rater_alias.full_name.label("rater_name"))
        .join(rater_alias, rater_alias.id == SessionRating.rater_user_id)
        .filter(SessionRating.tutor_user_id == user_id)
        .order_by(SessionRating.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        TutorReviewResponse(
            session_id=rating.session_id,
            score=rating.score,
            feedback=rating.feedback,
            created_at=rating.created_at,
            rater_name=rater_name,
        )
        for rating, rater_name in rows
    ]


@router.get("/{user_id}", response_model=TutorProfilePublicResponse)
def get_tutor_profile(
    user_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TutorProfilePublicResponse:
    row = (
        db.query(
            User,
            UserProfile,
            func.count(func.distinct(StudySession.id)).label("sessions_hosted"),
            func.count(func.distinct(StudySession.id)).filter(StudySession.start_time >= datetime.now(timezone.utc)).label("upcoming_sessions_count"),
        )
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(StudySession, StudySession.host_user_id == User.id)
        .filter(User.id == user_id)
        .group_by(User.id, UserProfile.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Tutor profile not found")

    user, profile, sessions_hosted, upcoming_sessions_count = row
    recent_reviews = list_tutor_reviews(user_id=user_id, limit=10, _=user, db=db)
    badges = _build_badges(
        profile=profile,
        sessions_hosted=int(sessions_hosted or 0),
        upcoming_sessions_count=int(upcoming_sessions_count or 0),
    )

    return TutorProfilePublicResponse(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        year_of_study=profile.year_of_study,
        faculty=profile.faculty,
        campus=profile.campus,
        major=profile.major,
        minor=profile.minor,
        current_courses=profile.current_courses,
        strengths=profile.strengths,
        qualifications=profile.qualifications,
        tutoring_experience=profile.tutoring_experience,
        available_for_tutoring=profile.available_for_tutoring,
        credibility_score=float(profile.credibility_score),
        ratings_count=int(profile.ratings_count),
        badges=badges,
        recent_reviews=recent_reviews,
    )
