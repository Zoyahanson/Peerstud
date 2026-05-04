# Tutor Matching Logic

**Endpoint:** `GET /tutors/suggestions?limit=N`  
**File:** `backend/api/tutors.py`

---

## Overview

The suggestion engine returns a ranked list of tutors personalised to the requesting user. It combines five independent signals into a single composite score in the range **[0, 1]**, then sorts all candidates descending and returns the top `N`.

Pure semantic-vector matching is not used alone because:
- Embedding spaces can conflate unrelated topics ("linear algebra" vs "linear regression")
- Tutors with no ratings but strong vectors would be over-promoted
- Course codes and exact terminology need hard-string matching, not just semantic proximity

---

## Data Sources per User

| Field | Table | Used for |
|---|---|---|
| `need_vector` | `user_profiles` | What the student wants to learn (1536-dim) |
| `weak_topics` | `user_profiles` | Free-text description of weak areas |
| `current_courses` | `user_profiles` | Enrolled course codes (array) |
| `campus`, `faculty` | `user_profiles` | Structural proximity |

| Field | Table | Used for |
|---|---|---|
| `offer_vector` | `user_profiles` | What the tutor can teach (1536-dim) |
| `strengths`, `qualifications` | `user_profiles` | Free-text subject expertise |
| `current_courses` | `user_profiles` | Tutor's course familiarity |
| `credibility_score`, `ratings_count` | `user_profiles` | Peer review reputation |
| `available_for_tutoring` | `user_profiles` | Availability flag |

---

## Stage 1 — Candidate Pre-filtering (SQL)

Before any Python scoring, the query fetches at most **80 candidates** from the database.

```python
candidate_query = (
    db.query(
        User,
        UserProfile,
        func.count(func.distinct(upcoming_alias.id)).label("upcoming_sessions_count"),
        func.count(func.distinct(StudySession.id)).label("sessions_hosted"),
    )
    .join(UserProfile, UserProfile.user_id == User.id)
    .outerjoin(upcoming_alias, and_(
        upcoming_alias.host_user_id == User.id,
        upcoming_alias.start_time >= now,
    ))
    .outerjoin(StudySession, StudySession.host_user_id == User.id)
    .filter(User.id != current_user.id)
    .filter(UserProfile.available_for_tutoring.is_(True))
    .group_by(User.id, UserProfile.id)
)
```

**Hard filter:** only tutors with `available_for_tutoring = true` enter the pool.

**Pre-sort strategy:**

- If the requesting user has a `need_vector`, candidates are pre-ordered by pgvector cosine distance (`<=>`) so the 80 pulled are already semantically close.
- If no `need_vector` exists, fall back to ordering by `credibility_score DESC`.

```python
if my_need_vector is not None:
    candidate_query = candidate_query.order_by(
        UserProfile.offer_vector.cosine_distance(my_need_vector).asc().nulls_last(),
        UserProfile.credibility_score.desc(),
    )
```

This makes the SQL step a cheap semantic gate — expensive Python scoring only runs on a bounded set.

---

## Stage 2 — Five Scoring Signals

Each signal returns a value in **[0, 1]**. They are combined into a single composite score.

---

### Signal 1 — Semantic Vector Similarity (weight: 40%)

Compares the student's `need_vector` against the tutor's `offer_vector` using cosine similarity.

$$\text{cos\_sim}(a, b) = \frac{a \cdot b}{\|a\| \cdot \|b\|}$$

**Implementation:**

```python
def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)
```

**Usage in endpoint:**

```python
if my_need_vector and tutor_offer_vector:
    vector_sim = max(0.0, _cosine_similarity(my_need_vector, tutor_offer_vector))
else:
    vector_sim = 0.0
```

**Why 40%:** Vectors encode broad semantic intent (e.g. "probability theory" and "Bayesian statistics" are close). Highest weight because it is the most general signal.

---

### Signal 2 — Keyword Jaccard Overlap (weight: 25%)

Tokenises the student's `weak_topics` and the tutor's `strengths` + `qualifications`, then measures set overlap.

$$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$

**Tokeniser** — removes stop words, short tokens, and normalises case:

```python
_STOP_WORDS = {
    "and", "or", "the", "for", "with", "from", "this", "that", "have",
    "has", "are", "was", "not", "but", "can", "will", "also", "all",
}

def _token_set(text: str | None) -> set[str]:
    if not text:
        return set()
    raw = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#]*\b", text)
    return {w.lower() for w in raw if len(w) > 2 and w.lower() not in _STOP_WORDS}

def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)
```

**Usage in endpoint:**

```python
tutor_tokens = _token_set(profile.strengths) | _token_set(profile.qualifications)
overlapping = my_weak_tokens & tutor_tokens
keyword_jaccard = _jaccard(my_weak_tokens, tutor_tokens)
```

**Why 25%:** Catches exact terminology that embeddings can blur. A student listing "calculus" will find tutors listing "calculus" precisely, not just those semantically adjacent.

---

### Signal 3 — Course Overlap (weight: 15%)

Measures what fraction of the student's enrolled courses the tutor also has listed.

$$\text{course\_overlap} = \frac{|\text{student\_courses} \cap \text{tutor\_courses}|}{|\text{student\_courses}|}$$

```python
def _course_overlap(user_courses: list[str], tutor_courses: list[str]) -> float:
    user_set = {c.strip().lower() for c in user_courses if c.strip()}
    tutor_set = {c.strip().lower() for c in tutor_courses if c.strip()}
    if not user_set:
        return 0.0
    return len(user_set & tutor_set) / len(user_set)
```

**Usage in endpoint:**

```python
course_ov = _course_overlap(my_courses, list(profile.current_courses or []))
```

**Why 15%:** Course codes are exact identifiers (e.g. `COMP2005`). A tutor enrolled in or teaching the same course is a strong structural signal that vectors cannot capture.

---

### Signal 4 — Bayesian-Smoothed Credibility (weight: 15%)

Raw average ratings inflate tutors with one five-star review. A Bayesian average pulls uncertain scores toward a neutral prior.

$$\text{smoothed} = \frac{C \cdot \mu_0 + n \cdot \bar{r}}{C + n}$$

Where:
- $\mu_0 = 3.0$ — prior mean (midpoint of a 1–5 scale)
- $C = 5$ — equivalent prior sample weight
- $n$ — actual number of ratings
- $\bar{r}$ — actual average rating

The result is then normalised: $\text{cred} = \text{smoothed} / 5.0$

```python
_PRIOR_RATING = 3.0
_PRIOR_WEIGHT = 5

def _bayesian_credibility(score: float, count: int) -> float:
    smoothed = (_PRIOR_WEIGHT * _PRIOR_RATING + count * score) / (_PRIOR_WEIGHT + count)
    return smoothed / 5.0
```

**Example:** A tutor with 1 rating of 5.0 scores $(5 \times 3.0 + 1 \times 5.0) / 6 = 3.33 / 5 = 0.667$, while a tutor with 20 ratings of 4.8 scores $(5 \times 3.0 + 20 \times 4.8) / 25 = 4.56 / 5 = 0.912$.

---

### Signal 5 — Structural Bonuses (weight: 5% total)

Binary flags that reward proximity and active availability. Each is independently small to act as a tiebreaker, not a dominant signal.

| Condition | Bonus |
|---|---|
| `available_for_tutoring` flag is true | +2% |
| Tutor has at least one upcoming session | +1% |
| Same campus as student | +2% |
| Same faculty as student | +2% |

```python
same_campus = bool(my_campus and tutor_campus and my_campus == tutor_campus)
same_faculty = bool(my_faculty and tutor_faculty and my_faculty == tutor_faculty)
has_upcoming = int(upcoming_sessions_count or 0) > 0
```

---

## Stage 3 — Composite Score

All signals are combined as a weighted sum, capped at 1.0.

$$S = \min\!\left(\begin{aligned}
  &0.40 \times \text{vector\_sim} \\
+ &0.25 \times \text{keyword\_jaccard} \\
+ &0.15 \times \text{course\_overlap} \\
+ &0.15 \times \text{bayesian\_cred} \\
+ &0.02 \times \text{available} \\
+ &0.01 \times \text{has\_upcoming} \\
+ &0.02 \times \text{same\_campus} \\
+ &0.02 \times \text{same\_faculty}
\end{aligned},\ 1.0\right)$$

```python
def _composite_score(
    *,
    vector_sim: float,
    keyword_jaccard: float,
    course_overlap: float,
    bayesian_cred: float,
    available: bool,
    has_upcoming: bool,
    same_campus: bool,
    same_faculty: bool,
) -> float:
    raw = (
        0.40 * vector_sim
        + 0.25 * keyword_jaccard
        + 0.15 * course_overlap
        + 0.15 * bayesian_cred
        + 0.02 * (1.0 if available else 0.0)
        + 0.01 * (1.0 if has_upcoming else 0.0)
        + 0.02 * (1.0 if same_campus else 0.0)
        + 0.02 * (1.0 if same_faculty else 0.0)
    )
    return min(raw, 1.0)
```

---

## Stage 4 — Match Reason Generation

A human-readable explanation is assembled from the highest-signal match facts. This is surfaced directly on the suggestion card in the UI.

```python
def _build_match_reason(
    *,
    vector_sim: float,
    keyword_jaccard: float,
    course_overlap: float,
    overlapping_tokens: set[str],
    same_campus: bool,
    same_faculty: bool,
) -> str:
    reasons: list[str] = []
    if overlapping_tokens:
        topics = ", ".join(sorted(overlapping_tokens)[:3])
        reasons.append(f"covers {topics}")
    elif vector_sim >= 0.6:
        reasons.append("strong semantic topic alignment")
    if course_overlap > 0:
        reasons.append("shares courses with you")
    if same_faculty and same_campus:
        reasons.append("same faculty and campus")
    elif same_faculty:
        reasons.append("same faculty")
    elif same_campus:
        reasons.append("same campus")
    if not reasons:
        reasons.append("general topic match")
    return "Suggested because: " + "; ".join(reasons) + "."
```

**Example output:** `"Suggested because: covers calculus, integration; shares courses with you; same faculty."`

---

## Response Schema

```python
class TutorSuggestionResponse(TutorDirectoryEntryResponse):
    match_score: float       # composite score in [0, 1], 4 decimal places
    match_reason: str        # human-readable explanation
    topic_overlaps: list[str]  # up to 6 overlapping keyword tokens
```

---

## Signal Weight Rationale Summary

| Signal | Weight | Rationale |
|---|---|---|
| Semantic vector | 40% | Captures broad topic intent across paraphrasing and synonyms |
| Keyword Jaccard | 25% | Precise exact-term matching; catches what embeddings blur |
| Course overlap | 15% | Structural hard signal — course codes are unambiguous identifiers |
| Bayesian credibility | 15% | Verified peer trust with cold-start protection |
| Structural bonuses | 5% | Tiebreakers: proximity and active presence |

---

## Graceful Degradation

- If the user has no `need_vector` (new or incomplete profile), vector similarity defaults to `0.0` and the other four signals still produce a meaningful score
- If pgvector's `cosine_distance` operator fails at query time (e.g. extension not loaded), the SQL pre-sort falls back to `credibility_score DESC`
- If `weak_topics` is empty, keyword Jaccard returns `0.0` silently
- `available_for_tutoring = false` hard-filters all candidates before scoring begins
