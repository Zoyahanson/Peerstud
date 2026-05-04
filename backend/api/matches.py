from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.api.schemas import MatchResponse
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import User, UserProfile


router = APIRouter(prefix="/matches", tags=["matches"])


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
        final_score_expr = ((complementarity_expr * 0.8) + (credibility_norm_expr * 0.2)).label(
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
                    distance=float(max(0.0, 1.0 - float(row.match_score))),
                    match_score=float(row.match_score),
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
    fallback_statement = (
        select(
            UserProfile.user_id,
            User.email,
            User.full_name,
            UserProfile.credibility_score,
            distance_expr,
        )
        .join(User, User.id == UserProfile.user_id)
        .where(UserProfile.user_id != current_user.id)
        .where(UserProfile.available_for_tutoring.is_(True))
        .where(UserProfile.embedding.is_not(None))
        .order_by(distance_expr.asc(), UserProfile.credibility_score.desc())
        .limit(limit)
    )

    fallback_rows = db.execute(fallback_statement).all()
    return [
        MatchResponse(
            user_id=row.user_id,
            email=row.email,
            full_name=row.full_name,
            distance=float(row.distance),
            match_score=float(1.0 / (1.0 + float(row.distance))),
            complementarity_score=None,
            credibility_score=float(row.credibility_score),
            matching_strategy="embedding_similarity_fallback",
        )
        for row in fallback_rows
    ]
