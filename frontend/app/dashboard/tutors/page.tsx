"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, MessageCircle, Search, Sparkles, Star } from "lucide-react";
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

  const selectedTutor = useMemo(() => tutors.find((item) => item.user_id === selectedTutorId) ?? null, [selectedTutorId, tutors]);

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
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

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

            if (!searchResults.some((tutor) => tutor.user_id === preferredTutorId)) {
              const suggestedTutor = suggestionsResponse.find((tutor) => tutor.user_id === preferredTutorId);
              if (suggestedTutor) {
                setTutors((current) =>
                  current.some((tutor) => tutor.user_id === suggestedTutor.user_id)
                    ? current
                    : [suggestedTutor, ...current],
                );
              }
            }
          }
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load tutors.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTutors();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  useEffect(() => {
    if (!selectedTutorId) {
      setReviews([]);
      return;
    }
    authedFetch<TutorReview[]>(`/tutors/${selectedTutorId}/reviews?limit=8`)
      .then((response) => setReviews(response))
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

        <section className="page-card mt-6 p-5">
          {/* Primary search bar */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleFilter(); }}
            className="flex gap-2"
          >
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
            <button
              type="submit"
              disabled={loading}
              className="primary-button px-5 py-2 disabled:opacity-60"
            >
              {loading ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="secondary-button flex items-center gap-1.5 px-4 py-2 text-sm"
            >
              Filters
              {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </form>

          {/* Collapsible advanced filters */}
          {filtersOpen && (
            <div className="mt-4 border-t border-[color:var(--border)] pt-4">
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  className="field-shell"
                  placeholder="Subject or course"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
                <input
                  className="field-shell"
                  placeholder="Grade level / year"
                  value={gradeLevel}
                  onChange={(event) => setGradeLevel(event.target.value)}
                />
                <input
                  className="field-shell"
                  placeholder="Campus"
                  value={campus}
                  onChange={(event) => setCampus(event.target.value)}
                />
                <input
                  className="field-shell"
                  placeholder="Faculty"
                  value={faculty}
                  onChange={(event) => setFaculty(event.target.value)}
                />
                <select
                  className="field-shell"
                  value={minRating}
                  onChange={(event) => setMinRating(event.target.value)}
                >
                  <option value="0">Any rating</option>
                  <option value="3">3.0+</option>
                  <option value="3.5">3.5+</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                </select>
                <label className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-white p-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={availableOnly}
                    onChange={(event) => setAvailableOnly(event.target.checked)}
                  />
                  Available tutors only
                </label>
              </div>
              <button
                onClick={handleFilter}
                disabled={loading}
                className="primary-button mt-4 px-4 py-2 disabled:opacity-60"
              >
                Apply Filters
              </button>
            </div>
          )}
        </section>

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
              <button
                onClick={() => setShowAllTutors((current) => !current)}
                className="secondary-button px-4 py-2 text-sm"
              >
                {showAllTutors ? "Hide All Tutors" : "View All Tutors"}
              </button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
              {suggestions.map((tutor) => (
                <article
                  key={tutor.user_id}
                  className="page-card-strong min-w-[290px] max-w-[320px] rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[color:var(--foreground)]">{tutor.full_name ?? tutor.email}</p>
                      <p className="mt-0.5 text-xs text-[color:var(--ink-muted)]">{tutor.faculty ?? ""}{tutor.campus ? ` • ${tutor.campus}` : ""}</p>
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

                  <p className="mt-3 text-xs leading-5 text-[color:var(--ink-muted)] line-clamp-2">{tutor.match_reason}</p>

                  <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--ink-muted)]">
                    <span>{tutor.credibility_score.toFixed(1)} ★ ({tutor.ratings_count} reviews)</span>
                    {tutor.upcoming_sessions_count > 0 && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 font-medium">
                        Available
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedTutorId(tutor.user_id);
                        setShowAllTutors(true);
                        document.getElementById("tutor-list")?.scrollIntoView({ behavior: "smooth" });
                      }}
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

        <section id="tutor-list" className="mt-6">
          <button
            onClick={() => setShowAllTutors((current) => !current)}
            className="secondary-button inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            {showAllTutors ? "Collapse Tutor Directory" : "Open Tutor Directory"}
            {showAllTutors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAllTutors && (
          <div className="mt-4 grid gap-6 xl:grid-cols-[0.62fr_0.38fr]">
          <div className="space-y-4">
            {tutors.map((tutor) => (
              <article
                key={tutor.user_id}
                className={`rounded-2xl border p-5 shadow-sm ${
                  tutor.user_id === selectedTutorId ? "border-[color:var(--accent)] bg-[rgba(130,180,255,0.12)]" : "border-[color:var(--border)] bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{tutor.full_name ?? tutor.email}</h2>
                    <p className="text-sm text-gray-600">{tutor.email}</p>
                    <p className="mt-1 text-sm text-gray-700">
                      {tutor.year_of_study || "N/A"} • {tutor.faculty || "No faculty"} • {tutor.campus || "No campus"}
                    </p>
                    <p className="mt-2 text-sm text-gray-700">
                      Rating: {tutor.credibility_score.toFixed(2)} ({tutor.ratings_count} reviews)
                    </p>
                    <p className="text-sm text-gray-700">Upcoming sessions: {tutor.upcoming_sessions_count}</p>
                  </div>
                  <button
                    onClick={() => setSelectedTutorId(tutor.user_id)}
                    className="secondary-button px-3 py-2 text-sm hover:bg-white"
                  >
                    View Feedback
                  </button>
                </div>

                <p className="mt-3 text-sm text-gray-700">{tutor.strengths || "No strengths listed yet."}</p>
                <p className="mt-1 text-sm text-gray-700">{tutor.qualifications || "No qualifications listed."}</p>
                <p className="mt-1 text-sm text-gray-700">{tutor.tutoring_experience || "No tutoring history listed."}</p>

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
                    onClick={() => router.push(`/dashboard/virtual-sessions?subject=${encodeURIComponent(tutor.current_courses[0] ?? "")}`)}
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

          <aside className="page-card p-5 shadow">
            <h3 className="text-lg font-semibold text-gray-900">Reviews</h3>
            <p className="mt-1 text-sm text-gray-600">{selectedTutor?.full_name ?? "Selected tutor"}</p>

            <div className="mt-4 space-y-3">
              {reviews.map((review, index) => (
                <article key={`${review.session_id}-${review.created_at}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-gray-900">{review.score} / 5</p>
                  <p className="mt-1 text-sm text-gray-700">{review.feedback || "No written feedback."}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    by {review.rater_name || "Anonymous peer"} • {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </article>
              ))}
              {!loading && reviews.length === 0 && (
                <p className="text-sm text-gray-500">No review feedback yet.</p>
              )}
            </div>
          </aside>
          </div>
          )}
        </section>
        </div>
      </main>
    </div>
  );
}

export default function TutorsPage() {
  return (
    <Suspense fallback={<div className="page-shell"><Sidebar /><main className="page-main"><div className="page-content"><p className="mt-4 text-sm text-[color:var(--ink-muted)]">Loading tutors...</p></div></main></div>}>
      <TutorsPageContent />
    </Suspense>
  );
}
