from __future__ import annotations

from typing import Any

import firebase_admin
from fastapi import HTTPException, status
from firebase_admin import auth, credentials

from backend.config import settings


def init_firebase() -> None:
    if firebase_admin._apps:
        return

    init_options: dict[str, str] = {}
    if settings.firebase_storage_bucket:
        init_options["storageBucket"] = settings.firebase_storage_bucket

    if settings.firebase_service_account_file:
        cred = credentials.Certificate(settings.firebase_service_account_file)
        firebase_admin.initialize_app(cred, options=init_options or None)
        return

    if settings.firebase_project_id:
        init_options["projectId"] = settings.firebase_project_id
        firebase_admin.initialize_app(options=init_options)
        return

    raise RuntimeError(
        "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_FILE or FIREBASE_PROJECT_ID."
    )


def verify_bearer_token(id_token: str) -> dict[str, Any]:
    try:
        init_firebase()
        return auth.verify_id_token(id_token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token",
        ) from exc


def get_allowed_school_domains() -> list[str]:
    return [domain.strip().lower() for domain in settings.school_email_domains.split(",") if domain.strip()]


def validate_school_email_claims(token_payload: dict[str, Any]) -> str:
    email = str(token_payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing required email claim",
        )

    if not bool(token_payload.get("email_verified")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your school email before using PeerStud",
        )

    allowed_domains = get_allowed_school_domains()
    if allowed_domains:
        domain = email.split("@")[-1]
        if domain not in allowed_domains:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Use a verified school email address to access PeerStud",
            )

    return email
