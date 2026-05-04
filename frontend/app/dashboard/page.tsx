"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BellRing, CalendarClock, LayoutPanelTop, Sparkles } from "lucide-react";
import Sidebar from "../../components/sidebar";
import { authedFetch, getToken } from "../../lib/api";

type UserSettings = {
  desktop_reminders: boolean;
  reminder_minutes_before: number;
};

type SessionItem = {
  id: string;
  topic_focus: string;
  classroom_name: string;
  start_time: string;
  joined: boolean;
  participant_count: number;
  meet_link: string | null;
};

function pickUpcomingSessions(sessionItems: SessionItem[], currentTime: number): SessionItem[] {
  return sessionItems
    .filter((session) => new Date(session.start_time).getTime() >= currentTime)
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
    .slice(0, 3);
}

const QUICK_ACTIONS = [
  { href: "/dashboard/virtual-sessions", label: "Schedule sessions" },
  { href: "/dashboard/tutors", label: "Find tutors" },
  { href: "/dashboard/progress", label: "Track growth" },
  { href: "/dashboard/chat", label: "Open chat" },
];

export default function Dashboard() {
  const router = useRouter();
  const [token] = useState<string | null>(() => getToken());
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionItem[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [router, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    Promise.all([
      authedFetch<UserSettings>("/users/me/settings"),
      authedFetch<SessionItem[]>("/sessions"),
    ])
      .then(([settingsResponse, sessionsResponse]) => {
        setSettings(settingsResponse);
        setUpcomingSessions(pickUpcomingSessions(sessionsResponse, Date.now()));
      })
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load dashboard overview.");
      });
  }, [token]);
  const quickActions = QUICK_ACTIONS.slice(0, 3);

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          {statusMessage && <p className="mb-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          <section className="page-header">
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Your study activity in one place.</p>
          </section>

          <section className="asym-grid items-start">
            <div className="page-card-strong overflow-hidden p-6 sm:p-8 lg:p-10">
              <div className="flex items-center gap-3 mb-2">
                <CalendarClock size={18} className="text-[color:var(--accent-strong)]" />
                <p className="section-kicker">Next Session</p>
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                {upcomingSessions[0]?.topic_focus ?? "No session booked yet"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[color:var(--ink-muted)]">
                {upcomingSessions[0]
                  ? `${upcomingSessions[0].classroom_name} • ${new Date(upcomingSessions[0].start_time).toLocaleString()}`
                  : "Head to Virtual Sessions to schedule or join one."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push("/dashboard/virtual-sessions")}
                  className="primary-button inline-flex items-center gap-2 px-5 py-3 text-sm hover:-translate-y-0.5"
                >
                  {upcomingSessions[0] ? "Open Session" : "Schedule a Session"}
                  <ArrowRight size={16} />
                </button>
                {upcomingSessions[0]?.meet_link && (
                  <a
                    href={upcomingSessions[0].meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ghost-button inline-flex items-center gap-2 px-5 py-3 text-sm hover:-translate-y-0.5"
                  >
                    Join Meet
                    <ArrowRight size={16} />
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <article className="glass-panel rounded-[1.8rem] p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-[color:var(--accent-soft)] p-3 text-[color:var(--accent-strong)]">
                    <LayoutPanelTop size={22} />
                  </div>
                  <div>
                    <p className="section-kicker">Quick Access</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                      Standard navigation is locked in.
                    </p>
                  </div>
                </div>
              </article>

              <article className="page-card rounded-[1.8rem] border p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-white/75 p-3 text-[color:var(--accent-strong)]">
                    <BellRing size={22} />
                  </div>
                  <div>
                    <p className="section-kicker">Reminder Stack</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                      {settings?.desktop_reminders ? `${settings.reminder_minutes_before} minute alerts are active.` : "Desktop reminders are off."}
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="mt-8 asym-grid items-start">
            <div className="glass-panel-strong rounded-[2rem] p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="section-kicker">Quick Actions</p>
                  <h2 className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">Your campus rhythm</h2>
                </div>
                <Sparkles className="text-[color:var(--accent)]" size={22} />
              </div>

              <div className="grid gap-4 md:grid-cols-[1.18fr_0.82fr]">
                <button
                  onClick={() => router.push(quickActions[0]?.href ?? "/dashboard/virtual-sessions")}
                  className="group rounded-[1.8rem] bg-[color:var(--foreground)] p-6 text-left text-white shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Primary Action</p>
                  <h3 className="mt-3 text-2xl font-bold">{quickActions[0]?.label ?? "Schedule sessions"}</h3>
                </button>

                <div className="grid gap-4">
                  {quickActions.slice(1).map((item) => (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      className="glass-panel rounded-[1.5rem] p-5 text-left hover:-translate-y-0.5"
                    >
                      <p className="soft-label">Shortcut</p>
                      <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">{item.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-panel-strong rounded-[2rem] p-6">
              <div className="flex items-center gap-3">
                <CalendarClock className="text-[color:var(--accent-strong)]" size={22} />
                <div>
                  <p className="section-kicker">Upcoming Sessions</p>
                  <h2 className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">What’s on deck</h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {upcomingSessions.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4"
                  >
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">{session.topic_focus}</p>
                    <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                      {session.classroom_name} • {new Date(session.start_time).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">
                      {session.participant_count} participants
                    </p>
                  </article>
                ))}
                {upcomingSessions.length === 0 && (
                  <p className="rounded-[1.4rem] bg-white/70 p-4 text-sm text-[color:var(--ink-muted)]">
                    No upcoming sessions yet.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

