from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from backend.config import settings


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={
        "options": "-c search_path=public,extensions",
        "prepare_threshold": None,
    },
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()
uploads_dir = Path(__file__).resolve().parent / "uploads"


def ensure_runtime_schema() -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_uid VARCHAR(128)",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'firebase_uid') THEN EXECUTE 'UPDATE users SET auth_uid = firebase_uid WHERE auth_uid IS NULL'; END IF; END $$",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_uid ON users(auth_uid)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS year_of_study VARCHAR(50)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS faculty VARCHAR(150)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS campus VARCHAR(150)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS major VARCHAR(150)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS minor VARCHAR(150)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS current_courses VARCHAR(120)[] NOT NULL DEFAULT '{}'",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS qualifications TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tutoring_experience TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS available_for_tutoring BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS strengths TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weak_topics TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS credibility_score DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ratings_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS study_points INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tutor_points INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS points_last_computed_at TIMESTAMPTZ",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS offer_text TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS need_text TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS offer_vector vector(1536)",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS need_vector vector(1536)",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS topic_focus VARCHAR(200) NOT NULL DEFAULT 'General Study Session'",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS calendar_event_id VARCHAR(255)",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS storage_path VARCHAR(1024)",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER",
        "ALTER TABLE study_groups ALTER COLUMN max_size SET DEFAULT 15",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS adaptive_layout BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS desktop_reminders BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER NOT NULL DEFAULT 30",
        "CREATE TABLE IF NOT EXISTS session_participants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(50) NOT NULL DEFAULT 'confirmed', joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(session_id, user_id))",
        "CREATE TABLE IF NOT EXISTS session_ratings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, rater_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, tutor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER NOT NULL, feedback TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(session_id, rater_user_id))",
        "CREATE TABLE IF NOT EXISTS conversations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kind VARCHAR(30) NOT NULL DEFAULT 'direct', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS conversation_participants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(conversation_id, user_id))",
        "CREATE TABLE IF NOT EXISTS chat_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id)",
    ]

    uploads_dir.mkdir(parents=True, exist_ok=True)
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
