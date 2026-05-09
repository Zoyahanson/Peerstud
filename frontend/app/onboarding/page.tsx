"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch, hasAuthToken } from "../../lib/api";

type CourseSummary = {
  id: string;
  title: string;
  description: string | null;
};

type CourseSelection = {
  course_id: string;
  title: string;
  proficiency: "weak" | "average" | "strong";
  strong_topics: string[];
  need_topics: string[];
};

type UserProfile = {
  full_name: string | null;
  year_of_study: string | null;
  faculty: string | null;
  major: string | null;
  current_courses: string[];
};

type UserSettings = {
  email_alerts: boolean;
  adaptive_layout: boolean;
  desktop_reminders: boolean;
  reminder_minutes_before: number;
  weekly_progress_digest: boolean;
  focus_mode_enabled: boolean;
  show_online_status: boolean;
  onboarding_completed: boolean;
  availability_slots: string[];
  matching_preference: string;
  study_style_preference: string;
  preferred_session_length_minutes: number;
  include_graduate_tutors: boolean;
};

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year+", "Graduate", "Postgraduate"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_KEYS = ["morning", "afternoon", "evening", "night"] as const;
const SLOT_LABELS: Record<(typeof SLOT_KEYS)[number], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

function parseTopicInput(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function levelFromCourseTitle(title: string): string {
  const digits = title.match(/\d/g);
  if (!digits || digits.length < 1) return "General";
  const level = Number(digits[0]);
  if (Number.isNaN(level) || level === 0) return "General";
  return `Level ${level}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [faculty, setFaculty] = useState("");
  const [major, setMajor] = useState("");

  const [allCourses, setAllCourses] = useState<CourseSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<CourseSelection[]>([]);

  const [availabilitySlots, setAvailabilitySlots] = useState<string[]>([]);
  const [matchingPreference, setMatchingPreference] = useState("peers_only");
  const [includeGraduateTutors, setIncludeGraduateTutors] = useState(false);
  const [studyStylePreference, setStudyStylePreference] = useState("both");
  const [preferredSessionLengthMinutes, setPreferredSessionLengthMinutes] = useState(60);

  const [settingsSnapshot, setSettingsSnapshot] = useState<UserSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const authenticated = await hasAuthToken();
      if (cancelled) return;
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        const [profile, settings, courses, mine] = await Promise.all([
          authedFetch<UserProfile>("/users/me/profile"),
          authedFetch<UserSettings>("/users/me/settings"),
          authedFetch<CourseSummary[]>("/courses"),
          authedFetch<CourseSelection[]>("/courses/mine").catch(() => []),
        ]);

        if (cancelled) return;

        if (settings.onboarding_completed) {
          router.push("/dashboard");
          return;
        }

        setName(profile.full_name ?? "");
        setYearOfStudy(profile.year_of_study ?? "");
        setFaculty(profile.faculty ?? "");
        setMajor(profile.major ?? "");

        setAllCourses(courses);
        setSelectedCourses(
          mine.map((item) => ({
            course_id: item.course_id,
            title: item.title,
            proficiency: item.proficiency,
            strong_topics: item.strong_topics ?? [],
            need_topics: item.need_topics ?? [],
          })),
        );

        setAvailabilitySlots(settings.availability_slots ?? []);
        setMatchingPreference(settings.matching_preference ?? "peers_only");
        setIncludeGraduateTutors(settings.include_graduate_tutors ?? false);
        setStudyStylePreference(settings.study_style_preference ?? "both");
        setPreferredSessionLengthMinutes(settings.preferred_session_length_minutes ?? 60);
        setSettingsSnapshot(settings);
      } catch (error: unknown) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load onboarding data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredCourseGroups = useMemo(() => {
    const filtered = allCourses.filter((course) => {
      if (!searchQuery.trim()) return true;
      return course.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    });

    const groups = filtered.reduce<Record<string, CourseSummary[]>>((acc, course) => {
      const key = levelFromCourseTitle(course.title);
      acc[key] = [...(acc[key] ?? []), course];
      return acc;
    }, {});

    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allCourses, searchQuery]);

  const progress = Math.round((step / 5) * 100);

  function toggleCourse(course: CourseSummary) {
    setSelectedCourses((current) => {
      const exists = current.some((entry) => entry.course_id === course.id);
      if (exists) {
        return current.filter((entry) => entry.course_id !== course.id);
      }
      return [
        ...current,
        {
          course_id: course.id,
          title: course.title,
          proficiency: "average",
          strong_topics: [],
          need_topics: [],
        },
      ];
    });
  }

  function updateCourseSelection(courseId: string, patch: Partial<CourseSelection>) {
    setSelectedCourses((current) =>
      current.map((entry) => (entry.course_id === courseId ? { ...entry, ...patch } : entry)),
    );
  }

  function toggleAvailabilitySlot(day: string, slot: (typeof SLOT_KEYS)[number]) {
    const key = `${day}-${slot}`;
    setAvailabilitySlots((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function applyPreset(preset: "weekday_evenings" | "weekend_mornings") {
    if (preset === "weekday_evenings") {
      setAvailabilitySlots((current) => {
        const merged = new Set(current);
        ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => merged.add(`${day}-evening`));
        return Array.from(merged);
      });
      return;
    }

    setAvailabilitySlots((current) => {
      const merged = new Set(current);
      ["Sat", "Sun"].forEach((day) => merged.add(`${day}-morning`));
      return Array.from(merged);
    });
  }

  async function handleCompleteOnboarding() {
    if (!settingsSnapshot) {
      setMessage("Settings are still loading. Please retry.");
      return;
    }

    try {
      setSubmitting(true);
      setMessage("");

      await authedFetch("/users/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          full_name: name || null,
          year_of_study: yearOfStudy || null,
          faculty: faculty || null,
          major: major || null,
          current_courses: selectedCourses.map((course) => course.title),
        }),
      });

      await authedFetch("/courses/mine", {
        method: "PUT",
        body: JSON.stringify(selectedCourses.map((course) => ({
          course_id: course.course_id,
          proficiency: course.proficiency,
          strong_topics: course.strong_topics,
          need_topics: course.need_topics,
          supplementary_tutor_user_id: null,
        }))),
      });

      await authedFetch("/users/me/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...settingsSnapshot,
          onboarding_completed: true,
          availability_slots: availabilitySlots,
          matching_preference: matchingPreference,
          study_style_preference: studyStylePreference,
          preferred_session_length_minutes: preferredSessionLengthMinutes,
          include_graduate_tutors: includeGraduateTutors,
        }),
      });

      setMessage("Finding your matches...");
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not complete onboarding.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page-main">
        <section className="page-content">
          <div className="page-card p-8 text-center text-sm text-[color:var(--ink-muted)]">Loading onboarding...</div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-main">
      <section className="page-content max-w-5xl">
        <div className="glass-panel-strong rounded-[2rem] p-6 sm:p-8">
          <p className="section-kicker">First-Time Experience</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[color:var(--foreground)]">Onboarding Wizard</h1>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[color:var(--background-alt)]">
            <div className="h-full rounded-full bg-[color:var(--accent)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-[color:var(--ink-muted)]">Step {step} of 5</p>

          {message && <p className="mt-4 text-sm text-[color:var(--accent-strong)]">{message}</p>}

          {step === 1 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="soft-label">Name</span>
                <input className="field-shell" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" />
              </label>
              <label className="space-y-2">
                <span className="soft-label">Year</span>
                <select className="field-shell" value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)}>
                  <option value="">Select year</option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="soft-label">Faculty</span>
                <input className="field-shell" value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="Faculty of Science" />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="soft-label">Major</span>
                <input className="field-shell" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="Computer Science" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-4">
              <label className="space-y-2">
                <span className="soft-label">Search Courses</span>
                <input className="field-shell" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Type a course code or title" />
              </label>

              <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-white/75 p-4">
                {filteredCourseGroups.map(([group, courses]) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-muted)]">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {courses.map((course) => {
                        const selected = selectedCourses.some((item) => item.course_id === course.id);
                        return (
                          <button
                            key={course.id}
                            onClick={() => toggleCourse(course)}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              selected
                                ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                                : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                            }`}
                          >
                            {course.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-[color:var(--foreground)]">Selected courses</p>
                <div className="flex flex-wrap gap-2">
                  {selectedCourses.length === 0 && <p className="text-sm text-[color:var(--ink-muted)]">No courses selected yet.</p>}
                  {selectedCourses.map((course) => (
                    <button
                      key={course.course_id}
                      onClick={() => setSelectedCourses((current) => current.filter((item) => item.course_id !== course.course_id))}
                      className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs text-[color:var(--foreground)]"
                    >
                      {course.title} x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 space-y-4">
              {selectedCourses.length === 0 && <p className="text-sm text-[color:var(--ink-muted)]">Select at least one course in Step 2 first.</p>}
              {selectedCourses.map((course) => (
                <div key={course.course_id} className="rounded-2xl border border-[color:var(--border)] bg-white/75 p-4">
                  <h3 className="text-sm font-bold text-[color:var(--foreground)]">{course.title}</h3>
                  <p className="mt-2 text-xs text-[color:var(--ink-muted)]">Net Centric: Need Help {">"} Expert</p>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    value={course.proficiency === "weak" ? 0 : course.proficiency === "average" ? 1 : 2}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      updateCourseSelection(course.course_id, {
                        proficiency: value === 0 ? "weak" : value === 1 ? "average" : "strong",
                      });
                    }}
                    className="mt-2 w-full"
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs text-[color:var(--ink-muted)]">Topics you're strong in (comma separated)</span>
                      <input
                        className="field-shell"
                        value={course.strong_topics.join(", ")}
                        onChange={(event) => updateCourseSelection(course.course_id, { strong_topics: parseTopicInput(event.target.value) })}
                        placeholder="indexes, joins"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-[color:var(--ink-muted)]">Topics you need help with (comma separated)</span>
                      <input
                        className="field-shell"
                        value={course.need_topics.join(", ")}
                        onChange={(event) => updateCourseSelection(course.course_id, { need_topics: parseTopicInput(event.target.value) })}
                        placeholder="normalization, constraints"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button className="secondary-button px-4 py-2 text-xs" onClick={() => applyPreset("weekday_evenings")}>Weekday evenings</button>
                <button className="secondary-button px-4 py-2 text-xs" onClick={() => applyPreset("weekend_mornings")}>Weekend mornings</button>
              </div>
              <div className="grid gap-2 rounded-2xl border border-[color:var(--border)] bg-white/80 p-3">
                <div className="grid grid-cols-8 gap-2 text-xs text-[color:var(--ink-muted)]">
                  <span />
                  {WEEK_DAYS.map((day) => (
                    <span key={day} className="text-center">{day}</span>
                  ))}
                </div>
                {SLOT_KEYS.map((slot) => (
                  <div key={slot} className="grid grid-cols-8 gap-2">
                    <span className="text-xs text-[color:var(--ink-muted)]">{SLOT_LABELS[slot]}</span>
                    {WEEK_DAYS.map((day) => {
                      const key = `${day}-${slot}`;
                      const active = availabilitySlots.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleAvailabilitySlot(day, slot)}
                          className={`h-8 rounded-lg border text-xs ${
                            active
                              ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                              : "border-[color:var(--border)] bg-white text-[color:var(--ink-muted)]"
                          }`}
                        >
                          {active ? "Free" : "-"}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="soft-label">Matching Mode</span>
                <select className="field-shell" value={matchingPreference} onChange={(e) => setMatchingPreference(e.target.value)}>
                  <option value="peers_only">Show me peers only</option>
                  <option value="include_tutors">Include graduate tutors</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="soft-label">Study Style</span>
                <select className="field-shell" value={studyStylePreference} onChange={(e) => setStudyStylePreference(e.target.value)}>
                  <option value="virtual">Virtual</option>
                  <option value="in_person">In-person</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="soft-label">Session Length</span>
                <select
                  className="field-shell"
                  value={String(preferredSessionLengthMinutes)}
                  onChange={(e) => setPreferredSessionLengthMinutes(Number(e.target.value))}
                >
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={includeGraduateTutors}
                  onChange={(e) => setIncludeGraduateTutors(e.target.checked)}
                />
                Include graduate tutors in match results
              </label>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              className="secondary-button px-4 py-2 text-sm"
              disabled={step === 1 || submitting}
            >
              Back
            </button>

            {step < 5 ? (
              <button
                onClick={() => setStep((current) => Math.min(5, current + 1))}
                className="primary-button px-5 py-2 text-sm"
                disabled={submitting}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleCompleteOnboarding}
                className="primary-button px-5 py-2 text-sm"
                disabled={submitting}
              >
                {submitting ? "Finding your matches..." : "Complete Onboarding"}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
