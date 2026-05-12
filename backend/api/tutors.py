from __future__ import annotations

import math
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from backend.api.schemas import (
    TutorBadgeResponse,
    TutorDirectoryEntryResponse,
    TutorProfilePublicResponse,
    TutorReviewResponse,
    TutorSuggestionResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Session as StudySession
from backend.models import SessionRating, User, UserProfile


router = APIRouter(prefix="/tutors", tags=["tutors"])

# ---------------------------------------------------------------------------
# Matching helpers
# ---------------------------------------------------------------------------

_STOP_WORDS = {
    "and", "or", "the", "for", "with", "from", "this", "that", "have",
    "has", "are", "was", "not", "but", "can", "will", "also", "all",
}

_PRIOR_RATING = 3.0   # Bayesian prior: assume an unrated tutor is average
_PRIOR_WEIGHT = 5     # Equivalent prior sample size


def _token_set(text: str | None) -> set[str]:
    """Lowercase word tokens longer than 2 characters, excluding stop words."""
    if not text:
        return set()
    raw = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#]*\b", text)
    return {w.lower() for w in raw if len(w) > 2 and w.lower() not in _STOP_WORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _course_overlap(user_courses: list[str], tutor_courses: list[str]) -> float:
    """Fraction of user's courses that the tutor's profile covers."""
    user_set = {c.strip().lower() for c in user_courses if c.strip()}
    tutor_set = {c.strip().lower() for c in tutor_courses if c.strip()}
    if not user_set:
        return 0.0
    return len(user_set & tutor_set) / len(user_set)


def _calibrate_score(raw_score: float, min_score: float = 0.25, max_score: float = 0.95) -> float:
    calibrated = min_score + (max_score - min_score) * raw_score
    return min(1.0, max(0.0, calibrated))


def _bayesian_credibility(score: float, count: int) -> float:
    """Bayesian-smoothed rating normalised to [0, 1].

    Uses a Bayesian average with a weak prior centred at 3/5 to discount
    tutors who have very few ratings (avoiding cold-start inflation).
    """
    smoothed = (_PRIOR_WEIGHT * _PRIOR_RATING + count * score) / (_PRIOR_WEIGHT + count)
    return smoothed / 5.0


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Pure-Python cosine similarity as a fallback when SQL can't be used."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _composite_score(
    *,
    vector_sim: float,
    keyword_jaccard: float,
    course_overlap: float,
    bayesian_cred: float,
    available: bool,
    has_upcoming: bool,
    same_campus: bool,
    same_faculty: bool,
) -> float:
    raw = (
        0.40 * vector_sim
        + 0.25 * keyword_jaccard
        + 0.15 * course_overlap
        + 0.15 * bayesian_cred
        + 0.02 * (1.0 if available else 0.0)
        + 0.01 * (1.0 if has_upcoming else 0.0)
        + 0.02 * (1.0 if same_campus else 0.0)
        + 0.02 * (1.0 if same_faculty else 0.0)
    )
    return min(raw, 1.0)


def _build_match_reason(
    *,
    vector_sim: float,
    keyword_jaccard: float,
    course_overlap: float,
    overlapping_tokens: set[str],
    same_campus: bool,
    same_faculty: bool,
) -> str:
    reasons: list[str] = []
    if overlapping_tokens:
        topics = ", ".join(sorted(overlapping_tokens)[:3])
        reasons.append(f"covers {topics}")
    elif vector_sim >= 0.6:
        reasons.append("strong semantic topic alignment")
    if course_overlap > 0:
        reasons.append("shares courses with you")
    if same_faculty and same_campus:
        reasons.append("same faculty and campus")
    elif same_faculty:
        reasons.append("same faculty")
    elif same_campus:
        reasons.append("same campus")
    if not reasons:
        reasons.append("general topic match")
    return "Suggested because: " + "; ".join(reasons) + "."


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


@router.get("/suggestions", response_model=list[TutorSuggestionResponse])
def suggest_tutors(
    limit: int = 8,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TutorSuggestionResponse]:
    """Return ranked tutor suggestions personalised to the current user.

    Scoring combines five signals:
      1. pgvector cosine similarity  – need_vector vs offer_vector  (40 %)
      2. Keyword Jaccard overlap     – weak_topics vs strengths     (25 %)
      3. Course overlap              – shared current_courses       (15 %)
      4. Bayesian-smoothed rating    – credibility without cold-start bias (15 %)
      5. Structural bonuses          – campus / faculty / availability (5 %)
    """
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 50")

    now = datetime.now(timezone.utc)

    my_profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )

    my_need_vector: list[float] | None = my_profile.need_vector if my_profile else None
    my_weak_tokens = _token_set(my_profile.weak_topics if my_profile else None)
    my_courses = list(my_profile.current_courses or []) if my_profile else []
    my_campus = (my_profile.campus or "").strip().lower() if my_profile else ""
    my_faculty = (my_profile.faculty or "").strip().lower() if my_profile else ""

    upcoming_alias = aliased(StudySession)

    candidate_query = (
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
        .filter(User.id != current_user.id)
        .filter(UserProfile.available_for_tutoring.is_(True))
        .group_by(User.id, UserProfile.id)
    )

    # Pull a larger candidate pool (top 80 by credibility) to re-rank in Python.
    # If we have the user's need_vector, pre-filter using pgvector cosine distance
    # so candidates are already semantically relevant before Python re-ranking.
    if my_need_vector is not None:
        try:
            candidate_query = candidate_query.order_by(
                UserProfile.offer_vector.cosine_distance(my_need_vector).asc().nulls_last(),
                UserProfile.credibility_score.desc(),
            )
        except Exception:
            # Graceful degradation if pgvector operator is unavailable
            candidate_query = candidate_query.order_by(UserProfile.credibility_score.desc())
    else:
        candidate_query = candidate_query.order_by(UserProfile.credibility_score.desc())

    rows = candidate_query.limit(80).all()

    results: list[tuple[float, TutorSuggestionResponse]] = []

    for user, profile, upcoming_sessions_count, sessions_hosted in rows:
        tutor_offer_vector: list[float] | None = profile.offer_vector

        # Signal 1: vector cosine similarity
        if my_need_vector and tutor_offer_vector:
            vector_sim = max(0.0, _cosine_similarity(my_need_vector, tutor_offer_vector))
        else:
            vector_sim = 0.0

        # Signal 2: keyword Jaccard
        tutor_tokens = _token_set(profile.strengths) | _token_set(profile.qualifications)
        overlapping = my_weak_tokens & tutor_tokens
        keyword_jaccard = _jaccard(my_weak_tokens, tutor_tokens)

        # Signal 3: course overlap
        course_ov = _course_overlap(my_courses, list(profile.current_courses or []))

        # Signal 4: Bayesian credibility
        bayes_cred = _bayesian_credibility(
            float(profile.credibility_score or 0.0),
            int(profile.ratings_count or 0),
        )

        # Signal 5: structural bonuses
        tutor_campus = (profile.campus or "").strip().lower()
        tutor_faculty = (profile.faculty or "").strip().lower()
        same_campus = bool(my_campus and tutor_campus and my_campus == tutor_campus)
        same_faculty = bool(my_faculty and tutor_faculty and my_faculty == tutor_faculty)
        has_upcoming = int(upcoming_sessions_count or 0) > 0

        raw_score = _composite_score(
            vector_sim=vector_sim,
            keyword_jaccard=keyword_jaccard,
            course_overlap=course_ov,
            bayesian_cred=bayes_cred,
            available=profile.available_for_tutoring,
            has_upcoming=has_upcoming,
            same_campus=same_campus,
            same_faculty=same_faculty,
        )
        score = _calibrate_score(raw_score)

        reason = _build_match_reason(
            vector_sim=vector_sim,
            keyword_jaccard=keyword_jaccard,
            course_overlap=course_ov,
            overlapping_tokens=overlapping,
            same_campus=same_campus,
            same_faculty=same_faculty,
        )

        entry = TutorSuggestionResponse(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            year_of_study=profile.year_of_study,
            faculty=profile.faculty,
            campus=profile.campus,
            current_courses=list(profile.current_courses or []),
            strengths=profile.strengths,
            qualifications=profile.qualifications,
            tutoring_experience=profile.tutoring_experience,
            available_for_tutoring=profile.available_for_tutoring,
            credibility_score=float(profile.credibility_score or 0.0),
            ratings_count=int(profile.ratings_count or 0),
            upcoming_sessions_count=int(upcoming_sessions_count or 0),
            badges=_build_badges(
                profile=profile,
                sessions_hosted=int(sessions_hosted or 0),
                upcoming_sessions_count=int(upcoming_sessions_count or 0),
            ),
            match_score=round(score, 4),
            match_reason=reason,
            topic_overlaps=sorted(overlapping)[:6],
        )
        results.append((score, entry))

    results.sort(key=lambda pair: pair[0], reverse=True)
    return [entry for _, entry in results[:limit]]


@router.get("/search", response_model=list[TutorDirectoryEntryResponse])
def search_tutors(
    q: str | None = None,
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

    if q:
        needle = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(User.full_name).like(needle),
                func.lower(User.email).like(needle),
                func.lower(UserProfile.strengths).like(needle),
                func.lower(UserProfile.qualifications).like(needle),
                func.lower(func.array_to_string(UserProfile.current_courses, " ")).like(needle),
            )
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
