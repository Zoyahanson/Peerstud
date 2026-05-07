"""
Fix auth_uid mismatch between public.users and Supabase Auth.

The seed script stores "student_01", "tutor_01" etc. as auth_uid in public.users,
but Supabase Auth assigns real UUIDs when auth users are created.

This script:
1. Fetches all auth users from Supabase Admin API (matched by email)
2. Updates public.users.auth_uid to the real Supabase UUID for each row
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error as url_error
import urllib.request as url_request

import psycopg
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")


def _list_auth_users() -> list[dict]:
    """Return all Supabase Auth users via Admin API (handles pagination)."""
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    all_users: list[dict] = []
    page = 1
    per_page = 1000

    while True:
        url = f"{SUPABASE_URL}/auth/v1/admin/users?page={page}&per_page={per_page}"
        req = url_request.Request(
            url,
            headers={
                "apikey": SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            },
            method="GET",
        )
        with url_request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        # The API may return {"users": [...]} or a plain list depending on version
        if isinstance(data, list):
            batch = data
        else:
            batch = data.get("users", [])

        all_users.extend(batch)
        if len(batch) < per_page:
            break
        page += 1

    return all_users


def main() -> None:
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        sys.exit(1)

    print("Fetching Supabase Auth users...")
    auth_users = _list_auth_users()
    print(f"  Found {len(auth_users)} auth users")

    # Build email → supabase_uuid map (lower-case email keys)
    email_to_uuid: dict[str, str] = {}
    for auth_user in auth_users:
        email = (auth_user.get("email") or "").lower().strip()
        uid = auth_user.get("id", "")
        if email and uid:
            email_to_uuid[email] = uid

    engine = psycopg.connect(DATABASE_URL, options="-c search_path=public")

    with engine as conn:
        rows = conn.execute("SELECT id, email, auth_uid FROM users").fetchall()
        print(f"  Found {len(rows)} rows in public.users")

        updated = 0
        skipped_no_match = 0
        skipped_already_correct = 0

        for row in rows:
            db_id, email, current_auth_uid = str(row[0]), row[1].lower(), row[2]
            supabase_uuid = email_to_uuid.get(email)

            if supabase_uuid is None:
                print(f"  SKIP  {email} — no matching Supabase Auth user")
                skipped_no_match += 1
                continue

            if current_auth_uid == supabase_uuid:
                skipped_already_correct += 1
                continue

            conn.execute(
                "UPDATE users SET auth_uid = %s WHERE id = %s::uuid",
                (supabase_uuid, db_id),
            )
            print(f"  FIX   {email}: '{current_auth_uid}' -> '{supabase_uuid}'")
            updated += 1

        conn.commit()

    print()
    print(f"Done. updated={updated}, already_correct={skipped_already_correct}, no_auth_match={skipped_no_match}")


if __name__ == "__main__":
    main()
