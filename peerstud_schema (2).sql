-- ============================================================
-- PEERSTUD DATABASE SCHEMA
-- PostgreSQL + pgvector
-- Run this entire script in pgAdmin Query Tool
-- ============================================================

-- Enable pgvector extension first
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- AREA 1: USERS & IDENTITY
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_uid        VARCHAR(128) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    role            VARCHAR(20) DEFAULT 'student'
                    CHECK (role IN ('student', 'admin')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE student_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_of_study       INT NOT NULL CHECK (year_of_study BETWEEN 1 AND 6),
    faculty             VARCHAR(100) NOT NULL,
    major               VARCHAR(100),
    minor               VARCHAR(100),
    offer_text          TEXT,
    need_text           TEXT,
    offer_vector        vector(1024),
    need_vector         vector(1024),
    credibility_score   FLOAT DEFAULT 0.0 CHECK (credibility_score >= 0),
    updated_at          TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- AREA 2: COURSES & SKILLS
-- ============================================================

CREATE TABLE courses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(150) NOT NULL,
    faculty         VARCHAR(100),
    department      VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_courses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    proficiency     VARCHAR(20) NOT NULL
                    CHECK (proficiency IN ('strong', 'average', 'weak')),
    specific_topics TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

-- ============================================================
-- AREA 3: SESSIONS & SCHEDULING
-- ============================================================

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type    VARCHAR(20) NOT NULL
                    CHECK (session_type IN ('peer', 'group')),
    topic           TEXT NOT NULL,
    course_id       UUID REFERENCES courses(id) ON DELETE SET NULL,
    scheduled_at    TIMESTAMP NOT NULL,
    duration_mins   INT CHECK (duration_mins > 0),
    status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    meet_link       TEXT,
    timer_type      VARCHAR(10)
                    CHECK (timer_type IN ('25/5', '50/10')),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE session_participants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) DEFAULT 'invited'
                    CHECK (status IN ('invited', 'confirmed', 'declined', 'attended')),
    joined_at       TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

CREATE TABLE match_history (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_a               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_b               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    complementarity_score   FLOAT NOT NULL CHECK (complementarity_score BETWEEN 0 AND 1),
    collab_filter_score     FLOAT CHECK (collab_filter_score BETWEEN 0 AND 1),
    final_score             FLOAT NOT NULL CHECK (final_score BETWEEN 0 AND 1),
    resulted_in_session     BOOLEAN DEFAULT FALSE,
    session_id              UUID REFERENCES sessions(id) ON DELETE SET NULL,
    created_at              TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- AREA 4: GROUPS
-- ============================================================

CREATE TABLE study_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,
    course_id       UUID REFERENCES courses(id) ON DELETE SET NULL,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    max_size        INT DEFAULT 8 CHECK (max_size BETWEEN 2 AND 15),
    focus_topic     TEXT,
    status          VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active', 'disbanded')),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE group_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id        UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) DEFAULT 'member'
                    CHECK (role IN ('admin', 'member')),
    joined_at       TIMESTAMP DEFAULT NOW(),
    last_active_at  TIMESTAMP DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE,
    UNIQUE(group_id, user_id)
);

-- ============================================================
-- AREA 5: RATINGS & PROGRESS
-- ============================================================

CREATE TABLE ratings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    rater_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ratee_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score           INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    feedback_text   TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, rater_id, ratee_id)
);

CREATE TABLE progress_metrics (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_study_hours   FLOAT DEFAULT 0 CHECK (total_study_hours >= 0),
    current_streak_days INT DEFAULT 0 CHECK (current_streak_days >= 0),
    longest_streak_days INT DEFAULT 0 CHECK (longest_streak_days >= 0),
    sessions_completed  INT DEFAULT 0 CHECK (sessions_completed >= 0),
    sessions_hosted     INT DEFAULT 0 CHECK (sessions_hosted >= 0),
    last_session_date   DATE,
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE course_progress (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sessions_as_learner INT DEFAULT 0 CHECK (sessions_as_learner >= 0),
    sessions_as_teacher INT DEFAULT 0 CHECK (sessions_as_teacher >= 0),
    avg_rating_received FLOAT CHECK (avg_rating_received BETWEEN 1 AND 5),
    updated_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

-- ============================================================
-- AREA 6: RESOURCES & NOTIFICATIONS
-- ============================================================

CREATE TABLE resources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploaded_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       UUID REFERENCES courses(id) ON DELETE SET NULL,
    session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
    title           VARCHAR(200) NOT NULL,
    file_url        TEXT NOT NULL,
    file_type       VARCHAR(20)
                    CHECK (file_type IN ('pdf', 'image', 'link', 'doc', 'other')),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL
                    CHECK (type IN (
                        'session_invite', 'session_confirmed', 'session_cancelled',
                        'match_suggested', 'rating_prompt', 'group_invite',
                        'group_removed'
                    )),
    title           VARCHAR(150),
    body            TEXT,
    reference_id    UUID,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

-- HNSW vector indexes for matching (two per student)
CREATE INDEX idx_student_offer_vector ON student_profiles
    USING hnsw (offer_vector vector_cosine_ops);

CREATE INDEX idx_student_need_vector ON student_profiles
    USING hnsw (need_vector vector_cosine_ops);

-- General performance indexes
CREATE INDEX idx_users_auth_uid         ON users(auth_uid);
CREATE INDEX idx_users_email            ON users(email);
CREATE INDEX idx_user_courses_user      ON user_courses(user_id);
CREATE INDEX idx_user_courses_course    ON user_courses(course_id);
CREATE INDEX idx_sessions_created_by    ON sessions(created_by);
CREATE INDEX idx_sessions_status        ON sessions(status);
CREATE INDEX idx_sessions_scheduled_at  ON sessions(scheduled_at);
CREATE INDEX idx_session_participants   ON session_participants(session_id, user_id);
CREATE INDEX idx_match_history_a        ON match_history(student_a);
CREATE INDEX idx_match_history_b        ON match_history(student_b);
CREATE INDEX idx_match_history_score    ON match_history(final_score DESC);
CREATE INDEX idx_group_members_group    ON group_members(group_id);
CREATE INDEX idx_group_members_user     ON group_members(user_id);
CREATE INDEX idx_ratings_ratee          ON ratings(ratee_id);
CREATE INDEX idx_ratings_session        ON ratings(session_id);
CREATE INDEX idx_notifications_user     ON notifications(user_id, is_read);
CREATE INDEX idx_resources_course       ON resources(course_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_student_profiles_updated_at
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_progress_metrics_updated_at
    BEFORE UPDATE ON progress_metrics
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_course_progress_updated_at
    BEFORE UPDATE ON course_progress
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Auto-create progress_metrics row when a student_profile is inserted
CREATE OR REPLACE FUNCTION create_progress_metrics()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO progress_metrics (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_progress_on_profile
    AFTER INSERT ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION create_progress_metrics();

CREATE OR REPLACE FUNCTION update_credibility_score()
RETURNS TRIGGER AS $$
BEGIN
    -- Update student credibility score (average of all received ratings)
    -- Only counts ratings from sessions where the participant status is 'attended'
    UPDATE student_profiles
    SET credibility_score = (
        SELECT ROUND(AVG(r.score)::NUMERIC, 2)
        FROM ratings r
        JOIN session_participants sp ON sp.session_id = r.session_id
            AND sp.user_id = r.ratee_id
            AND sp.status = 'attended'
        WHERE r.ratee_id = NEW.ratee_id
    )
    WHERE user_id = NEW.ratee_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_credibility
    AFTER INSERT ON ratings
    FOR EACH ROW EXECUTE FUNCTION update_credibility_score();

-- ============================================================
-- SAMPLE QUERY: Complementarity Matching
-- Replace :current_user_id with the actual UUID at runtime
-- ============================================================

-- Example: Get top 10 complementary matches for a given student
/*
SELECT
    u.id,
    u.name,
    u.email,
    (1 - (sp.offer_vector <=> me.need_vector))  AS they_cover_my_needs,
    (1 - (sp.need_vector  <=> me.offer_vector)) AS i_cover_their_needs,
    (
        (1 - (sp.offer_vector <=> me.need_vector)) * 0.5 +
        (1 - (sp.need_vector  <=> me.offer_vector)) * 0.5
    ) AS match_score
FROM student_profiles sp
JOIN users u ON u.id = sp.user_id
JOIN student_profiles me ON me.user_id = :current_user_id
WHERE u.id != :current_user_id
  AND u.is_active = TRUE
ORDER BY match_score DESC
LIMIT 10;
*/
