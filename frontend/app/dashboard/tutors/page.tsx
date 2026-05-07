"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Mail, MessageCircle, Search, Sparkles, Star } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

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

type ChatConversationSummary = {
  conversation_id: string;
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

const COURSE_CODE_TO_TITLE: Record<string, string> = {
  COMP1126: "Introduction to Computing I",
  COMP1127: "Introduction to Computing II",
  COMP1161: "Object-Oriented Programming",
  COMP1210: "Mathematics for Computing",
  COMP2130: "Systems Programming",
  COMP2140: "Software Engineering",
  COMP2171: "Object Oriented Design and Implementation",
  COMP2190: "Net-Centric Computing",
  COMP2201: "Discrete Mathematics for Computer Science",
  COMP2211: "Analysis of Algorithms",
  COMP2340: "Computer Systems Organization",
  INFO2101: "Probability and Statistics for Computing",
  INFO2111: "Data Structures",
  INFO2180: "Dynamic Web Development I",
  COMP3101: "Operating Systems",
  COMP3161: "Database Management Systems",
  COMP3191: "Principles of Computer Networking",
  COMP3220: "Principles of Artificial Intelligence",
  COMP3652: "Language Processors",
  SWEN3165: "Software Testing",
};

function resolveCourseLabel(code: string): string {
  return COURSE_CODE_TO_TITLE[code] ?? code;
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
  const [reachingOutTutorId, setReachingOutTutorId] = useState("");
  const suggestionsRailRef = useRef<HTMLDivElement>(null);

  const selectedTutor = useMemo(() => tutors.find((item) => item.user_id === selectedTutorId) ?? null, [selectedTutorId, tutors]);

  async function searchTutors(overrides?: Partial<{ subject: string; nameQuery: string }>) {
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
  }

  useEffect(() => {
    const nextSubject = searchParams.get("subject") ?? "";
    setSubject((current) => (current === nextSubject ? current : nextSubject));
  }, [searchParams]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const nextSubject = searchParams.get("subject") ?? "";

    Promise.all([
      searchTutors({ subject: nextSubject }),
      authedFetch<TutorSuggestion[]>("/tutors/suggestions?limit=6"),
    ])
      .then(([, suggestionsResponse]) => {
        setSuggestions(suggestionsResponse);
      })
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load tutors.");
      })
      .finally(() => setLoading(false));
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

  async function handleReachOut(tutor: TutorSuggestion) {
    try {
      setStatusMessage("");
      setReachingOutTutorId(tutor.user_id);
      const conversation = await authedFetch<ChatConversationSummary>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ peer_user_id: tutor.user_id }),
      });
      router.push(`/dashboard/chat?conversation=${encodeURIComponent(conversation.conversation_id)}`);
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Could not open chat with tutor.");
    } finally {
      setReachingOutTutorId("");
    }
  }

  function scrollSuggestions(direction: "left" | "right") {
    const rail = suggestionsRailRef.current;
    if (!rail) return;
    const distance = Math.max(320, Math.floor(rail.clientWidth * 0.82));
    rail.scrollBy({ left: direction === "right" ? distance : -distance, behavior: "smooth" });
  }

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content max-w-7xl overflow-x-hidden">
        <div className="page-header">
          <h1 className="page-title">Tutors</h1>
          <p className="page-subtitle">Search and compare tutors.</p>
        </div>

        {statusMessage && <p className="mt-4 text-sm text-gray-700">{statusMessage}</p>}

        <section className="page-card mt-6 p-5">
          {/* Primary search bar */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleFilter(); }}
            className="flex flex-col gap-2 sm:flex-row"
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
              className="primary-button w-full px-5 py-2 disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="secondary-button flex w-full items-center justify-center gap-1.5 px-4 py-2 text-sm sm:w-auto"
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Sparkles size={18} className="text-[color:var(--accent-strong)]" />
              <h2 className="text-lg font-bold text-[color:var(--foreground)]">Suggested for You</h2>
              <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--accent-strong)]">
                Based on your weak topics
              </span>
              <div className="ml-auto hidden items-center gap-2 md:flex">
                <button
                  type="button"
                  aria-label="Scroll suggestions left"
                  onClick={() => scrollSuggestions("left")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-[color:var(--ink-muted)] transition hover:text-[color:var(--foreground)]"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Scroll suggestions right"
                  onClick={() => scrollSuggestions("right")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-[color:var(--ink-muted)] transition hover:text-[color:var(--foreground)]"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div
              ref={suggestionsRailRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {suggestions.map((tutor) => (
                <article
                  key={tutor.user_id}
                  className="page-card-strong min-h-[275px] min-w-[92%] snap-start rounded-3xl border border-[color:var(--border)] bg-gradient-to-br from-white via-white to-[color:var(--accent-soft)] p-5 shadow-[0_18px_44px_-32px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5 sm:min-w-[20rem] sm:p-6 lg:min-w-[22rem] xl:min-w-[24rem]"
                  onClick={() => {
                    setSelectedTutorId(tutor.user_id);
                    document.getElementById("tutor-list")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[color:var(--foreground)]">{tutor.full_name ?? tutor.email}</p>
                      <p className="mt-0.5 text-xs text-[color:var(--ink-muted)]">{tutor.faculty ?? ""}{tutor.campus ? ` • ${tutor.campus}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-2.5 py-1.5">
                      <Star size={12} className="text-[color:var(--accent-strong)]" fill="currentColor" />
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

                  <p className="mt-3 min-h-[44px] text-sm leading-5 text-[color:var(--ink-muted)] line-clamp-2">{tutor.match_reason}</p>

                  <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--ink-muted)]">
                    <span>{tutor.credibility_score.toFixed(1)} ★ ({tutor.ratings_count} reviews)</span>
                    {tutor.upcoming_sessions_count > 0 && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 font-medium">
                        Available
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="secondary-button inline-flex items-center justify-center px-3 py-2 text-xs"
                      onClick={() => {
                        setSelectedTutorId(tutor.user_id);
                        document.getElementById("tutor-list")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      View
                    </button>
                    <a
                      href={`mailto:${tutor.email}`}
                      className="secondary-button inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs"
                    >
                      <Mail size={12} />
                      Email
                    </a>
                    <button
                      type="button"
                      onClick={() => handleReachOut(tutor)}
                      disabled={reachingOutTutorId === tutor.user_id}
                      className="primary-button inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs disabled:opacity-60"
                    >
                      <MessageCircle size={12} />
                      {reachingOutTutorId === tutor.user_id ? "Opening..." : "Message"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="tutor-list" className="mt-6 grid gap-6 lg:grid-cols-[0.62fr_0.38fr]">
          <div className="space-y-4">
            {tutors.map((tutor) => (
              <article
                key={tutor.user_id}
                className={`rounded-2xl border p-5 shadow-sm ${
                  tutor.user_id === selectedTutorId ? "border-[color:var(--accent)] bg-[rgba(130,180,255,0.12)]" : "border-[color:var(--border)] bg-white"
                }`}
              >
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
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
                    className="secondary-button w-full px-3 py-2 text-sm hover:bg-white sm:w-auto"
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
                  Courses: {tutor.current_courses.length
                    ? tutor.current_courses.map(resolveCourseLabel).join(", ")
                    : "No courses listed"}
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
