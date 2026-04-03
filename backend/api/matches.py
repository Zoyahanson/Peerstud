from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
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
    if not my_profile or my_profile.embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user profile embedding is required for matching",
        )

    distance_expr = UserProfile.embedding.l2_distance(my_profile.embedding)
    statement = (
        select(UserProfile.user_id, User.email, User.full_name, distance_expr.label("distance"))
        .join(User, User.id == UserProfile.user_id)
        .where(UserProfile.user_id != current_user.id)
        .where(UserProfile.embedding.is_not(None))
        .order_by(distance_expr.asc())
        .limit(limit)
    )

    rows = db.execute(statement).all()
    return [
        MatchResponse(
            user_id=row.user_id,
            email=row.email,
            full_name=row.full_name,
            distance=float(row.distance),
        )
        for row in rows
    ]
