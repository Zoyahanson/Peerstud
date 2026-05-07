"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { BellRing, CalendarRange, Plus, Search, UsersRound, X } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { API_BASE_URL, authedFetch, getToken } from "../../../lib/api";
import { buildDefaultVirtualRoomUrl } from "../../../lib/virtual-room";

const StudyRoomTimer = dynamic(() => import("../../../components/study-room-timer"), {
  loading: () => <section className="glass-panel rounded-[2rem] p-6 text-sm text-[color:var(--ink-muted)]">Loading study timer...</section>,
});

type CourseSummary = {
  id: string;
  title: string;
};

type CourseDisplayItem = CourseSummary & {
  displayTitle: string;
};

type CourseDisplayGroup = {
  key: string;
  label: string;
  courses: CourseSummary[];
};

type SessionParticipant = {
  user_id: string;
  full_name: string | null;
  email: string;
  status: string;
  joined_at: string;
};

type SessionItem = {
  id: string;
  course_id: string;
  course_title: string;
  host_user_id: string;
  host_name: string | null;
  classroom_name: string;
  topic_focus: string;
  description: string | null;
  start_time: string;
  end_time: string;
  meet_link: string | null;
  calendar_event_id: string | null;
  status: string;
  participant_count: number;
  invited_count: number;
  joined: boolean;
  average_rating: number | null;
  participants: SessionParticipant[];
};

type UserSettings = {
  reminder_minutes_before: number;
  desktop_reminders: boolean;
  adaptive_layout: boolean;
};

function groupSessionsByDate(sessions: SessionItem[]): Array<{ date: string; sessions: SessionItem[] }> {
  const grouped = sessions.reduce<Record<string, SessionItem[]>>((accumulator, session) => {
    const dateKey = new Date(session.start_time).toLocaleDateString();
    accumulator[dateKey] = [...(accumulator[dateKey] ?? []), session];
    return accumulator;
  }, {});

  return Object.entries(grouped).map(([date, items]) => ({ date, sessions: items }));
}

function deriveCourseGroupLabel(courseTitle: string): string {
  const match = courseTitle.match(/^([A-Z]{3,5})(\d{4})/);
  if (!match) {
    return "Other Courses";
  }
  const [, department, numericCode] = match;
  return `${department} Level ${numericCode[0]}000`;
}

export default function VirtualSessionsPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [classroomName, setClassroomName] = useState("Virtual Study Room");
  const [topicFocus, setTopicFocus] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [customRoomLink, setCustomRoomLink] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState("30");
  const [ratingScores, setRatingScores] = useState<Record<string, string>>({});
  const [ratingFeedback, setRatingFeedback] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [showCourseBrowser, setShowCourseBrowser] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");

  const loadData = useCallback(async () => {
    const [courseResponse, sessionResponse, settingsResponse] = await Promise.all([
      authedFetch<CourseSummary[]>("/courses"),
      authedFetch<SessionItem[]>("/sessions"),
      authedFetch<UserSettings>("/users/me/settings"),
    ]);
    setCourses(courseResponse);

    const dedupedCourses = new Map<string, CourseSummary>();
    for (const course of [...courseResponse].sort((left, right) => left.title.localeCompare(right.title))) {
      if (!dedupedCourses.has(course.title)) {
        dedupedCourses.set(course.title, course);
      }
    }
    const uniqueCourseOptions = Array.from(dedupedCourses.values());

    let nextSelectedCourseId = selectedCourseId;
    if (!nextSelectedCourseId || !uniqueCourseOptions.some((course) => course.id === nextSelectedCourseId)) {
      nextSelectedCourseId = uniqueCourseOptions[0]?.id ?? "";
      setSelectedCourseId(nextSelectedCourseId);
    }

    const selectedCourseTitle = uniqueCourseOptions.find((course) => course.id === nextSelectedCourseId)?.title;
    const visibleSessions = selectedCourseTitle
      ? sessionResponse.filter((session) => session.course_title === selectedCourseTitle)
      : sessionResponse;

    setSessions(visibleSessions);
    setUserSettings(settingsResponse);
    setReminderMinutesBefore(String(settingsResponse.reminder_minutes_before));
  }, [selectedCourseId]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    loadData()
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load sessions.");
      })
      .finally(() => setLoading(false));
  }, [loadData, router]);

  const groupedSessions = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const displayCourses = useMemo<CourseSummary[]>(() => {
    const sorted = [...courses].sort((left, right) => left.title.localeCompare(right.title));
    const deduped = new Map<string, CourseSummary>();
    for (const course of sorted) {
      if (!deduped.has(course.title)) {
        deduped.set(course.title, course);
      }
    }
    return Array.from(deduped.values());
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const query = courseQuery.trim().toLowerCase();
    if (!query) {
      return displayCourses;
    }
    return displayCourses.filter((course) => course.title.toLowerCase().includes(query));
  }, [courseQuery, displayCourses]);

  const groupedFilteredCourses = useMemo<CourseDisplayGroup[]>(() => {
    const byGroup = new Map<string, CourseSummary[]>();
    for (const course of filteredCourses) {
      const groupLabel = deriveCourseGroupLabel(course.title);
      const existing = byGroup.get(groupLabel) ?? [];
      existing.push(course);
      byGroup.set(groupLabel, existing);
    }

    return Array.from(byGroup.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, groupCourses]) => ({
        key: label,
        label,
        courses: groupCourses.sort((left, right) => left.title.localeCompare(right.title)),
      }));
  }, [filteredCourses]);

  const openPlanner = useCallback(() => {
    setShowPlanner(true);
    requestAnimationFrame(() => setPlannerVisible(true));
  }, []);

  const closePlanner = useCallback(() => {
    setPlannerVisible(false);
    window.setTimeout(() => setShowPlanner(false), 190);
  }, []);

  useEffect(() => {
    if (!showPlanner) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePlanner();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closePlanner, showPlanner]);

  async function handleCreateSession() {
    if (!selectedCourseId || !topicFocus || !startTime || !endTime || !classroomName) {
      setStatusMessage("Fill the course, topic, room, start time, and end time.");
      return;
    }

    try {
      setCreating(true);
      setStatusMessage("");
      const fallbackRoomLink = buildDefaultVirtualRoomUrl({
        courseId: selectedCourseId,
        classroomName,
        topicFocus,
        startTime,
      });
      const parsedInviteEmails = Array.from(
        new Set(
          inviteEmails
            .split(/[\n,;]+/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      await authedFetch<SessionItem>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          course_id: selectedCourseId,
          classroom_name: classroomName,
          topic_focus: topicFocus,
          description: description || null,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          meet_link: customRoomLink.trim() || fallbackRoomLink,
          reminder_minutes_before: Number(reminderMinutesBefore),
          invite_emails: parsedInviteEmails,
        }),
      });
      setTopicFocus("");
      setDescription("");
      setCustomRoomLink("");
      setInviteEmails("");
      setStatusMessage("Session scheduled.");
      closePlanner();
      await loadData();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to create session.");
    } finally {
      setCreating(false);
    }
  }

  const joinedUpcomingCount = sessions.filter((session) => session.joined && new Date(session.start_time).getTime() >= Date.now()).length;

  async function handleJoinSession(sessionId: string) {
    try {
      setBusySessionId(sessionId);
      setStatusMessage("");
      await authedFetch<SessionItem>(`/sessions/${sessionId}/join`, { method: "POST" });
      setStatusMessage("Session joined.");
      await loadData();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to join session.");
    } finally {
      setBusySessionId(null);
    }
  }

  async function handleRateSession(sessionId: string) {
    const score = Number(ratingScores[sessionId] ?? 0);
    if (!score) {
      setStatusMessage("Select a rating score before submitting.");
      return;
    }

    try {
      setBusySessionId(sessionId);
      setStatusMessage("");
      await authedFetch(`/sessions/${sessionId}/ratings`, {
        method: "POST",
        body: JSON.stringify({
          score,
          feedback: ratingFeedback[sessionId] || null,
        }),
      });
      setStatusMessage("Rating submitted.");
      await loadData();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to submit rating.");
    } finally {
      setBusySessionId(null);
    }
  }

  async function handleDownloadCalendarInvite(sessionId: string) {
    try {
      setBusySessionId(sessionId);
      setStatusMessage("");
      const token = getToken();
      if (!token) {
        throw new Error("Missing auth token");
      }

      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/calendar`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to export calendar invite (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `peerstud-session-${sessionId}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatusMessage("Calendar invite downloaded.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to export calendar invite.");
    } finally {
      setBusySessionId(null);
    }
  }

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          <section className="page-header">
            <h1 className="page-title">Virtual Sessions</h1>
            <p className="page-subtitle">Create, join, and rate sessions.</p>
          </section>

          <div className="mb-8 asym-grid items-start">
            <div className="glass-panel-strong rounded-[2rem] p-6 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <p className="section-kicker">Schedule</p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                    Manage your next session.
                  </h2>
                </div>

                <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
                  <article className="page-card p-5">
                    <div className="flex items-center gap-3">
                      <CalendarRange size={20} className="text-[color:var(--accent-strong)]" />
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">Upcoming</p>
                    </div>
                    <p className="mt-4 text-3xl font-black text-[color:var(--foreground)]">{joinedUpcomingCount}</p>
                    <p className="mt-2 text-sm text-[color:var(--ink-muted)]">joined or hosted sessions</p>
                  </article>

                  <article className="glass-panel rounded-[1.6rem] p-5">
                    <div className="flex items-center gap-3 text-[color:var(--accent-strong)]">
                      <BellRing size={20} />
                      <p className="text-sm font-semibold uppercase tracking-[0.2em]">Reminders</p>
                    </div>
                    <p className="mt-4 text-3xl font-black text-[color:var(--foreground)]">{userSettings?.reminder_minutes_before ?? 30}</p>
                    <p className="mt-2 text-sm text-[color:var(--ink-muted)]">minutes before a session starts</p>
                  </article>
                </div>
              </div>
            </div>

          </div>

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <label className="w-full max-w-sm space-y-2">
              <span className="soft-label">Course</span>
              <select
                className="field-shell"
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                {filteredCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setShowCourseBrowser((current) => !current)}
                className="secondary-button px-4 py-2 text-sm"
              >
                {showCourseBrowser ? "Hide Course List" : "Browse All Courses"}
              </button>
              <button
                type="button"
                onClick={openPlanner}
                className="primary-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
              >
                <Plus size={16} />
                Plan Meeting
              </button>
            </div>
          </div>

          {showCourseBrowser && (
            <section className="mb-8 page-card p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold text-[color:var(--foreground)]">Course Browser</h2>
                <div className="relative w-full sm:max-w-xs">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-subtle)]" />
                  <input
                    className="field-shell pl-9"
                    value={courseQuery}
                    onChange={(event) => setCourseQuery(event.target.value)}
                    placeholder="Search courses"
                  />
                </div>
              </div>

              <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                {groupedFilteredCourses.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">{group.label}</p>
                      <p className="text-xs text-[color:var(--ink-subtle)]">{group.courses.length}</p>
                    </div>
                    {group.courses.map((course) => {
                      const active = selectedCourseId === course.id;
                      return (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => setSelectedCourseId(course.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                            active
                              ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                              : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                          }`}
                        >
                          <span>{course.title}</span>
                          {active && <span className="text-xs font-semibold">Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
                {filteredCourses.length === 0 && (
                  <p className="text-sm text-[color:var(--ink-muted)]">No courses match your search.</p>
                )}
              </div>
            </section>
          )}

          {loading && <p className="mb-4 text-sm text-[color:var(--ink-muted)]">Loading sessions...</p>}
          {statusMessage && <p className="mb-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          <section className="mb-8 asym-grid items-start">
          <StudyRoomTimer />
        </section>

          {showPlanner && (
            <div
              className={`fixed inset-0 z-50 flex items-center justify-center bg-[rgba(13,27,42,0.45)] p-4 transition-opacity duration-200 ${
                plannerVisible ? "opacity-100" : "opacity-0"
              }`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closePlanner();
                }
              }}
            >
              <div
                className={`max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl transition-all duration-200 sm:p-8 ${
                  plannerVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.985] opacity-0"
                }`}
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="section-kicker">Session Builder</p>
                    <h2 className="mt-2 text-2xl font-bold text-[color:var(--foreground)]">Plan a Jitsi-ready room</h2>
                  </div>
                  <button
                    type="button"
                    onClick={closePlanner}
                    className="secondary-button inline-flex h-10 w-10 items-center justify-center"
                    aria-label="Close planner"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="soft-label">Topic</span>
                <input
                  className="field-shell"
                  value={topicFocus}
                  onChange={(event) => setTopicFocus(event.target.value)}
                  placeholder="Calculus I - Limits Review"
                />
              </label>

              <label className="space-y-2">
                <span className="soft-label">Virtual Room Name</span>
                <input
                  className="field-shell"
                  value={classroomName}
                  onChange={(event) => setClassroomName(event.target.value)}
                />
              </label>

              <label className="space-y-2">
                <span className="soft-label">Start Time</span>
                <input
                  type="datetime-local"
                  className="field-shell"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </label>

              <label className="space-y-2">
                <span className="soft-label">End Time</span>
                <input
                  type="datetime-local"
                  className="field-shell"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </label>

              <label className="space-y-2">
                <span className="soft-label">Reminder Timing</span>
                <select
                  className="field-shell"
                  value={reminderMinutesBefore}
                  onChange={(event) => setReminderMinutesBefore(event.target.value)}
                >
                  <option value="5">5 minutes before</option>
                  <option value="10">10 minutes before</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="soft-label">Room URL (Optional)</span>
                <textarea
                  className="field-shell min-h-24"
                  value={customRoomLink}
                  onChange={(event) => setCustomRoomLink(event.target.value)}
                  placeholder="Paste a custom Jitsi room URL, or leave blank to auto-generate the standard room link"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="soft-label">Invite Users (Optional)</span>
                <textarea
                  className="field-shell min-h-24"
                  value={inviteEmails}
                  onChange={(event) => setInviteEmails(event.target.value)}
                  placeholder="Enter school emails separated by commas or new lines"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="soft-label">Session Notes</span>
                <textarea
                  className="field-shell min-h-24"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Agenda, prep instructions, or session goals"
                />
              </label>

              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="primary-button px-5 py-3 text-sm hover:-translate-y-0.5 disabled:opacity-60 md:col-span-2"
              >
                {creating ? "Scheduling..." : "Create Session"}
              </button>
            </div>
              </div>
            </div>
          )}

          <section className="glass-panel-strong rounded-[2rem] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <UsersRound className="text-[color:var(--accent-strong)]" size={22} />
              <div>
                <p className="section-kicker">Session Calendar</p>
                <h2 className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">Upcoming rooms and attendance</h2>
              </div>
            </div>

            <div className="space-y-6">
            {groupedSessions.length === 0 && !loading && (
              <p className="text-sm text-[color:var(--ink-muted)]">No sessions scheduled yet for this course.</p>
            )}

            {groupedSessions.map((group) => (
              <div key={group.date} className="space-y-4">
                <h3 className="section-kicker">{group.date}</h3>
                <div className="grid gap-4 xl:grid-cols-2">
                  {group.sessions.map((session) => {
                    const hasEnded = new Date(session.end_time).getTime() < Date.now();
                    return (
                      <article key={session.id} className="rounded-[1.6rem] border border-[color:var(--border)] bg-white/75 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-semibold text-[color:var(--foreground)]">{session.topic_focus}</h4>
                            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">{session.course_title}</p>
                            <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
                              {new Date(session.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              {" - "}
                              {new Date(session.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">Room: {session.classroom_name}</p>
                            {session.description && <p className="mt-3 text-sm text-[color:var(--foreground)]">{session.description}</p>}
                            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">
                              Reminder set for {Number(reminderMinutesBefore)} minutes before start
                            </p>
                            {session.invited_count > 0 && (
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
                                {session.invited_count} invited
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            {!session.joined && (
                              <button
                                onClick={() => handleJoinSession(session.id)}
                                disabled={busySessionId === session.id}
                                className="rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--foreground)] hover:-translate-y-0.5"
                              >
                                {busySessionId === session.id ? "Joining..." : "Join Session"}
                              </button>
                            )}
                            <button
                              onClick={() => handleDownloadCalendarInvite(session.id)}
                              disabled={busySessionId === session.id}
                              className="rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--foreground)] hover:-translate-y-0.5 disabled:opacity-60"
                            >
                              {busySessionId === session.id ? "Preparing..." : "Add To Calendar"}
                            </button>
                            {session.meet_link && (
                              <button
                                onClick={() => router.push(`/dashboard/virtual-sessions/room/${session.id}`)}
                                className="primary-button px-4 py-2 text-center text-sm hover:-translate-y-0.5"
                              >
                                Open Jitsi Room
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {session.participants.map((participant) => (
                            <div key={participant.user_id} className="rounded-[1.1rem] bg-[rgba(255,250,243,0.9)] p-3 text-sm text-[color:var(--ink-muted)]">
                              <p className="font-medium text-[color:var(--foreground)]">{participant.full_name || participant.email}</p>
                              <p>{participant.email}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.15em]">{participant.status}</p>
                            </div>
                          ))}
                        </div>

                        {hasEnded && session.joined && (
                          <div className="mt-5 rounded-[1.4rem] border border-[color:var(--border)] bg-[rgba(255,250,243,0.9)] p-4">
                            <h5 className="text-sm font-semibold text-[color:var(--foreground)]">Post-Session Rating</h5>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <select
                                className="rounded-[1rem] border border-[color:var(--border)] bg-white p-3"
                                value={ratingScores[session.id] ?? ""}
                                onChange={(event) => setRatingScores((current) => ({ ...current, [session.id]: event.target.value }))}
                              >
                                <option value="">Select score</option>
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <option key={score} value={score}>
                                    {score} / 5
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleRateSession(session.id)}
                                disabled={busySessionId === session.id}
                                className="rounded-full editorial-gradient px-4 py-2 text-sm font-semibold text-white hover:-translate-y-0.5 disabled:opacity-60"
                              >
                                {busySessionId === session.id ? "Submitting..." : "Submit Rating"}
                              </button>
                              <textarea
                                className="min-h-24 rounded-[1rem] border border-[color:var(--border)] bg-white p-3 md:col-span-2"
                                value={ratingFeedback[session.id] ?? ""}
                                onChange={(event) =>
                                  setRatingFeedback((current) => ({ ...current, [session.id]: event.target.value }))
                                }
                                placeholder="What was helpful about this session?"
                              />
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}