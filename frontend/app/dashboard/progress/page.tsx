"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

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

type FriendProgress = {
  user_id: string;
  full_name: string | null;
  email: string;
  joined_sessions: number;
  resources_shared: number;
  current_streak_days: number;
  study_groups_joined: number;
};

type DbUser = {
  id: string;
  auth_uid: string;
  email: string;
  full_name: string | null;
};

function calculateCurrentStreakDays(activityDates: Date[]): number {
  if (!activityDates.length) {
    return 0;
  }

  const orderedDays = [...new Set(activityDates.map((item) => item.toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  let previous: Date | null = null;

  for (const dayText of orderedDays) {
    const day = new Date(`${dayText}T00:00:00.000Z`);
    if (!previous) {
      streak = 1;
      previous = day;
      continue;
    }

    const differenceDays = Math.round((previous.getTime() - day.getTime()) / (1000 * 60 * 60 * 24));
    if (differenceDays === 1) {
      streak += 1;
      previous = day;
      continue;
    }
    break;
  }

  return streak;
}

function computeMilestones(hostedSessions: number, joinedSessions: number, ratingsCount: number, credibilityScore: number): string[] {
  const milestones: string[] = [];
  if (hostedSessions >= 1) milestones.push("First tutoring session hosted");
  if (hostedSessions >= 5) milestones.push("Consistent tutor: hosted 5+ sessions");
  if (joinedSessions >= 10) milestones.push("Collaborative learner: joined 10+ sessions");
  if (ratingsCount >= 5) milestones.push("Community verified: earned 5+ ratings");
  if (ratingsCount >= 10 && credibilityScore >= 4.5) milestones.push("Top-rated tutor: 4.5+ score with 10+ ratings");
  return milestones;
}

function recentMonthLabels(): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    labels.push(cursor.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }));
  }
  return labels;
}

async function getCurrentDbUser(): Promise<DbUser> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error(authError?.message || "Missing Supabase user session.");
  }

  const authUser = authData.user;
  const { data: dbUser, error: dbUserError } = await supabase
    .from("users")
    .select("id, auth_uid, email, full_name")
    .eq("auth_uid", authUser.id)
    .maybeSingle<DbUser>();

  if (dbUserError) {
    throw new Error(dbUserError.message || "Failed to load user record.");
  }
  if (dbUser) {
    return dbUser;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      auth_uid: authUser.id,
      email: (authUser.email || "").toLowerCase(),
      full_name: (authUser.user_metadata?.full_name as string | undefined) || null,
    })
    .select("id, auth_uid, email, full_name")
    .single<DbUser>();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || "Failed to create user record.");
  }
  return inserted;
}

async function loadProgressViaSupabase(): Promise<{ analytics: UserAnalytics; friendsProgress: FriendProgress[] }> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const currentUser = await getCurrentDbUser();
  const [
    hostedResult,
    joinedResult,
    groupsResult,
    resourcesResult,
    profileResult,
  ] = await Promise.all([
    supabase.from("sessions").select("id, topic_focus, classroom_name, start_time, end_time, created_at").eq("host_user_id", currentUser.id),
    supabase.from("session_participants").select("session_id, joined_at").eq("user_id", currentUser.id),
    supabase.from("study_group_members").select("joined_at").eq("user_id", currentUser.id),
    supabase.from("resources").select("id").eq("uploaded_by_user_id", currentUser.id),
    supabase.from("user_profiles").select("credibility_score, ratings_count").eq("user_id", currentUser.id).maybeSingle(),
  ]);

  if (hostedResult.error || joinedResult.error || groupsResult.error || resourcesResult.error || profileResult.error) {
    throw new Error(
      hostedResult.error?.message
      || joinedResult.error?.message
      || groupsResult.error?.message
      || resourcesResult.error?.message
      || profileResult.error?.message
      || "Failed to load progress data.",
    );
  }

  const hostedRows = hostedResult.data ?? [];
  const joinedRows = joinedResult.data ?? [];
  const joinedGroupRows = groupsResult.data ?? [];
  const resourcesShared = (resourcesResult.data ?? []).length;
  const ratingsCount = Number(profileResult.data?.ratings_count ?? 0);
  const credibilityScore = Number(profileResult.data?.credibility_score ?? 0);

  const joinedSessionIds = joinedRows.map((row) => String((row as { session_id: string }).session_id));
  const joinedSessionsLookup = joinedSessionIds.length
    ? await supabase
      .from("sessions")
      .select("id, topic_focus, classroom_name, start_time, end_time")
      .in("id", joinedSessionIds)
    : { data: [], error: null };

  if (joinedSessionsLookup.error) {
    throw new Error(joinedSessionsLookup.error.message || "Failed to load joined session details.");
  }

  const joinedSessionMap = new Map<string, { topic_focus: string; classroom_name: string; start_time: string; end_time: string }>();
  for (const session of joinedSessionsLookup.data ?? []) {
    const row = session as { id: string; topic_focus: string; classroom_name: string; start_time: string; end_time: string };
    joinedSessionMap.set(String(row.id), row);
  }

  const labels = recentMonthLabels();
  const labelCounts: Record<string, { hosted: number; joined: number }> = {};
  for (const label of labels) {
    labelCounts[label] = { hosted: 0, joined: 0 };
  }

  for (const hosted of hostedRows) {
    const label = new Date(String((hosted as { start_time: string }).start_time)).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    if (label in labelCounts) labelCounts[label].hosted += 1;
  }

  for (const joined of joinedRows) {
    const label = new Date(String((joined as { joined_at: string }).joined_at)).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    if (label in labelCounts) labelCounts[label].joined += 1;
  }

  const activityDates: Date[] = [
    ...hostedRows.map((row) => new Date(String((row as { created_at: string }).created_at))),
    ...joinedRows.map((row) => new Date(String((row as { joined_at: string }).joined_at))),
    ...joinedGroupRows.map((row) => new Date(String((row as { joined_at: string }).joined_at))),
  ];

  const hostedHistory = [...hostedRows]
    .sort((left, right) => new Date(String((right as { start_time: string }).start_time)).getTime() - new Date(String((left as { start_time: string }).start_time)).getTime())
    .slice(0, 6)
    .map((row) => ({
      role: "host",
      topic_focus: String((row as { topic_focus: string }).topic_focus),
      classroom_name: String((row as { classroom_name: string }).classroom_name),
      start_time: String((row as { start_time: string }).start_time),
      end_time: String((row as { end_time: string }).end_time),
    }));

  const participantHistory = joinedRows
    .map((row) => {
      const sessionId = String((row as { session_id: string }).session_id);
      const session = joinedSessionMap.get(sessionId);
      if (!session) return null;
      return {
        role: "participant",
        topic_focus: session.topic_focus,
        classroom_name: session.classroom_name,
        start_time: session.start_time,
        end_time: session.end_time,
      };
    })
    .filter((item): item is { role: string; topic_focus: string; classroom_name: string; start_time: string; end_time: string } => item !== null)
    .sort((left, right) => new Date(right.start_time).getTime() - new Date(left.start_time).getTime())
    .slice(0, 6);

  const friendsResult = await supabase.from("friendships").select("friend_user_id").eq("user_id", currentUser.id);
  if (friendsResult.error) {
    throw new Error(friendsResult.error.message || "Failed to load friends.");
  }

  const friendIds = Array.from(new Set((friendsResult.data ?? []).map((row) => String((row as { friend_user_id: string }).friend_user_id))));
  let friendsProgress: FriendProgress[] = [];

  if (friendIds.length) {
    const [friendUsersResult, friendJoinedResult, friendResourcesResult, friendGroupsResult, friendHostedResult] = await Promise.all([
      supabase.from("users").select("id, full_name, email").in("id", friendIds),
      supabase.from("session_participants").select("user_id, joined_at").in("user_id", friendIds),
      supabase.from("resources").select("uploaded_by_user_id").in("uploaded_by_user_id", friendIds),
      supabase.from("study_group_members").select("user_id, joined_at").in("user_id", friendIds),
      supabase.from("sessions").select("host_user_id, created_at").in("host_user_id", friendIds),
    ]);

    if (friendUsersResult.error || friendJoinedResult.error || friendResourcesResult.error || friendGroupsResult.error || friendHostedResult.error) {
      throw new Error(
        friendUsersResult.error?.message
        || friendJoinedResult.error?.message
        || friendResourcesResult.error?.message
        || friendGroupsResult.error?.message
        || friendHostedResult.error?.message
        || "Failed to load friend analytics.",
      );
    }

    const joinedByUser = new Map<string, number>();
    const resourcesByUser = new Map<string, number>();
    const groupsByUser = new Map<string, number>();
    const activityByUser = new Map<string, Date[]>();

    for (const row of friendJoinedResult.data ?? []) {
      const userId = String((row as { user_id: string }).user_id);
      joinedByUser.set(userId, (joinedByUser.get(userId) ?? 0) + 1);
      activityByUser.set(userId, [...(activityByUser.get(userId) ?? []), new Date(String((row as { joined_at: string }).joined_at))]);
    }
    for (const row of friendResourcesResult.data ?? []) {
      const userId = String((row as { uploaded_by_user_id: string }).uploaded_by_user_id);
      resourcesByUser.set(userId, (resourcesByUser.get(userId) ?? 0) + 1);
    }
    for (const row of friendGroupsResult.data ?? []) {
      const userId = String((row as { user_id: string }).user_id);
      groupsByUser.set(userId, (groupsByUser.get(userId) ?? 0) + 1);
      activityByUser.set(userId, [...(activityByUser.get(userId) ?? []), new Date(String((row as { joined_at: string }).joined_at))]);
    }
    for (const row of friendHostedResult.data ?? []) {
      const userId = String((row as { host_user_id: string }).host_user_id);
      activityByUser.set(userId, [...(activityByUser.get(userId) ?? []), new Date(String((row as { created_at: string }).created_at))]);
    }

    friendsProgress = (friendUsersResult.data ?? []).map((friend) => {
      const friendRow = friend as { id: string; full_name: string | null; email: string };
      const userId = String(friendRow.id);
      return {
        user_id: userId,
        full_name: friendRow.full_name,
        email: friendRow.email,
        joined_sessions: joinedByUser.get(userId) ?? 0,
        resources_shared: resourcesByUser.get(userId) ?? 0,
        current_streak_days: calculateCurrentStreakDays(activityByUser.get(userId) ?? []),
        study_groups_joined: groupsByUser.get(userId) ?? 0,
      };
    });
  }

  return {
    analytics: {
      hosted_sessions: hostedRows.length,
      joined_sessions: joinedRows.length,
      study_groups_joined: joinedGroupRows.length,
      resources_shared: resourcesShared,
      current_streak_days: calculateCurrentStreakDays(activityDates),
      milestones: computeMilestones(hostedRows.length, joinedRows.length, ratingsCount, credibilityScore),
      progress_points: labels.map((label) => ({
        label,
        hosted_sessions: labelCounts[label].hosted,
        joined_sessions: labelCounts[label].joined,
      })),
      session_history: [...hostedHistory, ...participantHistory],
    },
    friendsProgress,
  };
}

export default function ProgressPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [friendsProgress, setFriendsProgress] = useState<FriendProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    loadProgressViaSupabase()
      .then(({ analytics: analyticsRes, friendsProgress: friendsRes }) => {
        setAnalytics(analyticsRes);
        setFriendsProgress(friendsRes);
      })
      .catch(() => {
        Promise.all([
          authedFetch<UserAnalytics>("/users/me/analytics"),
          authedFetch<FriendProgress[]>("/users/me/friends/analytics").catch(() => [] as FriendProgress[]),
        ])
          .then(([analyticsRes, friendsRes]) => {
            setAnalytics(analyticsRes);
            setFriendsProgress(friendsRes);
          })
          .catch((error: unknown) => {
            setStatusMessage(error instanceof Error ? error.message : "Failed to load analytics.");
          })
          .finally(() => setLoading(false));
      })
      .finally(() => {
        setLoading(false);
      });
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
