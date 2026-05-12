"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, MessageCircle, Search, Sparkles, Star, X } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, hasAuthToken } from "../../../lib/api";

type TutorBadge = {
  code: string;
  label: string;
  description: string;
};

type TutorEntry = {
  user_id: string;
  full_name: string | null;
  email: string;
  year_of_study: string | null;
  faculty: string | null;
  campus: string | null;
  current_courses: string[];
  strengths: string | null;
  qualifications: string | null;
  tutoring_experience: string | null;
  available_for_tutoring: boolean;
  credibility_score: number;
  ratings_count: number;
  upcoming_sessions_count: number;
  badges: TutorBadge[];
};

type TutorSuggestion = TutorEntry & {
  match_score: number;
  match_reason: string;
  topic_overlaps: string[];
};

type TutorReview = {
  session_id: string;
  score: number;
  feedback: string | null;
  created_at: string;
  rater_name: string | null;
};

function buildQuery(filters: {
  nameQuery: string;
  subject: string;
  gradeLevel: string;
  minRating: string;
  campus: string;
  faculty: string;
  availableOnly: boolean;
}): string {
  const params = new URLSearchParams();
  if (filters.nameQuery.trim()) params.set("q", filters.nameQuery.trim());
  if (filters.subject.trim()) params.set("subject", filters.subject.trim());
  if (filters.gradeLevel.trim()) params.set("grade_level", filters.gradeLevel.trim());
  if (filters.minRating.trim()) params.set("min_rating", filters.minRating.trim());
  if (filters.campus.trim()) params.set("campus", filters.campus.trim());
  if (filters.faculty.trim()) params.set("faculty", filters.faculty.trim());
  if (filters.availableOnly) params.set("available_only", "true");
  params.set("limit", "50");
  return params.toString();
}

// ── Profile Overlay ───────────────────────────────────────────────────────────
function TutorProfileOverlay({
  tutor,
  reviews,
  onClose,
  onReachOut,
  onPlanSession,
}: {
  tutor: TutorEntry;
  reviews: TutorReview[];
  onClose: () => void;
  onReachOut: (id: string) => void;
  onPlanSession: (tutor: TutorEntry) => void;
}) {
  // Close on backdrop click
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] bg-white shadow-2xl p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-[color:var(--ink-muted)] hover:bg-[color:var(--background-alt)]"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-xl font-black text-[color:var(--accent-strong)]">
            {(tutor.full_name ?? tutor.email).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black text-[color:var(--foreground)]">
              {tutor.full_name ?? tutor.email}
            </h2>
            <p className="mt-0.5 text-sm text-[color:var(--ink-muted)]">{tutor.email}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[color:var(--ink-muted)]">
              {tutor.year_of_study && <span>{tutor.year_of_study}</span>}
              {tutor.faculty && <span>• {tutor.faculty}</span>}
              {tutor.campus && <span>• {tutor.campus}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-3 py-1">
              <Star size={12} className="text-[color:var(--accent-strong)]" fill="currentColor" />
              <span className="text-sm font-bold text-[color:var(--accent-strong)]">
                {tutor.credibility_score.toFixed(1)}
              </span>
            </div>
            <span className="text-xs text-[color:var(--ink-muted)]">{tutor.ratings_count} reviews</span>
            {tutor.upcoming_sessions_count > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Available
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        {tutor.badges.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {tutor.badges.map((badge) => (
              <span
                key={badge.code}
                title={badge.description}
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* Details grid */}
        <div className="mt-5 grid gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background-alt)] p-5 text-sm md:grid-cols-2">
          {tutor.strengths && (
            <div>
              <p className="section-kicker mb-1">Strengths</p>
              <p className="text-[color:var(--foreground)]">{tutor.strengths}</p>
            </div>
          )}
          {tutor.qualifications && (
            <div>
              <p className="section-kicker mb-1">Qualifications</p>
              <p className="text-[color:var(--foreground)]">{tutor.qualifications}</p>
            </div>
          )}
          {tutor.tutoring_experience && (
            <div className="md:col-span-2">
              <p className="section-kicker mb-1">Tutoring Experience</p>
              <p className="text-[color:var(--foreground)]">{tutor.tutoring_experience}</p>
            </div>
          )}
          {tutor.current_courses.length > 0 && (
            <div className="md:col-span-2">
              <p className="section-kicker mb-2">Courses</p>
              <div className="flex flex-wrap gap-2">
                {tutor.current_courses.map((course) => (
                  <span
                    key={course}
                    className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs text-[color:var(--foreground)]"
                  >
                    {course}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reviews */}
        <div className="mt-5">
          <p className="section-kicker mb-3">Student Reviews</p>
          {reviews.length === 0 ? (
            <p className="rounded-xl bg-[color:var(--background-alt)] px-4 py-3 text-sm text-[color:var(--ink-muted)]">
              No reviews yet.
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review, i) => (
                <div
                  key={`${review.session_id}-${i}`}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background-alt)] p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">
                      {review.rater_name ?? "Anonymous peer"}
                    </p>
                    <span className="flex items-center gap-1 text-xs text-[color:var(--accent-strong)]">
                      <Star size={11} fill="currentColor" /> {review.score} / 5
                    </span>
                  </div>
                  {review.feedback && (
                    <p className="mt-1 text-sm text-[color:var(--ink-muted)]">{review.feedback}</p>
                  )}
                  <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => { onReachOut(tutor.user_id); onClose(); }}
            className="primary-button flex flex-1 items-center justify-center gap-2 py-3 text-sm"
          >
            <MessageCircle size={15} />
            Reach Out
          </button>
          <button
            onClick={() => { onPlanSession(tutor); onClose(); }}
            className="secondary-button flex-1 py-3 text-sm"
          >
            Plan Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function TutorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nameQuery, setNameQuery] = useState("");
  const [subject, setSubject] = useState(() => searchParams.get("subject") ?? "");
  const [gradeLevel, setGradeLevel] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [campus, setCampus] = useState("");
  const [faculty, setFaculty] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [tutors, setTutors] = useState<TutorEntry[]>([]);
  const [suggestions, setSuggestions] = useState<TutorSuggestion[]>([]);
  const [selectedTutorId, setSelectedTutorId] = useState("");
  const [reviews, setReviews] = useState<TutorReview[]>([]);
  const [showAllTutors, setShowAllTutors] = useState(false);
  const [overlayTutor, setOverlayTutor] = useState<TutorEntry | null>(null);

  const selectedTutor = useMemo(
    () => tutors.find((item) => item.user_id === selectedTutorId) ?? null,
    [selectedTutorId, tutors],
  );

  function openProfile(tutor: TutorEntry) {
    setSelectedTutorId(tutor.user_id);
    setOverlayTutor(tutor);
  }

  async function searchTutors(overrides?: Partial<{ subject: string; nameQuery: string }>): Promise<TutorEntry[]> {
    const query = buildQuery({
      nameQuery: overrides?.nameQuery ?? nameQuery,
      subject: overrides?.subject ?? subject,
      gradeLevel,
      minRating,
      campus,
      faculty,
      availableOnly,
    });
    const response = await authedFetch<TutorEntry[]>(`/tutors/search?${query}`);
    setTutors(response);
    setSelectedTutorId((current) => current || response[0]?.user_id || "");
    return response;
  }

  useEffect(() => {
    const nextSubject = searchParams.get("subject") ?? "";
    setSubject((current) => (current === nextSubject ? current : nextSubject));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadTutors() {
      const authenticated = await hasAuthToken();
      if (cancelled) return;
      if (!authenticated) { router.push("/login"); return; }

      const nextSubject = searchParams.get("subject") ?? "";
      const preferredTutorId = searchParams.get("tutor_id") ?? searchParams.get("recommended") ?? "";

      try {
        const [searchResults, suggestionsResponse] = await Promise.all([
          searchTutors({ subject: nextSubject }),
          authedFetch<TutorSuggestion[]>("/tutors/suggestions?limit=6"),
        ]);
        if (!cancelled) {
          setSuggestions(suggestionsResponse);
          if (preferredTutorId) {
            setShowAllTutors(true);
            setSelectedTutorId(preferredTutorId);
            if (!searchResults.some((t) => t.user_id === preferredTutorId)) {
              const suggestedTutor = suggestionsResponse.find((t) => t.user_id === preferredTutorId);
              if (suggestedTutor) {
                setTutors((current) =>
                  current.some((t) => t.user_id === suggestedTutor.user_id)
                    ? current
                    : [suggestedTutor, ...current],
                );
              }
            }
          }
        }
      } catch (error: unknown) {
        if (!cancelled) setStatusMessage(error instanceof Error ? error.message : "Failed to load tutors.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTutors();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  useEffect(() => {
    if (!selectedTutorId) { setReviews([]); return; }
    authedFetch<TutorReview[]>(`/tutors/${selectedTutorId}/reviews?limit=8`)
      .then((r) => setReviews(r))
      .catch(() => setReviews([]));
  }, [selectedTutorId]);

  async function handleFilter() {
    try {
      setLoading(true);
      setStatusMessage("");
      await searchTutors();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReachOut(peerUserId: string) {
    try {
      setStatusMessage("");
      const convo = await authedFetch<{ conversation_id: string }>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ peer_user_id: peerUserId }),
      });
      router.push(`/dashboard/chat?conversation=${convo.conversation_id}`);
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to start tutor conversation.");
    }
  }

  function handlePlanSession(tutor: TutorEntry) {
    router.push(`/dashboard/virtual-sessions?subject=${encodeURIComponent(tutor.current_courses[0] ?? "")}`);
  }

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          <div className="page-header">
            <h1 className="page-title">Tutors</h1>
            <p className="page-subtitle">Search and compare tutors.</p>
          </div>

          {statusMessage && <p className="mt-4 text-sm text-gray-700">{statusMessage}</p>}

          {/* Search */}
          <section className="page-card mt-6 p-5">
            <form onSubmit={(e) => { e.preventDefault(); handleFilter(); }} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-subtle)]" />
                <input
                  ref={nameInputRef}
                  className="field-shell w-full pl-9 pr-4"
                  placeholder="Search by tutor name or subject / course…"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                />
              </div>
              <button type="submit" disabled={loading} className="primary-button px-5 py-2 disabled:opacity-60">
                {loading ? "Searching…" : "Search"}
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="secondary-button flex items-center gap-1.5 px-4 py-2 text-sm"
              >
                Filters {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </form>

            {filtersOpen && (
              <div className="mt-4 border-t border-[color:var(--border)] pt-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <input className="field-shell" placeholder="Subject or course" value={subject} onChange={(e) => setSubject(e.target.value)} />
                  <input className="field-shell" placeholder="Grade level / year" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
                  <input className="field-shell" placeholder="Campus" value={campus} onChange={(e) => setCampus(e.target.value)} />
                  <input className="field-shell" placeholder="Faculty" value={faculty} onChange={(e) => setFaculty(e.target.value)} />
                  <select className="field-shell" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
                    <option value="0">Any rating</option>
                    <option value="3">3.0+</option>
                    <option value="3.5">3.5+</option>
                    <option value="4">4.0+</option>
                    <option value="4.5">4.5+</option>
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-white p-3 text-sm text-gray-700">
                    <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
                    Available tutors only
                  </label>
                </div>
                <button onClick={handleFilter} disabled={loading} className="primary-button mt-4 px-4 py-2 disabled:opacity-60">
                  Apply Filters
                </button>
              </div>
            )}
          </section>

          {/* Suggested */}
          {suggestions.length > 0 && (
            <section className="mt-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[color:var(--accent-strong)]" />
                  <h2 className="text-lg font-bold text-[color:var(--foreground)]">Suggested for You</h2>
                  <span className="ml-1 rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--accent-strong)]">
                    Based on your weak topics
                  </span>
                </div>
                <button onClick={() => setShowAllTutors((v) => !v)} className="secondary-button px-4 py-2 text-sm">
                  {showAllTutors ? "Hide All Tutors" : "View All Tutors"}
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2">
                {suggestions.map((tutor) => (
                  <article key={tutor.user_id} className="page-card-strong min-w-[290px] max-w-[320px] rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[color:var(--foreground)]">{tutor.full_name ?? tutor.email}</p>
                        <p className="mt-0.5 text-xs text-[color:var(--ink-muted)]">
                          {tutor.faculty ?? ""}{tutor.campus ? ` • ${tutor.campus}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-2 py-1">
                        <Star size={11} className="text-[color:var(--accent-strong)]" fill="currentColor" />
                        <span className="text-xs font-bold text-[color:var(--accent-strong)]">
                          {(tutor.match_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {tutor.topic_overlaps.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {tutor.topic_overlaps.map((topic) => (
                          <span key={topic} className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--accent-strong)]">
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-[color:var(--ink-muted)]">{tutor.match_reason}</p>

                    <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--ink-muted)]">
                      <span>{tutor.credibility_score.toFixed(1)} ★ ({tutor.ratings_count} reviews)</span>
                      {tutor.upcoming_sessions_count > 0 && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">Available</span>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => openProfile(tutor)}
                        className="secondary-button flex-1 px-3 py-2 text-xs"
                      >
                        View Profile
                      </button>
                      <button
                        onClick={() => void handleReachOut(tutor.user_id)}
                        className="primary-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"
                      >
                        <MessageCircle size={13} />
                        Reach Out
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Directory */}
          <section id="tutor-list" className="mt-6">
            <button
              onClick={() => setShowAllTutors((v) => !v)}
              className="secondary-button inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              {showAllTutors ? "Collapse Tutor Directory" : "Open Tutor Directory"}
              {showAllTutors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAllTutors && (
              <div className="mt-4 space-y-4">
                {tutors.map((tutor) => (
                  <article
                    key={tutor.user_id}
                    className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">{tutor.full_name ?? tutor.email}</h2>
                        <p className="text-sm text-gray-600">{tutor.email}</p>
                        <p className="mt-1 text-sm text-gray-700">
                          {tutor.year_of_study || "N/A"} • {tutor.faculty || "No faculty"} • {tutor.campus || "No campus"}
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          Rating: {tutor.credibility_score.toFixed(2)} ({tutor.ratings_count} reviews) • {tutor.upcoming_sessions_count} upcoming sessions
                        </p>
                      </div>
                      <button
                        onClick={() => openProfile(tutor)}
                        className="secondary-button shrink-0 px-3 py-2 text-sm"
                      >
                        View Profile
                      </button>
                    </div>

                    <p className="mt-3 text-sm text-gray-700">{tutor.strengths || "No strengths listed yet."}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {tutor.badges.map((badge) => (
                        <span key={badge.code} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          {badge.label}
                        </span>
                      ))}
                      {tutor.badges.length === 0 && (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">No badges yet</span>
                      )}
                    </div>

                    <div className="mt-3 text-sm text-gray-600">
                      Courses: {tutor.current_courses.length ? tutor.current_courses.join(", ") : "No courses listed"}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleReachOut(tutor.user_id)}
                        className="primary-button inline-flex items-center gap-1.5 px-4 py-2 text-sm"
                      >
                        <MessageCircle size={14} />
                        Reach Out
                      </button>
                      <button
                        onClick={() => handlePlanSession(tutor)}
                        className="secondary-button px-4 py-2 text-sm"
                      >
                        Plan Session
                      </button>
                    </div>
                  </article>
                ))}
                {!loading && tutors.length === 0 && (
                  <p className="page-card rounded-xl p-4 text-sm text-gray-600">No tutors matched your filters.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Profile overlay */}
      {overlayTutor && (
        <TutorProfileOverlay
          tutor={overlayTutor}
          reviews={selectedTutor?.user_id === overlayTutor.user_id ? reviews : []}
          onClose={() => setOverlayTutor(null)}
          onReachOut={handleReachOut}
          onPlanSession={handlePlanSession}
        />
      )}
    </div>
  );
}

export default function TutorsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <Sidebar />
          <main className="page-main">
            <div className="page-content">
              <p className="mt-4 text-sm text-[color:var(--ink-muted)]">Loading tutors...</p>
            </div>
          </main>
        </div>
      }
    >
      <TutorsPageContent />
    </Suspense>
  );
}
