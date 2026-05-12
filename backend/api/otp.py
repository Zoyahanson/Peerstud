from __future__ import annotations

import secrets
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from backend.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# email -> (code, expiry_timestamp)
_store: dict[str, tuple[str, float]] = {}
_OTP_TTL = 600  # 10 minutes


class _EmailBody(BaseModel):
    email: str


class _VerifyBody(BaseModel):
    email: str
    code: str


def _send(to: str, code: str) -> None:
    if not settings.smtp_user or not settings.smtp_password:
        raise RuntimeError("SMTP credentials not configured (EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD)")

    sender = settings.smtp_from or settings.smtp_user
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your PeerStud verification code"
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(
        f"""
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px">
          <h2 style="color:#0d9488;margin-bottom:8px">PeerStud</h2>
          <p style="color:#374151">Your sign-up verification code:</p>
          <p style="font-size:40px;font-weight:900;letter-spacing:12px;color:#1b2e4b;margin:16px 0">{code}</p>
          <p style="color:#6b7280;font-size:13px">Expires in 10 minutes. Do not share this code.</p>
        </div>
        """,
        "html",
    ))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as srv:
        srv.starttls()
        srv.login(settings.smtp_user, settings.smtp_password)
        srv.sendmail(sender, to, msg.as_string())


@router.post("/send-otp", status_code=200)
def send_otp(body: _EmailBody) -> dict[str, str]:
    email = body.email.strip().lower()
    code = f"{secrets.randbelow(1_000_000):06d}"
    _store[email] = (code, time.time() + _OTP_TTL)

    try:
        _send(email, code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send verification email. Check SMTP settings.",
        ) from exc

    return {"message": "Code sent"}


@router.post("/verify-otp", status_code=200)
def verify_otp(body: _VerifyBody) -> dict[str, object]:
    email = body.email.strip().lower()
    entry = _store.get(email)

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No code found for this email. Request a new one.",
        )

    code, expiry = entry

    if time.time() > expiry:
        _store.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code expired. Request a new one.",
        )

    if not secrets.compare_digest(code, body.code.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect code. Try again.",
        )

    _store.pop(email, None)
    return {"verified": True}
