"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Sidebar from "../../components/sidebar";

type SessionItem = {
  id: string;
  course_id: string;
  host_user_id: string;
  classroom_name: string;
  start_time: string;
  end_time: string;
  meet_link: string | null;
  status: string;
};

type CalendarStatus = {
  linked: boolean;
  google_email: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const DEMO_TOKEN = "demo-token";

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const isDemo = token === DEMO_TOKEN;

  const [stats, setStats] = useState({
    groups: 0,
    resources: 0,
    sessions: 0,
  });
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({
    linked: false,
    google_email: null,
  });
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyLinking, setBusyLinking] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  const [courseId, setCourseId] = useState("");
  const [classroomName, setClassroomName] = useState("Study Hall A");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [manualMeetLink, setManualMeetLink] = useState("");
  const [generateMeet, setGenerateMeet] = useState(true);

  const sessionCount = useMemo(() => sessions.length, [sessions]);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!token) {
        throw new Error("Missing auth token");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
      });

      const raw = await response.text();
      const payload = raw ? JSON.parse(raw) : null;
      if (!response.ok) {
        const detail = payload?.detail ?? payload?.message ?? `Request failed (${response.status})`;
        throw new Error(String(detail));
      }
      return payload;
    },
    [token],
  );

  const applySessionStats = useCallback((nextSessions: SessionItem[]) => {
    setStats({
      groups: Math.max(1, Math.min(5, nextSessions.length || 1)),
      resources: nextSessions.filter((item) => Boolean(item.meet_link)).length,
      sessions: nextSessions.length,
    });
  }, []);

  const loadCalendarStatus = useCallback(async () => {
    const result = await authedFetch("/users/me/google-calendar/status");
    setCalendarStatus({
      linked: Boolean(result?.linked),
      google_email: result?.google_email ?? null,
    });
  }, [authedFetch]);

  const loadSessions = useCallback(async () => {
    const result = (await authedFetch("/sessions")) as SessionItem[];
    setSessions(result);
    applySessionStats(result);
  }, [applySessionStats, authedFetch]);

  useEffect(() => {
    const localToken = localStorage.getItem("token");
    if (!localToken) {
      router.push("/login");
      return;
    }
    setToken(localToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }

    if (isDemo) {
      const now = new Date();
      const demoStart = new Date(now.getTime() + 60 * 60 * 1000);
      const demoEnd = new Date(now.getTime() + 90 * 60 * 1000);
      const demoSessions: SessionItem[] = [
        {
          id: "demo-session-1",
          course_id: "00000000-0000-0000-0000-000000000001",
          host_user_id: "00000000-0000-0000-0000-000000000001",
          classroom_name: "Demo Study Room",
          start_time: demoStart.toISOString(),
          end_time: demoEnd.toISOString(),
          meet_link: "https://meet.google.com/demo-link",
          status: "scheduled",
        },
      ];

      setSessions(demoSessions);
      setCalendarStatus({ linked: false, google_email: null });
      applySessionStats(demoSessions);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatusMessage("");
    Promise.all([loadCalendarStatus(), loadSessions()])
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to load dashboard data";
        setStatusMessage(message);
      })
      .finally(() => setLoading(false));
  }, [applySessionStats, isDemo, loadCalendarStatus, loadSessions, token]);

  const waitForOAuthMessage = useCallback(() => {
    return new Promise<{ code: string | null; state: string | null; error: string | null }>(
      (resolve, reject) => {
        const allowedOrigins = new Set([
          window.location.origin,
          "http://127.0.0.1:5500",
          "http://localhost:5500",
        ]);

        const timeoutId = window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("OAuth flow timed out."));
        }, 180000);

        function onMessage(event: MessageEvent) {
          if (!allowedOrigins.has(event.origin)) {
            return;
          }

          const payload = event.data;
          if (!payload || payload.type !== "google-calendar-oauth") {
            return;
          }

          window.clearTimeout(timeoutId);
          window.removeEventListener("message", onMessage);
          resolve({
            code: payload.code ?? null,
            state: payload.state ?? null,
            error: payload.error ?? null,
          });
        }

        window.addEventListener("message", onMessage);
      },
    );
  }, []);

  const handleLinkCalendar = useCallback(async () => {
    if (!token) {
      return;
    }

    if (isDemo) {
      setStatusMessage("Demo mode uses mock data only. Use a real token to link Google Calendar.");
      return;
    }

    try {
      setBusyLinking(true);
      setStatusMessage("");
      const start = await authedFetch("/users/me/google-calendar/link/start", { method: "POST" });
      const authWindow = window.open(
        String(start.authorization_url),
        "google-calendar-link",
        "width=520,height=720",
      );
      if (!authWindow) {
        throw new Error("Failed to open OAuth window. Allow pop-ups and try again.");
      }

      const oauthPayload = await waitForOAuthMessage();
      if (oauthPayload.error) {
        throw new Error(oauthPayload.error);
      }
      if (!oauthPayload.code || !oauthPayload.state) {
        throw new Error("Missing OAuth code or state from callback.");
      }

      await authedFetch("/users/me/google-calendar/link/complete", {
        method: "POST",
        body: JSON.stringify({
          code: oauthPayload.code,
          state: oauthPayload.state,
        }),
      });

      await loadCalendarStatus();
      setStatusMessage("Google Calendar linked successfully.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to link Google Calendar.");
    } finally {
      setBusyLinking(false);
    }
  }, [authedFetch, isDemo, loadCalendarStatus, token, waitForOAuthMessage]);

  const handleUnlinkCalendar = useCallback(async () => {
    if (!token || isDemo) {
      setStatusMessage("Demo mode has no linked Google account.");
      return;
    }

    try {
      setBusyLinking(true);
      setStatusMessage("");
      await authedFetch("/users/me/google-calendar/link", { method: "DELETE" });
      setCalendarStatus({ linked: false, google_email: null });
      setStatusMessage("Google Calendar unlinked.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to unlink Google Calendar.");
    } finally {
      setBusyLinking(false);
    }
  }, [authedFetch, isDemo, token]);

  const handleCreateSession = useCallback(async () => {
    if (!token) {
      return;
    }

    if (!courseId || !classroomName || !startTime || !endTime) {
      setStatusMessage("Fill course ID, classroom name, start time, and end time.");
      return;
    }

    if (isDemo) {
      const demoSession: SessionItem = {
        id: `demo-${Date.now()}`,
        course_id: courseId,
        host_user_id: "demo-user",
        classroom_name: classroomName,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        meet_link: generateMeet ? "https://meet.google.com/demo-created" : manualMeetLink || null,
        status: "scheduled",
      };
      const updated = [demoSession, ...sessions];
      setSessions(updated);
      applySessionStats(updated);
      setStatusMessage("Demo session created.");
      return;
    }

    try {
      setCreatingSession(true);
      setStatusMessage("");

      const created = (await authedFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({
          course_id: courseId,
          classroom_name: classroomName,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          meet_link: manualMeetLink || null,
          generate_meet: generateMeet,
        }),
      })) as SessionItem;

      const updated = [created, ...sessions];
      setSessions(updated);
      applySessionStats(updated);
      setStatusMessage(created.meet_link ? "Session created with Meet link." : "Session created.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to create session.");
    } finally {
      setCreatingSession(false);
    }
  }, [
    applySessionStats,
    authedFetch,
    classroomName,
    courseId,
    endTime,
    generateMeet,
    isDemo,
    manualMeetLink,
    sessions,
    startTime,
    token,
  ]);

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <main className="flex-1 p-10">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-bold mb-8"
        >
          Welcome Back 👋
        </motion.h1>

        {loading && <p className="text-sm text-gray-600 mb-6">Loading dashboard...</p>}

        {statusMessage && (
          <p className="text-sm mb-6 text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
            {statusMessage}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
            <h3 className="text-lg text-gray-800 font-semibold mb-2">Active Groups</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.groups}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
            <h3 className="text-lg text-gray-800 font-semibold mb-2">Resources Shared</h3>
            <p className="text-3xl font-bold text-green-600">{stats.resources}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
            <h3 className="text-lg text-gray-800 font-semibold mb-2">Upcoming Sessions</h3>
            <p className="text-3xl font-bold text-purple-600">{sessionCount || stats.sessions}</p>
          </div>
        </motion.div>

        <section className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-semibold mb-3">Google Calendar</h2>
            <p className="text-sm text-gray-600 mb-4">
              {calendarStatus.linked
                ? `Linked as ${calendarStatus.google_email ?? "connected account"}`
                : "Not linked yet. Link your Google account to auto-create Meet links."}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleLinkCalendar}
                disabled={busyLinking}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {busyLinking ? "Linking..." : "Link Google Calendar"}
              </button>

              <button
                onClick={handleUnlinkCalendar}
                disabled={busyLinking}
                className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-60"
              >
                Unlink
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4">Callback route for this frontend: /google-calendar-callback</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-semibold mb-3">Create Study Session</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="border rounded-lg p-2"
                placeholder="Course ID (UUID)"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              />
              <input
                className="border rounded-lg p-2"
                placeholder="Classroom name"
                value={classroomName}
                onChange={(event) => setClassroomName(event.target.value)}
              />
              <input
                type="datetime-local"
                className="border rounded-lg p-2"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
              <input
                type="datetime-local"
                className="border rounded-lg p-2"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>

            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={generateMeet}
                  onChange={(event) => setGenerateMeet(event.target.checked)}
                />
                Generate Google Meet automatically
              </label>
            </div>

            {!generateMeet && (
              <input
                className="border rounded-lg p-2 w-full mt-3"
                placeholder="Manual Meet link (optional)"
                value={manualMeetLink}
                onChange={(event) => setManualMeetLink(event.target.value)}
              />
            )}

            <button
              onClick={handleCreateSession}
              disabled={creatingSession}
              className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60"
            >
              {creatingSession ? "Creating..." : "Create Session"}
            </button>
          </div>
        </section>

        <section className="mt-8 bg-white p-6 rounded-2xl shadow">
          <h2 className="text-xl font-semibold mb-4">Study Sessions</h2>

          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500">No sessions yet.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                  <p className="font-medium">{item.classroom_name}</p>
                  <p className="text-sm text-gray-600">Course: {item.course_id}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(item.start_time).toLocaleString()} to {new Date(item.end_time).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">Status: {item.status}</p>
                  {item.meet_link && (
                    <a
                      href={item.meet_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Open Meet Link
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

