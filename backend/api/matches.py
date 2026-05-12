from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
import re

from backend.api.schemas import MatchResponse
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import User, UserProfile


router = APIRouter(prefix="/matches", tags=["matches"])

_STOP_WORDS = {
    "and", "or", "the", "for", "with", "from", "this", "that",
    "have", "has", "are", "was", "not", "but", "can", "will",
    "also", "all",
}


def _token_set(text: str | None) -> set[str]:
    if not text:
        return set()
    raw_tokens = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#]*\b", text)
    return {token.lower() for token in raw_tokens if len(token) > 2 and token.lower() not in _STOP_WORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _course_overlap(user_courses: list[str] | None, other_courses: list[str] | None) -> float:
    user_set = {course.strip().lower() for course in (user_courses or []) if course and course.strip()}
    other_set = {course.strip().lower() for course in (other_courses or []) if course and course.strip()}
    if not user_set or not other_set:
        return 0.0
    return len(user_set & other_set) / len(user_set | other_set)


def _calibrate_score(raw_score: float, min_score: float = 0.25, max_score: float = 0.95) -> float:
    calibrated = min_score + (max_score - min_score) * raw_score
    return min(1.0, max(0.0, calibrated))


def _profile_complementarity(my_profile: UserProfile, their_profile: UserProfile) -> float:
    my_needs = _token_set(my_profile.need_text) | _token_set(my_profile.weak_topics)
    their_offers = _token_set(their_profile.offer_text) | _token_set(their_profile.strengths)
    my_offers = _token_set(my_profile.offer_text) | _token_set(my_profile.strengths)
    their_needs = _token_set(their_profile.need_text) | _token_set(their_profile.weak_topics)

    need_match = _jaccard(my_needs, their_offers)
    offer_match = _jaccard(my_offers, their_needs)
    course_match = _course_overlap(my_profile.current_courses, their_profile.current_courses)
    asymmetric_bonus = max(need_match, offer_match)

    return min(1.0, (need_match + offer_match + course_match + asymmetric_bonus) / 4.0)


@router.get("", response_model=list[MatchResponse])
def get_matches(
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MatchResponse]:
    if limit < 1 or limit > 25:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="limit must be between 1 and 25",
        )

    my_profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not my_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user profile is required for matching",
        )

    if my_profile.offer_vector is not None and my_profile.need_vector is not None:
        they_cover_my_needs_expr = 1 - UserProfile.offer_vector.cosine_distance(my_profile.need_vector)
        i_cover_their_needs_expr = 1 - UserProfile.need_vector.cosine_distance(my_profile.offer_vector)
        complementarity_expr = ((they_cover_my_needs_expr + i_cover_their_needs_expr) / 2.0).label(
            "complementarity_score"
        )
        credibility_norm_expr = func.least(UserProfile.credibility_score / 5.0, 1.0).label("credibility_norm")
        final_score_expr = ((complementarity_expr * 0.7) + (credibility_norm_expr * 0.3)).label(
            "match_score"
        )

        dual_vector_statement = (
            select(
                UserProfile.user_id,
                User.email,
                User.full_name,
                UserProfile.credibility_score,
                complementarity_expr,
                final_score_expr,
            )
            .join(User, User.id == UserProfile.user_id)
            .where(UserProfile.user_id != current_user.id)
            .where(UserProfile.available_for_tutoring.is_(True))
            .where(UserProfile.offer_vector.is_not(None))
            .where(UserProfile.need_vector.is_not(None))
            .order_by(final_score_expr.desc(), UserProfile.credibility_score.desc())
            .limit(limit)
        )

        dual_vector_rows = db.execute(dual_vector_statement).all()
        if dual_vector_rows:
            return [
                MatchResponse(
                    user_id=row.user_id,
                    email=row.email,
                    full_name=row.full_name,
                    distance=float(max(0.0, 1.0 - _calibrate_score(float(row.match_score)))),
                    match_score=_calibrate_score(float(row.match_score)),
                    complementarity_score=float(row.complementarity_score),
                    credibility_score=float(row.credibility_score),
                    matching_strategy="dual_vector_complementarity",
                )
                for row in dual_vector_rows
            ]

    if my_profile.embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user profile needs offer/need vectors or legacy embedding for matching",
        )

    distance_expr = UserProfile.embedding.l2_distance(my_profile.embedding).label("distance")
    fallback_rows = (
        db.query(User, UserProfile, distance_expr)
        .join(User, User.id == UserProfile.user_id)
        .where(UserProfile.user_id != current_user.id)
        .where(UserProfile.available_for_tutoring.is_(True))
        .where(UserProfile.embedding.is_not(None))
        .order_by(distance_expr.asc(), UserProfile.credibility_score.desc())
        .limit(limit)
        .all()
    )

    results: list[MatchResponse] = []
    for user, profile, distance in fallback_rows:
        complementarity_score = _profile_complementarity(my_profile, profile)
        credibility_norm = min(profile.credibility_score / 5.0, 1.0)
        raw_match_score = ((complementarity_score * 0.7) + (credibility_norm * 0.3))
        calibrated_score = _calibrate_score(raw_match_score)

        results.append(
            MatchResponse(
                user_id=user.id,
                email=user.email,
                full_name=user.full_name,
                distance=float(max(0.0, 1.0 - calibrated_score)),
                match_score=float(calibrated_score),
                complementarity_score=float(complementarity_score),
                credibility_score=float(profile.credibility_score),
                matching_strategy="profile_fallback_complementarity",
            )
        )

    return results
