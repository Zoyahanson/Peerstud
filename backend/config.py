from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"))


class Settings:
    app_name: str = "PeerStud Backend"
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://peerstud:peerstud@localhost:5432/peerstud",
    )
    firebase_service_account_file: str | None = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE")
    firebase_project_id: str | None = os.getenv("FIREBASE_PROJECT_ID")
    firebase_storage_bucket: str | None = os.getenv("FIREBASE_STORAGE_BUCKET")
    school_email_domains: str = os.getenv("SCHOOL_EMAIL_DOMAINS", "")
    google_calendar_id: str = os.getenv("GOOGLE_CALENDAR_ID", "primary")
    google_oauth_client_id: str | None = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    google_oauth_client_secret: str | None = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    google_oauth_redirect_uri: str = os.getenv(
        "GOOGLE_OAUTH_REDIRECT_URI",
        "http://localhost:3000/google-calendar-callback",
    )


settings = Settings()
