"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Flame, Star, Trophy, Users, Zap } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

type TutorLeaderboardEntry = {
  rank: number;
  user_id: string;
  full_name: string | null;
  email: string;
  credibility_score: number;
  ratings_count: number;
  sessions_hosted: number;
  badges: Array<{ code: string; label: string; description: string }>;
};

type StudentLeaderboardEntry = {
  rank: number;
  user_id: string;
  full_name: string | null;
  email: string;
  study_points: number;
  sessions_joined: number;
  resources_shared: number;
  streak_days: number;
  study_groups_joined: number;
};

const AVATAR_COLORS = [
  "bg-[#4F46E5]", "bg-[#0891B2]", "bg-[#059669]",
  "bg-[#D97706]", "bg-[#DC2626]", "bg-[#7C3AED]",
];

function getInitials(name: string | null, email: string) {
  return (name ?? email).slice(0, 2).toUpperCase();
}

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function XpBar({ value, max, color = "var(--accent)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--background-alt)]">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

const TUTOR_METRICS = [
  { icon: "⭐", label: "Credibility Score", desc: "Avg rating from students" },
  { icon: "📅", label: "Sessions Hosted", desc: "Total sessions taught this week" },
  { icon: "💬", label: "Peer Reviews", desc: "Recommendations received" },
  { icon: "🏅", label: "Badges Earned", desc: "Achievement milestones unlocked" },
];

const STUDENT_METRICS = [
  { icon: "⚡", label: "Study Points", desc: "XP from all learning activities" },
  { icon: "📚", label: "Resources Shared", desc: "Files & links contributed" },
  { icon: "🔥", label: "Streak Days", desc: "Consecutive active study days" },
  { icon: "👥", label: "Groups Joined", desc: "Active study group memberships" },
];

const PODIUM_ORDER: Array<0 | 1 | 2> = [1, 0, 2];
const PODIUM_CROWNS = ["🥈", "🥇", "🥉"];
const PODIUM_RING = ["", "ring-4 ring-[color:var(--accent)] ring-offset-2", ""];
const PODIUM_BAR_COLOR = ["bg-[color:var(--navy)]", "bg-[color:var(--accent)]", "bg-[color:var(--navy-dark)]"];
const PODIUM_BAR_H = ["h-20", "h-28", "h-14"];
const PODIUM_SIZE = ["h-11 w-11 text-sm", "h-14 w-14 text-base", "h-10 w-10 text-xs"];

export default function LeaderboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"tutors" | "students">("tutors");
  const [tutors, setTutors] = useState<TutorLeaderboardEntry[]>([]);
  const [students, setStudents] = useState<StudentLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    Promise.all([
      authedFetch<TutorLeaderboardEntry[]>("/leaderboard/tutors?limit=20"),
      authedFetch<StudentLeaderboardEntry[]>("/leaderboard/students?limit=20").catch(() => [] as StudentLeaderboardEntry[]),
    ])
      .then(([tutorRes, studentRes]) => {
        setTutors(tutorRes);
        setStudents(studentRes);
      })
      .catch((err: unknown) => setStatusMessage(err instanceof Error ? err.message : "Failed to load leaderboard."))
      .finally(() => setLoading(false));
  }, [router]);

  const entries = tab === "tutors" ? tutors : students;
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const metricCards = tab === "tutors" ? TUTOR_METRICS : STUDENT_METRICS;

  function primaryMetric(entry: TutorLeaderboardEntry | StudentLeaderboardEntry) {
    return tab === "tutors"
      ? { value: (entry as TutorLeaderboardEntry).sessions_hosted, label: "sessions" }
      : { value: (entry as StudentLeaderboardEntry).study_points, label: "pts" };
  }

  function chipStats(entry: TutorLeaderboardEntry | StudentLeaderboardEntry) {
    if (tab === "tutors") {
      const t = entry as TutorLeaderboardEntry;
      return [
        { icon: Star, v: `${t.credibility_score.toFixed(1)}★` },
        { icon: Users, v: `${t.sessions_hosted} sessions` },
        { icon: Zap, v: `${t.ratings_count} reviews` },
      ];
    }
    const s = entry as StudentLeaderboardEntry;
    return [
      { icon: Zap, v: `${s.study_points} pts` },
      { icon: BookOpen, v: `${s.resources_shared} resources` },
      { icon: Flame, v: `${s.streak_days}d streak` },
    ];
  }

  const maxPrimary = Math.max(...entries.map((e) => primaryMetric(e).value), 1);

  return (
    <div className="page-shell">
      <Sidebar />
      <main className="page-main">
        <div className="page-content max-w-3xl">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--navy)] shadow-lg">
              <Trophy size={28} className="text-[color:var(--accent)]" />
            </div>
            <div>
              <h1 className="page-title">Leaderboard</h1>
              <p className="page-subtitle">Weekly standings · resets every Monday</p>
            </div>
            <span className="ml-auto rounded-full bg-[color:var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[color:var(--accent-strong)]">
              🔥 Week in progress
            </span>
          </div>

          {/* Tab switcher */}
          <div className="mb-6 inline-flex gap-1 rounded-2xl bg-[color:var(--background-alt)] p-1">
            <button
              onClick={() => setTab("tutors")}
              className={`rounded-xl px-6 py-2.5 text-sm font-bold transition ${
                tab === "tutors"
                  ? "bg-[color:var(--navy)] text-white shadow"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              🎓 Top Tutors
            </button>
            <button
              onClick={() => setTab("students")}
              className={`rounded-xl px-6 py-2.5 text-sm font-bold transition ${
                tab === "students"
                  ? "bg-[color:var(--navy)] text-white shadow"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              ⚡ Top Students
            </button>
          </div>

          {/* Metrics legend */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metricCards.map((m) => (
              <div key={m.label} className="page-card p-3">
                <p className="mb-1 text-lg">{m.icon}</p>
                <p className="text-xs font-bold text-[color:var(--foreground)]">{m.label}</p>
                <p className="text-[11px] text-[color:var(--ink-muted)]">{m.desc}</p>
              </div>
            ))}
          </div>

          {statusMessage && <p className="mb-4 text-sm text-[color:var(--ink-muted)]">{statusMessage}</p>}

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl">⏳</div>
              <p className="mt-3 text-sm text-[color:var(--ink-muted)]">Loading leaderboard...</p>
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="page-card flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 text-5xl">🏆</div>
              <p className="text-lg font-bold text-[color:var(--foreground)]">No data yet</p>
              <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                {tab === "tutors"
                  ? "Ratings populate this board after sessions are reviewed."
                  : "Students earn points by joining sessions, sharing resources, and maintaining streaks."}
              </p>
            </div>
          )}

          {!loading && entries.length > 0 && (
            <>
              {/* Podium */}
              <div className="page-card-strong mb-6 overflow-hidden p-6">
                <p className="section-kicker mb-5">This week&apos;s podium</p>
                <div className="flex items-end justify-center gap-3">
                  {PODIUM_ORDER.map((origIdx, podiumPos) => {
                    const entry = top3[origIdx];
                    if (!entry) return null;
                    const { value, label } = primaryMetric(entry);
                    return (
                      <div key={entry.user_id} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="text-xl">{PODIUM_CROWNS[podiumPos]}</span>
                        <div
                          className={`flex shrink-0 items-center justify-center rounded-full ${avatarColor(origIdx)} font-bold text-white ${PODIUM_SIZE[podiumPos]} ${PODIUM_RING[podiumPos]}`}
                        >
                          {getInitials(entry.full_name, entry.email)}
                        </div>
                        <p className="max-w-[90px] text-center text-xs font-bold leading-tight text-[color:var(--foreground)]">
                          {entry.full_name ?? entry.email.split("@")[0]}
                        </p>
                        <p className="text-[11px] text-[color:var(--ink-muted)]">
                          {value} {label}
                        </p>
                        <div className={`w-full rounded-t-xl ${PODIUM_BAR_H[podiumPos]} ${PODIUM_BAR_COLOR[podiumPos]}`} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ranks 4+ */}
              {rest.length > 0 && (
                <div className="page-card overflow-hidden">
                  {rest.map((entry, idx) => {
                    const rank = entry.rank ?? idx + 4;
                    const { value, label } = primaryMetric(entry);
                    const chips = chipStats(entry);
                    return (
                      <div
                        key={entry.user_id}
                        className="flex items-center gap-4 border-b border-[color:var(--border)] px-5 py-4 last:border-0 transition hover:bg-[color:var(--background-alt)]"
                      >
                        <span className="w-6 shrink-0 text-center text-sm font-bold text-[color:var(--ink-muted)]">
                          #{rank}
                        </span>
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarColor(idx + 3)} text-sm font-bold text-white`}
                        >
                          {getInitials(entry.full_name, entry.email)}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                            {entry.full_name ?? entry.email}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {chips.map(({ v }) => (
                              <span key={v} className="text-[11px] text-[color:var(--ink-muted)]">
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="w-24 shrink-0">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-bold text-[color:var(--accent-strong)]">{value}</span>
                            <span className="text-[10px] text-[color:var(--ink-subtle)]">{label}</span>
                          </div>
                          <XpBar value={value} max={maxPrimary} />
                        </div>
                        {tab === "tutors" && (
                          <div className="hidden w-24 flex-wrap justify-end gap-1 sm:flex">
                            {(entry as TutorLeaderboardEntry).badges.slice(0, 2).map((b) => (
                              <span
                                key={b.code}
                                className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent-strong)]"
                              >
                                {b.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
