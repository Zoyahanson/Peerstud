# PeerStud Extensive Computation and Algorithm Notes

This document captures the most computation-heavy parts of PeerStud and how they contribute to ranking, personalization, and engagement metrics.

## 1) Tutor Suggestion Engine

Primary route:
- GET /tutors/suggestions

Primary file:
- backend/api/tutors.py

### Pipeline

1. Candidate generation in SQL
- Build a bounded candidate pool from users with tutor profiles.
- Include aggregate counts for upcoming sessions and sessions hosted.
- If the requesting user has a need vector, pre-order candidates by vector cosine distance in SQL.
- Pull at most 80 candidates for Python reranking.

2. Multi-signal scoring per candidate
- Signal A: semantic similarity (need_vector vs offer_vector)
- Signal B: keyword overlap using Jaccard similarity
- Signal C: course overlap ratio
- Signal D: Bayesian-smoothed credibility
- Signal E: structural bonuses (availability, upcoming sessions, same campus/faculty)

3. Composite score and ranking
- Weighted sum, capped at 1.0.
- Sort descending by composite score and return top N.

### Core formula

S = min(
  0.40 * vector_similarity
+ 0.25 * keyword_jaccard
+ 0.15 * course_overlap
+ 0.15 * bayesian_credibility
+ 0.05 * structural_bonus,
  1.0
)

### Why this design

- Vector similarity captures semantic intent that string matching misses.
- Keyword and course overlap protect precision for exact curriculum alignment.
- Bayesian smoothing reduces cold-start inflation from low review counts.
- Structural bonuses improve practical matching quality (same context and availability).

## 2) Leaderboard Engine

Primary routes:
- GET /leaderboard/tutors
- GET /leaderboard/students

Primary files:
- backend/api/leaderboard.py
- backend/services/points_engine.py

### Internal Points System (implemented)

A unified points engine computes and persists leaderboard points for every user profile.

Persisted profile fields:
- study_points
- tutor_points
- total_points
- points_last_computed_at

These are now maintained through the points engine and reused by leaderboard routes.

### Student points formula

study_points =
  10 * sessions_joined
+ 12 * resources_shared
+ 8  * study_groups_joined
+ 6  * streak_days

### Tutor points formula

tutor_points =
  15 * sessions_hosted
+ 6  * ratings_count
+ 20 * credibility_score
+ tier bonuses

Tier bonuses:
- +12 if ratings_count >= 10 and credibility_score >= 4.5
- +6  if ratings_count >= 5 and credibility_score >= 4.0
- +6  if sessions_hosted >= 8

### Total points formula

total_points = study_points + tutor_points

### Why an internal points system is justified

1. Consistency
- Leaderboard rankings and user progress can reference one canonical score system.

2. Fairness across roles
- Users who primarily learn (student behavior) and users who primarily teach (tutor behavior) are both represented.

3. Better incentives
- Encourages meaningful behavior: joining sessions, sharing resources, sustained streaks, and tutoring quality.

4. Operational simplicity
- Points are stored in user_profiles, making downstream reads cheap and stable for UI rendering.

5. Explainability
- Scores are decomposable into measurable components, which is presentation-friendly and user-trust friendly.

## 3) Progress and Analytics Computation

Primary route:
- GET /users/me/analytics

Primary file:
- backend/api/users.py

### Heavy operations

- Aggregates hosted sessions, joined sessions, group membership, and shared resources.
- Builds month-bucket progress points.
- Computes streak from time-series activity.
- Builds recent session history for visualization.

### Why this is computationally significant

- It combines multiple activity streams with temporal transforms.
- It computes both summary metrics and chart-ready series in one request.

## 4) Complexity Notes

1. Suggestion rerank complexity
- O(C * D) for vector scoring plus token/set operations, where:
  - C is bounded candidates (max 80)
  - D is vector dimension (1536)

2. Points engine complexity
- Primarily aggregate queries plus O(U) pass to assemble and persist scores, where U is users with profiles.

3. Leaderboard ranking complexity
- O(U log U) sorting after metric/points assembly.

## 5) Implementation References

- Points persistence model fields: backend/models.py
- Runtime schema backfill for points columns: backend/db.py
- Points computation service: backend/services/points_engine.py
- Tutor leaderboard now uses persisted tutor_points: backend/api/leaderboard.py
- Student leaderboard now uses persisted study_points and total_points: backend/api/leaderboard.py
- Response schema fields for points: backend/api/schemas.py

## 6) Example Walkthrough

Example user activity:
- sessions_joined = 5
- resources_shared = 2
- study_groups_joined = 3
- streak_days = 4
- sessions_hosted = 6
- ratings_count = 8
- credibility_score = 4.3

Computed values:
- study_points = 5*10 + 2*12 + 3*8 + 4*6 = 122
- tutor_points = 6*15 + 8*6 + 4.3*20 + 6 (mid-tier bonus) = 230
- total_points = 352

This user can rank strongly in both learner and tutor contexts, with transparent, explainable scoring.
