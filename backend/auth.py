from __future__ import annotations

import json
import time
from typing import Any
from urllib.request import urlopen

from fastapi import HTTPException, status
import jwt
from jwt import InvalidTokenError

from backend.config import settings

_JWKS_CACHE_TTL_SECONDS = 600
_jwks_cache: dict[str, Any] = {"keys": [], "fetched_at": 0.0}


def _require_supabase_url() -> str:
    supabase_url = settings.supabase_url.strip()
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    return supabase_url.rstrip("/")


def _jwks_endpoint() -> str:
    return f"{_require_supabase_url()}/auth/v1/.well-known/jwks.json"


def _token_issuer() -> str:
    return f"{_require_supabase_url()}/auth/v1"


def _load_jwks(force_refresh: bool = False) -> list[dict[str, Any]]:
    now = time.time()
    if not force_refresh and _jwks_cache["keys"] and now - float(_jwks_cache["fetched_at"]) < _JWKS_CACHE_TTL_SECONDS:
        return list(_jwks_cache["keys"])

    try:
        with urlopen(_jwks_endpoint(), timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
            keys = payload.get("keys") or []
            if not isinstance(keys, list) or not keys:
                raise RuntimeError("Supabase JWKS response did not contain signing keys")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch Supabase JWKS",
        ) from exc

    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return list(keys)


def _find_jwk(keys: list[dict[str, Any]], kid: str | None) -> dict[str, Any] | None:
    if not kid:
        return keys[0] if keys else None
    for key in keys:
        if key.get("kid") == kid:
            return key
    return None


def verify_bearer_token(id_token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(id_token)
        kid = str(header.get("kid") or "")
        alg = str(header.get("alg") or "RS256")

        keys = _load_jwks(force_refresh=False)
        jwk = _find_jwk(keys, kid)
        if jwk is None:
            keys = _load_jwks(force_refresh=True)
            jwk = _find_jwk(keys, kid)
        if jwk is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to verify token signature")

        algorithm = jwt.algorithms.get_default_algorithms().get(alg)
        if algorithm is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unsupported token signing algorithm",
            )

        public_key = algorithm.from_jwk(json.dumps(jwk))
        return jwt.decode(
            id_token,
            key=public_key,
            algorithms=[alg],
            audience=settings.supabase_jwt_audience,
            issuer=_token_issuer(),
            options={"require": ["exp", "iat", "sub"]},
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
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

    email_verified_claim = token_payload.get("email_verified")
    if email_verified_claim is False:
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
                detail=(
                    "Personal email addresses are not accepted. "
                    "Use an email from a listed organization domain to access PeerStud"
                ),
            )

    return email
