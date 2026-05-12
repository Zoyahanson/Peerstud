"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, Flame, GraduationCap, Lightbulb, Rocket, Star } from "lucide-react";
import Sidebar from "../../components/sidebar";
import { authedFetch, hasAuthToken } from "../../lib/api";

type UserSettings = {
  desktop_reminders: boolean;
  reminder_minutes_before: number;
};

type UserProfile = {
  user_id: string;
  full_name: string | null;
};

type SessionItem = {
  id: string;
  topic_focus: string;
  classroom_name: string;
  start_time: string;
  joined: boolean;
  participant_count: number;
  meet_link: string | null;
  average_rating?: number | null;
};

type TutorSuggestion = {
  user_id: string;
  full_name: string | null;
  match_score: number;
  match_reason?: string;
};

type StudyGroupItem = {
  id: string;
  course_id: string;
  course_title: string;
  topic_focus: string;
  member_count: number;
  open_slots: number;
  scheduled_start: string;
};

type ResourceItem = {
  id: string;
  course_id: string;
  title: string;
  resource_type: string;
  created_at: string;
};

type UserCourse = {
  title: string;
  proficiency: "weak" | "average" | "strong";
  strong_topics: string[];
  need_topics: string[];
};

type StudentLeaderboardEntry = {
  rank: number;
  user_id: string;
  full_name: string | null;
  study_points: number;
  streak_days: number;
};

function pickUpcomingSessions(sessionItems: SessionItem[], currentTime: number): SessionItem[] {
  return sessionItems
    .filter((session) => new Date(session.start_time).getTime() >= currentTime)
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
    .slice(0, 3);
}

function uniqueTokens(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionItem[]>([]);
  const [allSessions, setAllSessions] = useState<SessionItem[]>([]);
  const [tutorSuggestions, setTutorSuggestions] = useState<TutorSuggestion[]>([]);
  const [studyGroups, setStudyGroups] = useState<StudyGroupItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [myCourses, setMyCourses] = useState<UserCourse[]>([]);
  const [leaderboard, setLeaderboard] = useState<StudentLeaderboardEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        const [
          profileResponse,
          settingsResponse,
          sessionsResponse,
          suggestionsResponse,
          groupsResponse,
          resourcesResponse,
          coursesResponse,
          leaderboardResponse,
        ] = await Promise.all([
          authedFetch<UserProfile>("/users/me/profile"),
          authedFetch<UserSettings>("/users/me/settings"),
          authedFetch<SessionItem[]>("/sessions"),
          authedFetch<TutorSuggestion[]>("/tutors/suggestions?limit=4").catch(() => []),
          authedFetch<StudyGroupItem[]>("/study-groups").catch(() => []),
          authedFetch<ResourceItem[]>("/resources").catch(() => []),
          authedFetch<UserCourse[]>("/courses/mine").catch(() => []),
          authedFetch<StudentLeaderboardEntry[]>("/leaderboard/students?limit=5").catch(() => []),
        ]);
        if (cancelled) {
          return;
        }
        setProfile(profileResponse);
        setSettings(settingsResponse);
        setAllSessions(sessionsResponse);
        setUpcomingSessions(pickUpcomingSessions(sessionsResponse, Date.now()));
        setTutorSuggestions(suggestionsResponse);
        setStudyGroups(groupsResponse.slice(0, 4));
        setResources(resourcesResponse.slice(0, 4));
        setMyCourses(coursesResponse);
        setLeaderboard(leaderboardResponse.slice(0, 3));
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load dashboard overview.");
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - now.getDay());

  const sessionsThisWeek = allSessions.filter((session) => new Date(session.start_time) >= weekStart).length;
  const averageRatingCandidates = allSessions
    .map((session) => session.average_rating)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  const averageRating = averageRatingCandidates.length
    ? averageRatingCandidates.reduce((sum, score) => sum + score, 0) / averageRatingCandidates.length
    : 4.7;

  const strengths = uniqueTokens(
    myCourses.flatMap((course) => [
      ...(course.proficiency === "strong" ? [course.title] : []),
      ...course.strong_topics,
    ]),
  ).slice(0, 8);
  const needs = uniqueTokens(
    myCourses.flatMap((course) => [
      ...(course.proficiency === "weak" ? [course.title] : []),
      ...course.need_topics,
    ]),
  ).slice(0, 8);

  const subjectsMastered = myCourses.filter((course) => course.proficiency === "strong").length;
  const studyHours = Math.max(12.5, Number((sessionsThisWeek * 1.5).toFixed(1)));

  const meFromLeaderboard = leaderboard.find((entry) => entry.user_id === profile?.user_id);
  const streakDays = meFromLeaderboard?.streak_days ?? 7;

  const progressBars = [
    { label: "Weekly consistency", value: Math.min(100, sessionsThisWeek * 20) },
    { label: "Subject mastery", value: Math.min(100, subjectsMastered * 25) },
    { label: "Collaboration momentum", value: Math.min(100, tutorSuggestions.length * 24) },
  ];

  const quickActions = [
    { label: "Start instant session", href: "/dashboard/virtual-sessions" },
    { label: "Schedule session", href: "/dashboard/virtual-sessions" },
    { label: "Create group", href: "/dashboard/study-groups" },
  ];

  const firstName = profile?.full_name?.trim().split(" ")[0] || "Scholar";

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          {statusMessage && <p className="mb-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          <section className="page-card-strong overflow-hidden p-6 sm:p-8">
            <p className="section-kicker">Dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
              Welcome back, {firstName}!
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[color:var(--ink-muted)]">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5">
                <Flame size={16} className="text-[color:var(--accent-strong)]" />
                Current streak: {streakDays} days
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5">
                <CalendarClock size={16} className="text-[color:var(--navy)]" />
                Study hours: {studyHours.toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5">
                <Rocket size={16} className="text-[color:var(--accent-strong)]" />
                {settings?.desktop_reminders ? `${settings.reminder_minutes_before}m reminders on` : "Desktop reminders off"}
              </span>
            </div>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_2fr_1fr]">
            <div className="space-y-6">
              <article className="glass-panel rounded-[1.6rem] p-5">
                <p className="section-kicker">Quick Stats</p>
                <div className="mt-4 space-y-3 text-sm text-[color:var(--ink-muted)]">
                  <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                    <span>Sessions this week</span>
                    <span className="font-semibold text-[color:var(--foreground)]">{sessionsThisWeek}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                    <span>Average rating</span>
                    <span className="font-semibold text-[color:var(--foreground)]">{averageRating.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                    <span>Subjects mastered</span>
                    <span className="font-semibold text-[color:var(--foreground)]">{subjectsMastered}</span>
                  </div>
                </div>
              </article>

              <article className="page-card rounded-[1.6rem] border p-5">
                <p className="section-kicker">Your Strengths and Needs</p>
                <div className="mt-4">
                  <p className="soft-label mb-2">Strengths</p>
                  <div className="flex flex-wrap gap-2">
                    {(strengths.length ? strengths : ["Problem Solving", "Explanations"]).map((tag) => (
                      <span key={`strong-${tag}`} className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-strong)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="soft-label mb-2">Needs help</p>
                  <div className="flex flex-wrap gap-2">
                    {(needs.length ? needs : ["Practice Sets", "Exam Strategy"]).map((tag) => (
                      <span key={`need-${tag}`} className="rounded-full bg-[color:var(--navy-tint)] px-3 py-1 text-xs font-semibold text-[color:var(--navy)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>

              <article className="glass-panel rounded-[1.6rem] p-5">
                <p className="section-kicker">Progress Tracker</p>
                <div className="mt-4 space-y-4">
                  {progressBars.map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-xs text-[color:var(--ink-muted)]">
                        <span>{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-[color:var(--background-alt)]">
                        <div className="h-2 rounded-full bg-[linear-gradient(90deg,var(--accent),var(--navy))]" style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="space-y-6">
              <article className="glass-panel-strong rounded-[1.8rem] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="section-kicker">Suggested Tutors</p>
                    <h2 className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">Recommended tutors</h2>
                  </div>
                  <Star className="text-[color:var(--accent-strong)]" size={20} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tutorSuggestions.map((tutor) => (
                    <button
                      key={tutor.user_id}
                      onClick={() =>
                        router.push(
                          `/dashboard/tutors?tutor_id=${encodeURIComponent(tutor.user_id)}&recommended=${encodeURIComponent(tutor.user_id)}`,
                        )
                      }
                      className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/80 p-4 text-left transition hover:border-[color:var(--accent)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                    >
                      <p className="font-semibold text-[color:var(--foreground)]">{tutor.full_name ?? "Tutor"}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[color:var(--ink-muted)]">Match score</p>
                      <p className="mt-1 text-xl font-black text-[color:var(--accent-strong)]">
                        {Math.round((tutor.match_score ?? 0.0) * 100)}%
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--ink-muted)] truncate">
                        {tutor.match_reason ?? "Recommended based on your learning needs."}
                      </p>
                    </button>
                  ))}
                  {tutorSuggestions.length === 0 && (
                    <p className="rounded-[1rem] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink-muted)]">
                      No tutor suggestions yet. Try updating your profile or search filters.
                    </p>
                  )}
                </div>
              </article>

              <article className="page-card rounded-[1.8rem] border p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="section-kicker">Active Study Groups</p>
                    <h2 className="mt-1 text-xl font-bold text-[color:var(--foreground)]">Compact view</h2>
                  </div>
                  <GraduationCap className="text-[color:var(--navy)]" size={20} />
                </div>
                <div className="space-y-3">
                  {studyGroups.slice(0, 3).map((group) => (
                    <button
                      key={group.id}
                      onClick={() =>
                        router.push(
                          `/dashboard/study-groups?course_id=${encodeURIComponent(group.course_id)}&group_id=${encodeURIComponent(group.id)}`,
                        )
                      }
                      className="w-full rounded-xl bg-white/70 px-4 py-3 text-left text-sm transition hover:bg-white"
                    >
                      <p className="font-semibold text-[color:var(--foreground)]">{group.topic_focus}</p>
                      <p className="text-[color:var(--ink-muted)]">{group.course_title} | {group.member_count} members | {group.open_slots} open</p>
                    </button>
                  ))}
                  {studyGroups.length === 0 && (
                    <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-[color:var(--ink-muted)]">
                      No active groups yet. Create one from Study Groups.
                    </p>
                  )}
                </div>
              </article>

              <article className="glass-panel rounded-[1.8rem] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="section-kicker">Recent Resources</p>
                    <h2 className="mt-1 text-xl font-bold text-[color:var(--foreground)]">Latest uploads</h2>
                  </div>
                  <Lightbulb className="text-[color:var(--accent-strong)]" size={20} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {resources.map((resource) => (
                    <button
                      key={resource.id}
                      onClick={() =>
                        router.push(
                          `/dashboard/resources?course_id=${encodeURIComponent(resource.course_id)}&resource_id=${encodeURIComponent(resource.id)}`,
                        )
                      }
                      className="rounded-xl border border-[color:var(--border)] bg-white/80 p-4 text-left transition hover:border-[color:var(--accent)] hover:bg-white"
                    >
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">{resource.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[color:var(--ink-muted)]">{resource.resource_type}</p>
                      <p className="mt-2 text-xs text-[color:var(--ink-muted)]">{new Date(resource.created_at).toLocaleDateString()}</p>
                    </button>
                  ))}
                  {resources.length === 0 && (
                    <p className="rounded-xl bg-white/80 p-4 text-sm text-[color:var(--ink-muted)]">
                      No resources yet. Upload one to start your shared vault.
                    </p>
                  )}
                </div>
              </article>

            </div>

            <div className="space-y-6">
              <article className="glass-panel rounded-[1.6rem] p-5">
                <p className="section-kicker">Upcoming Sessions</p>
                <div className="mt-4 space-y-4 border-l-2 border-[color:var(--border)] pl-4">
                  {upcomingSessions.map((session) => (
                    <div key={session.id} className="relative">
                      <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full bg-[color:var(--accent)]" />
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">{new Date(session.start_time).toLocaleString()}</p>
                      <p className="text-sm text-[color:var(--ink-muted)]">{session.topic_focus}</p>
                    </div>
                  ))}
                  {upcomingSessions.length === 0 && (
                    <p className="text-sm text-[color:var(--ink-muted)]">No sessions scheduled yet.</p>
                  )}
                </div>
              </article>

              <article className="page-card rounded-[1.6rem] border p-5">
                <p className="section-kicker">Quick Actions</p>
                <div className="mt-4 space-y-3">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => router.push(action.href)}
                      className="flex w-full items-center justify-between rounded-xl border border-[color:var(--border)] bg-white/80 px-4 py-3 text-left text-sm font-semibold text-[color:var(--foreground)] hover:-translate-y-0.5"
                    >
                      {action.label}
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              </article>

              <article className="glass-panel rounded-[1.6rem] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="section-kicker">Leaderboard Snippet</p>
                  <Star size={16} className="text-[color:var(--accent-strong)]" />
                </div>
                <div className="space-y-2">
                  {leaderboard.map((entry) => (
                    <div key={entry.user_id} className="flex items-center justify-between rounded-xl bg-white/75 px-3 py-2 text-sm">
                      <p className="font-medium text-[color:var(--foreground)]">#{entry.rank} {entry.full_name ?? "Peer"}</p>
                      <p className="text-[color:var(--ink-muted)]">{entry.study_points} pts</p>
                    </div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="rounded-xl bg-white/75 px-3 py-2 text-sm text-[color:var(--ink-muted)]">Leaderboard data will appear after more activity.</p>
                  )}
                </div>
              </article>
            </div>

            <article className="page-card rounded-[1.8rem] border p-6 xl:col-span-3">
              <p className="section-kicker">Study Streak Calendar</p>
              <div className="mt-4 grid grid-cols-7 gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => {
                  const lit = index <= now.getDay();
                  return (
                    <div key={day} className={`rounded-xl px-2 py-3 text-center text-xs font-semibold ${lit ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]" : "bg-[color:var(--background-alt)] text-[color:var(--ink-subtle)]"}`}>
                      <p>{day}</p>
                      <p className="mt-1">{lit ? "Done" : "-"}</p>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}

