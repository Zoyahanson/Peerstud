from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.auth import validate_school_email_claims, verify_bearer_token
from backend.db import get_db
from backend.models import User


bearer_scheme = HTTPBearer(auto_error=True)


def get_current_token_payload(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    return verify_bearer_token(credentials.credentials)


def get_current_user(
    token_payload: dict[str, Any] = Depends(get_current_token_payload),
    db: Session = Depends(get_db),
) -> User:
    auth_uid = token_payload.get("sub")
    email = validate_school_email_claims(token_payload)
    if not auth_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing required claims",
        )

    user = db.query(User).filter(User.auth_uid == auth_uid).first()
    if user:
        if user.email != email:
            user.email = email
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    # Seeded/demo users may exist with matching email before their Supabase auth_uid is known.
    # Link that existing row instead of inserting a duplicate email.
    existing_email_user = db.query(User).filter(User.email == email).first()
    if existing_email_user:
        existing_email_user.auth_uid = auth_uid
        if token_payload.get("name") and not existing_email_user.full_name:
            existing_email_user.full_name = token_payload.get("name")
        db.add(existing_email_user)
        db.commit()
        db.refresh(existing_email_user)
        return existing_email_user

    user = User(
        auth_uid=auth_uid,
        email=email,
        full_name=token_payload.get("name"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
