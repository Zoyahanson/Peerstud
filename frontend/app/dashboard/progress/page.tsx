"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/sidebar";
import { authedFetch, hasAuthToken } from "../../../lib/api";

type ProgressPoint = {
  label: string;
  hosted_sessions: number;
  joined_sessions: number;
};

type UserAnalytics = {
  hosted_sessions: number;
  joined_sessions: number;
  study_groups_joined: number;
  resources_shared: number;
  current_streak_days: number;
  milestones: string[];
  progress_points: ProgressPoint[];
  session_history: Array<{
    role: string;
    topic_focus: string;
    classroom_name: string;
    start_time: string;
    end_time: string;
  }>;
};

type UserProgress = {
  hosted_sessions: number;
  joined_sessions: number;
  study_groups_joined: number;
  resources_shared: number;
  current_streak_days: number;
};

type FriendProgress = {
  user_id: string;
  full_name: string | null;
  email: string;
  joined_sessions: number;
  resources_shared: number;
  current_streak_days: number;
  study_groups_joined: number;
};

export default function ProgressPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [friendsProgress, setFriendsProgress] = useState<FriendProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        const [analyticsResult, friendsRes] = await Promise.all([
          authedFetch<UserAnalytics>("/users/me/analytics").then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: null })),
          authedFetch<FriendProgress[]>("/users/me/friends/analytics").catch(() => [] as FriendProgress[]),
        ]);
        if (cancelled) {
          return;
        }
        if (analyticsResult.ok && analyticsResult.value) {
          setAnalytics(analyticsResult.value);
        } else {
          const progress = await authedFetch<UserProgress>("/users/me/progress");
          if (cancelled) {
            return;
          }
          setAnalytics({
            hosted_sessions: progress.hosted_sessions,
            joined_sessions: progress.joined_sessions,
            study_groups_joined: progress.study_groups_joined,
            resources_shared: progress.resources_shared,
            current_streak_days: progress.current_streak_days,
            milestones: [],
            progress_points: [],
            session_history: [],
          });
          setStatusMessage("Detailed analytics are still loading. Showing baseline progress instead.");
        }
        setFriendsProgress(friendsRes);
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load analytics.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const maxValue = useMemo(() => {
    if (!analytics?.progress_points.length) return 1;
    return Math.max(
      ...analytics.progress_points.map((item) => item.hosted_sessions + item.joined_sessions),
      1,
    );
  }, [analytics]);

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">Progress</h1>
          <p className="page-subtitle">Sessions, milestones, and streaks.</p>
        </div>

        {loading && <p className="mt-4 text-sm text-gray-600">Loading progress...</p>}
        {statusMessage && <p className="mt-4 text-sm text-[color:var(--ink-muted)]">{statusMessage}</p>}

        {analytics && (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-5">
              <article className="page-card p-4">
                <p className="text-sm text-[color:var(--ink-muted)]">Hosted Sessions</p>
                <p className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">{analytics.hosted_sessions}</p>
              </article>
              <article className="page-card p-4">
                <p className="text-sm text-[color:var(--ink-muted)]">Joined Sessions</p>
                <p className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">{analytics.joined_sessions}</p>
              </article>
              <article className="page-card p-4">
                <p className="text-sm text-[color:var(--ink-muted)]">Study Groups</p>
                <p className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">{analytics.study_groups_joined}</p>
              </article>
              <article className="page-card p-4">
                <p className="text-sm text-[color:var(--ink-muted)]">Resources Shared</p>
                <p className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">{analytics.resources_shared}</p>
              </article>
              <article className="page-card p-4">
                <p className="text-sm text-[color:var(--ink-muted)]">Current Streak</p>
                <p className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">{analytics.current_streak_days} days</p>
              </article>
            </section>

            <section className="page-card mt-6 p-5">
              <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Session Activity Trend</h2>

              <div className="mt-4 flex h-56 items-end gap-3">
                {analytics.progress_points.map((point) => {
                  const total = point.hosted_sessions + point.joined_sessions;
                  const height = Math.max(Math.round((total / maxValue) * 100), 6);
                  return (
                    <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t-lg bg-blue-600" style={{ height: `${height}%` }} />
                      <p className="text-xs text-[color:var(--ink-muted)]">{point.label}</p>
                      <p className="text-xs font-semibold text-[color:var(--foreground)]">{total}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="page-card mt-6 p-5">
              <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Milestones</h2>
              <div className="mt-3 space-y-2">
                {analytics.milestones.map((milestone) => (
                  <p key={milestone} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {milestone}
                  </p>
                ))}
                {analytics.milestones.length === 0 && (
                  <p className="text-sm text-[color:var(--ink-muted)]">Complete sessions and gather ratings to unlock milestones.</p>
                )}
              </div>
            </section>

            {/* Friends comparison */}
            <section className="page-card mt-6 p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--navy-tint)]">
                  <Users size={18} className="text-[color:var(--navy)]" />
                </div>
                <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Progress vs Friends</h2>
              </div>

              {friendsProgress.length === 0 ? (
                <div className="rounded-2xl bg-[color:var(--background-alt)] px-4 py-6 text-center">
                  <p className="text-sm text-[color:var(--ink-muted)]">Add friends in your Profile to compare progress here.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {(["joined_sessions", "resources_shared", "current_streak_days", "study_groups_joined"] as const).map((metric) => {
                    const labels: Record<string, string> = {
                      joined_sessions: "Sessions Joined",
                      resources_shared: "Resources Shared",
                      current_streak_days: "Streak Days",
                      study_groups_joined: "Study Groups",
                    };
                    const meValue = metric === "joined_sessions" ? analytics.joined_sessions
                      : metric === "resources_shared" ? analytics.resources_shared
                      : metric === "current_streak_days" ? analytics.current_streak_days
                      : analytics.study_groups_joined;
                    const allValues = [meValue, ...friendsProgress.map((f) => f[metric])];
                    const maxVal = Math.max(...allValues, 1);
                    return (
                      <div key={metric}>
                        <p className="mb-2 text-sm font-semibold text-[color:var(--foreground)]">{labels[metric]}</p>
                        <div className="mb-2 flex items-center gap-3">
                          <span className="w-20 shrink-0 truncate text-xs font-bold text-[color:var(--navy)]">You</span>
                          <div className="relative flex-1 overflow-hidden rounded-full bg-[color:var(--background-alt)]" style={{ height: "10px" }}>
                            <div
                              className="absolute left-0 top-0 h-full rounded-full bg-[color:var(--navy)] transition-all"
                              style={{ width: `${Math.max(Math.round((meValue / maxVal) * 100), 4)}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-xs font-bold text-[color:var(--navy)]">{meValue}</span>
                        </div>
                        {friendsProgress.map((friend) => {
                          const fVal = friend[metric];
                          const pct = Math.max(Math.round((fVal / maxVal) * 100), 4);
                          const ahead = fVal > meValue;
                          return (
                            <div key={friend.user_id} className="mb-2 flex items-center gap-3">
                              <span className="w-20 shrink-0 truncate text-xs text-[color:var(--ink-muted)]">
                                {friend.full_name ?? friend.email.split("@")[0]}
                              </span>
                              <div className="relative flex-1 overflow-hidden rounded-full bg-[color:var(--background-alt)]" style={{ height: "10px" }}>
                                <div
                                  className="absolute left-0 top-0 h-full rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    background: ahead ? "var(--accent)" : "var(--ink-subtle)",
                                  }}
                                />
                              </div>
                              <span className={`w-8 shrink-0 text-right text-xs font-semibold ${ahead ? "text-[color:var(--accent-strong)]" : "text-[color:var(--ink-muted)]"}`}>
                                {fVal}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="page-card mt-6 p-5">
              <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Session History</h2>
              <div className="mt-3 space-y-2">
                {analytics.session_history.map((session, index) => (
                  <article key={`${session.topic_focus}-${session.start_time}-${index}`} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">{session.topic_focus}</p>
                    <p className="text-xs text-gray-600">
                      {session.role} • {session.classroom_name} • {new Date(session.start_time).toLocaleString()}
                    </p>
                  </article>
                ))}
                {analytics.session_history.length === 0 && (
                  <p className="text-sm text-[color:var(--ink-muted)]">No session history yet.</p>
                )}
              </div>
            </section>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
