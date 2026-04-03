from __future__ import annotations

from typing import Any

import firebase_admin
from fastapi import HTTPException, status
from firebase_admin import auth, credentials

from backend.config import settings


def init_firebase() -> None:
    if firebase_admin._apps:
        return

    if settings.firebase_service_account_file:
        cred = credentials.Certificate(settings.firebase_service_account_file)
        firebase_admin.initialize_app(cred)
        return

    if settings.firebase_project_id:
        firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})
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
