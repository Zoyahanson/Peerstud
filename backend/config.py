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
    cors_allowed_origins_raw: str = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://localhost:3000",
    )
    cors_allowed_origin_regex: str = os.getenv("CORS_ALLOWED_ORIGIN_REGEX", r"^https://.*\.vercel\.app$")

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins_raw.split(",") if origin.strip()]

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
