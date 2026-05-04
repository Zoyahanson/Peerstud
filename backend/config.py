from __future__ import annotations

import os
from urllib.parse import quote_plus
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"))


class Settings:
    app_name: str = "PeerStud Backend"
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    database_url_raw: str = os.getenv("DATABASE_URL", "")
    database_host: str = os.getenv("DATABASE_HOST", "localhost")
    database_port: str = os.getenv("DATABASE_PORT", "5432")
    database_name: str = os.getenv("DATABASE_NAME", "peerstud")
    database_user: str = os.getenv("DATABASE_USER", "peerstud")
    database_password: str = os.getenv("DATABASE_PASSWORD", "peerstud")
    supabase_jwt_audience: str = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    school_email_domains: str = os.getenv("SCHOOL_EMAIL_DOMAINS", "mymona.uwi.edu,uwi.edu.jm")
    google_calendar_id: str = os.getenv("GOOGLE_CALENDAR_ID", "primary")
    google_oauth_client_id: str | None = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    google_oauth_client_secret: str | None = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    google_oauth_redirect_uri: str = os.getenv(
        "GOOGLE_OAUTH_REDIRECT_URI",
        "http://localhost:3000/google-calendar-callback",
    )

    @property
    def database_url(self) -> str:
        if self.database_url_raw:
            if self.database_url_raw.startswith("postgresql+psycopg://"):
                return self.database_url_raw
            if self.database_url_raw.startswith("postgresql://"):
                return self.database_url_raw.replace("postgresql://", "postgresql+psycopg://", 1)
            return self.database_url_raw

        password = quote_plus(self.database_password)
        return (
            f"postgresql+psycopg://{self.database_user}:{password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )


settings = Settings()
