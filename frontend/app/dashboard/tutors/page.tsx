"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

type TutorReview = {
  session_id: string;
  score: number;
  feedback: string | null;
  created_at: string;
  rater_name: string | null;
};

function buildQuery(filters: {
  subject: string;
  gradeLevel: string;
  minRating: string;
  campus: string;
  faculty: string;
  availableOnly: boolean;
}): string {
  const params = new URLSearchParams();
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
  const [subject, setSubject] = useState(() => searchParams.get("subject") ?? "");
  const [gradeLevel, setGradeLevel] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [campus, setCampus] = useState("");
  const [faculty, setFaculty] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [tutors, setTutors] = useState<TutorEntry[]>([]);
  const [selectedTutorId, setSelectedTutorId] = useState("");
  const [reviews, setReviews] = useState<TutorReview[]>([]);

  const selectedTutor = useMemo(() => tutors.find((item) => item.user_id === selectedTutorId) ?? null, [selectedTutorId, tutors]);

  async function searchTutors(overrides?: Partial<{ subject: string }>) {
    const query = buildQuery({
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

    searchTutors({ subject: nextSubject })
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
            {loading ? "Searching..." : "Apply Filters"}
          </button>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.62fr_0.38fr]">
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
              {reviews.map((review) => (
                <article key={`${review.session_id}-${review.created_at}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
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
