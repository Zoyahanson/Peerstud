CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_of_study VARCHAR(50),
    faculty VARCHAR(150),
    campus VARCHAR(150),
    major VARCHAR(150),
    minor VARCHAR(150),
    current_courses VARCHAR(120)[] NOT NULL DEFAULT '{}',
    qualifications TEXT,
    tutoring_experience TEXT,
    available_for_tutoring BOOLEAN NOT NULL DEFAULT TRUE,
    strengths TEXT,
    weak_topics TEXT,
    credibility_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    ratings_count INTEGER NOT NULL DEFAULT 0,
    bio TEXT,
    interests TEXT,
    embedding vector(1536),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    classroom_name VARCHAR(120) NOT NULL,
    topic_focus VARCHAR(200) NOT NULL DEFAULT 'General Study Session',
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    meet_link VARCHAR(512),
    calendar_event_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS session_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    rater_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tutor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, rater_user_id)
);

CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    url VARCHAR(1024) NOT NULL,
    storage_path VARCHAR(1024),
    file_name VARCHAR(255),
    mime_type VARCHAR(120),
    file_size_bytes INTEGER,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'link',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    topic_focus VARCHAR(200) NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    target_size INTEGER NOT NULL DEFAULT 6,
    min_size INTEGER NOT NULL DEFAULT 5,
    max_size INTEGER NOT NULL DEFAULT 15,
    attendance_required BOOLEAN NOT NULL DEFAULT TRUE,
    inactive_after_days INTEGER NOT NULL DEFAULT 21,
    system_suggested BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    attendance_count INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_study_groups_course_id ON study_groups(course_id);
CREATE INDEX IF NOT EXISTS idx_study_group_members_group_id ON study_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_ratings_session_id ON session_ratings(session_id);

CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    adaptive_layout BOOLEAN NOT NULL DEFAULT TRUE,
    desktop_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_minutes_before INTEGER NOT NULL DEFAULT 30,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(30) NOT NULL DEFAULT 'direct',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_embedding
    ON user_profiles USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
