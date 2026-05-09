-- ============================================================
-- PEERSTUD PROJECT-SPEC BRIDGE MIGRATION
-- Purpose: merge new project-spec schema additions into the
-- existing backend schema without breaking current APIs.
-- Safe to run multiple times.
-- ============================================================

BEGIN;

-- Keep both UUID extension styles available.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS COMPATIBILITY
-- Existing backend uses users.full_name. Add project-spec fields
-- as additive columns only.
-- ============================================================
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'admin'));

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Optional compatibility alias from project spec.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS name VARCHAR(100);

UPDATE users
SET name = COALESCE(name, full_name)
WHERE name IS NULL;

-- ============================================================
-- PROFILE COMPATIBILITY
-- Existing backend keeps user_profiles + embedding(1536).
-- Add project-spec offer/need text + vectors as additive fields.
-- Keep 1536 dimensions to stay compatible with backend API/models.
-- ============================================================
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS offer_text TEXT;

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS need_text TEXT;

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS offer_vector vector(1536);

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS need_vector vector(1536);

ALTER TABLE courses
    ALTER COLUMN instructor_id DROP NOT NULL;

-- Existing year_of_study is VARCHAR in backend. Keep it as-is.
-- Existing credibility_score already exists and is reused.

-- ============================================================
-- NEW TABLES FROM PROJECT SPEC (ADDITIVE)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    proficiency VARCHAR(20) NOT NULL CHECK (proficiency IN ('strong', 'average', 'weak')),
    specific_topics TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

ALTER TABLE user_courses
    ADD COLUMN IF NOT EXISTS supplementary_tutor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE user_courses
    ADD COLUMN IF NOT EXISTS strong_topics VARCHAR(120)[] NOT NULL DEFAULT '{}';

ALTER TABLE user_courses
    ADD COLUMN IF NOT EXISTS need_topics VARCHAR(120)[] NOT NULL DEFAULT '{}';

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS availability_slots VARCHAR(40)[] NOT NULL DEFAULT '{}';

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS matching_preference VARCHAR(30) NOT NULL DEFAULT 'peers_only';

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS study_style_preference VARCHAR(20) NOT NULL DEFAULT 'both';

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS preferred_session_length_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS include_graduate_tutors BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    complementarity_score DOUBLE PRECISION NOT NULL CHECK (complementarity_score BETWEEN 0 AND 1),
    collab_filter_score DOUBLE PRECISION CHECK (collab_filter_score BETWEEN 0 AND 1),
    final_score DOUBLE PRECISION NOT NULL CHECK (final_score BETWEEN 0 AND 1),
    resulted_in_session BOOLEAN NOT NULL DEFAULT FALSE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (student_a <> student_b)
);

CREATE TABLE IF NOT EXISTS progress_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_study_hours DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_study_hours >= 0),
    current_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (current_streak_days >= 0),
    longest_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak_days >= 0),
    sessions_completed INTEGER NOT NULL DEFAULT 0 CHECK (sessions_completed >= 0),
    sessions_hosted INTEGER NOT NULL DEFAULT 0 CHECK (sessions_hosted >= 0),
    last_session_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sessions_as_learner INTEGER NOT NULL DEFAULT 0 CHECK (sessions_as_learner >= 0),
    sessions_as_teacher INTEGER NOT NULL DEFAULT 0 CHECK (sessions_as_teacher >= 0),
    avg_rating_received DOUBLE PRECISION CHECK (avg_rating_received BETWEEN 1 AND 5),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'session_invite',
        'session_confirmed',
        'session_cancelled',
        'match_suggested',
        'rating_prompt',
        'group_invite',
        'group_removed'
    )),
    title VARCHAR(150),
    body TEXT,
    reference_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
-- HNSW indexes for dual-vector complementarity matching.
CREATE INDEX IF NOT EXISTS idx_user_profiles_offer_vector
    ON user_profiles USING hnsw (offer_vector vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_user_profiles_need_vector
    ON user_profiles USING hnsw (need_vector vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_user_courses_user ON user_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_course ON user_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_tutor ON user_courses(supplementary_tutor_user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_a ON match_history(student_a);
CREATE INDEX IF NOT EXISTS idx_match_history_b ON match_history(student_b);
CREATE INDEX IF NOT EXISTS idx_match_history_score ON match_history(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_progress_metrics_user ON progress_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON course_progress(course_id);

-- ============================================================
-- FUNCTIONS/TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION bridge_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at_bridge ON users;
CREATE TRIGGER trg_users_updated_at_bridge
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION bridge_set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at_bridge ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at_bridge
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION bridge_set_updated_at();

DROP TRIGGER IF EXISTS trg_progress_metrics_updated_at_bridge ON progress_metrics;
CREATE TRIGGER trg_progress_metrics_updated_at_bridge
    BEFORE UPDATE ON progress_metrics
    FOR EACH ROW EXECUTE FUNCTION bridge_set_updated_at();

DROP TRIGGER IF EXISTS trg_course_progress_updated_at_bridge ON course_progress;
CREATE TRIGGER trg_course_progress_updated_at_bridge
    BEFORE UPDATE ON course_progress
    FOR EACH ROW EXECUTE FUNCTION bridge_set_updated_at();

CREATE OR REPLACE FUNCTION bridge_create_progress_metrics()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO progress_metrics (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_progress_on_user_profile_bridge ON user_profiles;
CREATE TRIGGER trg_create_progress_on_user_profile_bridge
    AFTER INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION bridge_create_progress_metrics();

-- Keep user_profiles credibility_score and ratings_count in sync when session_ratings changes.
CREATE OR REPLACE FUNCTION bridge_recompute_tutor_credibility(_tutor_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE user_profiles up
    SET credibility_score = COALESCE(stats.avg_score, 0),
        ratings_count = COALESCE(stats.ratings_count, 0)
    FROM (
        SELECT
            sr.tutor_user_id,
            ROUND(AVG(sr.score)::NUMERIC, 2)::DOUBLE PRECISION AS avg_score,
            COUNT(*)::INTEGER AS ratings_count
        FROM session_ratings sr
        WHERE sr.tutor_user_id = _tutor_user_id
        GROUP BY sr.tutor_user_id
    ) stats
    WHERE up.user_id = _tutor_user_id;

    UPDATE user_profiles up
    SET credibility_score = 0,
        ratings_count = 0
    WHERE up.user_id = _tutor_user_id
      AND NOT EXISTS (
          SELECT 1
          FROM session_ratings sr
          WHERE sr.tutor_user_id = _tutor_user_id
      );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_update_credibility_from_session_ratings()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM bridge_recompute_tutor_credibility(NEW.tutor_user_id);
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM bridge_recompute_tutor_credibility(NEW.tutor_user_id);
        IF OLD.tutor_user_id IS DISTINCT FROM NEW.tutor_user_id THEN
            PERFORM bridge_recompute_tutor_credibility(OLD.tutor_user_id);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM bridge_recompute_tutor_credibility(OLD.tutor_user_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_credibility_bridge ON session_ratings;
CREATE TRIGGER trg_sync_credibility_bridge
    AFTER INSERT OR UPDATE OR DELETE ON session_ratings
    FOR EACH ROW EXECUTE FUNCTION bridge_update_credibility_from_session_ratings();

-- Backfill progress rows for existing profiles.
INSERT INTO progress_metrics (user_id)
SELECT up.user_id
FROM user_profiles up
LEFT JOIN progress_metrics pm ON pm.user_id = up.user_id
WHERE pm.user_id IS NULL;

COMMIT;

-- ============================================================
-- SAMPLE QUERY: complementarity match using new dual vectors
-- ============================================================
/*
SELECT
    u.id,
    COALESCE(u.name, u.full_name) AS display_name,
    u.email,
    (1 - (other.offer_vector <=> me.need_vector))  AS they_cover_my_needs,
    (1 - (other.need_vector  <=> me.offer_vector)) AS i_cover_their_needs,
    (
        (1 - (other.offer_vector <=> me.need_vector)) * 0.5 +
        (1 - (other.need_vector  <=> me.offer_vector)) * 0.5
    ) AS complementarity_score
FROM user_profiles other
JOIN users u ON u.id = other.user_id
JOIN user_profiles me ON me.user_id = :current_user_id
WHERE u.id != :current_user_id
  AND u.is_active = TRUE
  AND other.offer_vector IS NOT NULL
  AND other.need_vector IS NOT NULL
  AND me.offer_vector IS NOT NULL
  AND me.need_vector IS NOT NULL
ORDER BY complementarity_score DESC
LIMIT 10;
*/
