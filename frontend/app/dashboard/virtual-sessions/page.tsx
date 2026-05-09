"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Filter,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, hasAuthToken } from "../../../lib/api";
import { buildDefaultVirtualRoomUrl } from "../../../lib/virtual-room";

type CourseSummary = {
  id: string;
  title: string;
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
};

type UserCore = {
  id: string;
  full_name: string | null;
  email: string;
};

type UserSearchResult = {
  user_id: string;
  full_name: string | null;
  email: string;
};

type TutorSuggestion = {
  user_id: string;
  full_name: string | null;
  email: string;
  match_score: number;
};

type ResourceSummary = {
  id: string;
  title: string;
  resource_type: string;
  created_at: string;
};

type SessionTab = "all" | "hosted" | "joined" | "saved" | "past";
type DateFilter = "this_week" | "next_7_days" | "all_time";
type CalendarView = "week" | "day" | "month";
type ScheduleStep = 1 | 2 | 3 | 4;

const TAB_OPTIONS: Array<{ key: SessionTab; label: string }> = [
  { key: "all", label: "ALL" },
  { key: "hosted", label: "HOSTED" },
  { key: "joined", label: "JOINED" },
  { key: "saved", label: "SAVED" },
  { key: "past", label: "PAST" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATION_OPTIONS = [60, 90, 120, 180];

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function endOfWeek(date: Date): Date {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 7);
  return end;
}

function formatTime(dateISO: string): string {
  return new Date(dateISO).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function combineDateTime(dateValue: string, timeValue: string): Date {
  return new Date(`${dateValue}T${timeValue}:00`);
}

function roomNameFromTopic(topic: string, courseTitle: string): string {
  const base = `${courseTitle}-${topic}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `peerstud-${base || "session"}`;
}

function getSessionMeetingUrl(session: SessionItem): string {
  if (session.meet_link && session.meet_link.trim().length > 0) {
    return session.meet_link.trim();
  }

  return buildDefaultVirtualRoomUrl({
    courseId: session.course_id,
    classroomName: session.classroom_name || `session-${session.id.slice(0, 8)}`,
    topicFocus: session.topic_focus || "study-session",
    startTime: session.start_time,
  });
}

function loadSavedSessions(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem("peerstud_saved_sessions");
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id) => typeof id === "string");
  } catch {
    return [];
  }
}

function persistSavedSessions(sessionIds: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("peerstud_saved_sessions", JSON.stringify(sessionIds));
}

export default function VirtualSessionsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [me, setMe] = useState<UserCore | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  const [activeTab, setActiveTab] = useState<SessionTab>("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_week");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [searchTerm, setSearchTerm] = useState("");

  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [savedSessionIds, setSavedSessionIds] = useState<string[]>([]);

  const [sessionResources, setSessionResources] = useState<ResourceSummary[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStep, setScheduleStep] = useState<ScheduleStep>(1);
  const [creatingSession, setCreatingSession] = useState(false);

  const [wizardCourseId, setWizardCourseId] = useState("");
  const [wizardTopic, setWizardTopic] = useState("");
  const [wizardDescription, setWizardDescription] = useState("");

  const [wizardDate, setWizardDate] = useState(() => toDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [wizardStartTime, setWizardStartTime] = useState("15:00");
  const [wizardDurationMinutes, setWizardDurationMinutes] = useState(60);
  const [wizardRecurring, setWizardRecurring] = useState("one_time");
  const [wizardRecurringUntil, setWizardRecurringUntil] = useState(() => toDateInputValue(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)));

  const [recommendedTutors, setRecommendedTutors] = useState<TutorSuggestion[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<UserSearchResult[]>([]);
  const [selectedInviteEmails, setSelectedInviteEmails] = useState<string[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(8);

  const [wizardEnableLobby, setWizardEnableLobby] = useState(true);
  const [wizardPasswordProtected, setWizardPasswordProtected] = useState(true);
  const [wizardAllowBeforeHost, setWizardAllowBeforeHost] = useState(false);
  const [wizardEnableRecording, setWizardEnableRecording] = useState(true);
  const [wizardEnableChat, setWizardEnableChat] = useState(true);
  const [wizardReminderOneHour, setWizardReminderOneHour] = useState(true);
  const [wizardReminderFifteen, setWizardReminderFifteen] = useState(true);

  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [showCoursesPanel, setShowCoursesPanel] = useState(true);
  const [showAllSessionsPanel, setShowAllSessionsPanel] = useState(false);

  const loadData = useCallback(async () => {
    const [meResponse, settingsResponse, mineCourses, allSessions] = await Promise.all([
      authedFetch<UserCore>("/users/me"),
      authedFetch<UserSettings>("/users/me/settings"),
      authedFetch<CourseSummary[]>("/courses?mine_only=true").catch(() => []),
      authedFetch<SessionItem[]>("/sessions"),
    ]);

    const coursePool = mineCourses.length > 0 ? mineCourses : await authedFetch<CourseSummary[]>("/courses");
    const dedupedCourses = Array.from(new Map(coursePool.map((course) => [course.id, course])).values());

    setMe(meResponse);
    setSettings(settingsResponse);
    setCourses(dedupedCourses);
    setSessions(allSessions);
    setSavedSessionIds(loadSavedSessions());

    if (!selectedCourseId && dedupedCourses[0]?.id) {
      setSelectedCourseId("all");
    }

    if (!wizardCourseId && dedupedCourses[0]?.id) {
      setWizardCourseId(dedupedCourses[0].id);
    }

    if (!selectedSessionId && allSessions[0]?.id) {
      setSelectedSessionId(allSessions[0].id);
    }
  }, [selectedCourseId, selectedSessionId, wizardCourseId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        await loadData();
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load virtual sessions.");
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
  }, [loadData, router]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );
  const selectedSessionMeetingUrl = selectedSession ? getSessionMeetingUrl(selectedSession) : "";

  useEffect(() => {
    let cancelled = false;

    async function loadResources() {
      if (!selectedSession) {
        setSessionResources([]);
        return;
      }
      setLoadingResources(true);
      try {
        const resources = await authedFetch<ResourceSummary[]>(`/resources?session_id=${selectedSession.id}`);
        if (!cancelled) {
          setSessionResources(resources.slice(0, 8));
        }
      } catch {
        if (!cancelled) {
          setSessionResources([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingResources(false);
        }
      }
    }

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, [selectedSession]);

  useEffect(() => {
    if (!showScheduleModal) {
      return;
    }

    let cancelled = false;

    async function loadRecommendations() {
      try {
        const suggestions = await authedFetch<TutorSuggestion[]>("/tutors/suggestions?limit=8");
        if (!cancelled) {
          setRecommendedTutors(suggestions);
        }
      } catch {
        if (!cancelled) {
          setRecommendedTutors([]);
        }
      }
    }

    void loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [showScheduleModal]);

  useEffect(() => {
    if (!showScheduleModal || studentQuery.trim().length < 2) {
      setStudentResults([]);
      return;
    }

    let cancelled = false;

    async function searchStudents() {
      try {
        const result = await authedFetch<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(studentQuery.trim())}`);
        if (!cancelled) {
          setStudentResults(result);
        }
      } catch {
        if (!cancelled) {
          setStudentResults([]);
        }
      }
    }

    void searchStudents();

    return () => {
      cancelled = true;
    };
  }, [showScheduleModal, studentQuery]);

  const now = Date.now();

  const filteredSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return sessions.filter((session) => {
      const start = new Date(session.start_time).getTime();
      const end = new Date(session.end_time).getTime();

      if (selectedCourseId !== "all" && session.course_id !== selectedCourseId) {
        return false;
      }

      if (activeTab === "hosted" && session.host_user_id !== me?.id) {
        return false;
      }
      if (activeTab === "joined" && !session.joined) {
        return false;
      }
      if (activeTab === "saved" && !savedSessionIds.includes(session.id)) {
        return false;
      }
      if (activeTab === "past" && end >= now) {
        return false;
      }
      if (activeTab !== "past" && dateFilter !== "all_time") {
        if (dateFilter === "this_week") {
          const from = startOfWeek(new Date()).getTime();
          const to = endOfWeek(new Date()).getTime();
          if (start < from || start >= to) {
            return false;
          }
        }
        if (dateFilter === "next_7_days") {
          const to = now + 7 * 24 * 60 * 60 * 1000;
          if (start < now || start > to) {
            return false;
          }
        }
      }

      if (query) {
        const haystack = `${session.topic_focus} ${session.course_title} ${session.classroom_name} ${session.meet_link || ""} ${session.host_name || ""}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [activeTab, dateFilter, me?.id, now, savedSessionIds, searchTerm, selectedCourseId, sessions]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(weekAnchor);
      day.setDate(day.getDate() + index);
      return day;
    });
  }, [weekAnchor]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    filteredSessions.forEach((session) => {
      const key = toDateInputValue(new Date(session.start_time));
      map.set(key, [...(map.get(key) ?? []), session]);
    });

    map.forEach((value, key) => {
      map.set(
        key,
        value.sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()),
      );
    });

    return map;
  }, [filteredSessions]);

  const weekSessionsByDay = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    weekDays.forEach((day) => {
      const key = toDateInputValue(day);
      map.set(key, sessionsByDate.get(key) ?? []);
    });
    return map;
  }, [sessionsByDate, weekDays]);

  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), 1);
    const gridStart = startOfWeek(firstOfMonth);
    const todayKey = toDateInputValue(new Date());

    return Array.from({ length: 42 }).map((_, index) => {
      const day = new Date(gridStart);
      day.setDate(day.getDate() + index);
      return {
        date: day,
        key: toDateInputValue(day),
        isCurrentMonth: day.getMonth() === firstOfMonth.getMonth(),
        isToday: toDateInputValue(day) === todayKey,
      };
    });
  }, [weekAnchor]);

  const courseMeta = useMemo(() => {
    return courses.map((course) => {
      const related = sessions.filter(
        (session) => session.course_id === course.id && new Date(session.end_time).getTime() >= now,
      );
      const nextSession = related
        .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())[0];
      return {
        ...course,
        activeCount: related.length,
        nextSession,
      };
    });
  }, [courses, now, sessions]);

  const sessionsThisWeek = sessions.filter((session) => {
    const ts = new Date(session.start_time).getTime();
    return ts >= startOfWeek(new Date()).getTime() && ts < endOfWeek(new Date()).getTime();
  }).length;

  const hoursLogged = sessions
    .filter((session) => session.joined || session.host_user_id === me?.id)
    .reduce((sum, session) => {
      const hours = (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / (60 * 60 * 1000);
      return sum + Math.max(0, hours);
    }, 0);

  const averageAttendance = sessions.length
    ? sessions.reduce((sum, session) => sum + session.participant_count, 0) / sessions.length
    : 0;

  function toggleSavedSession(sessionId: string): void {
    setSavedSessionIds((current) => {
      const next = current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId];
      persistSavedSessions(next);
      return next;
    });
  }

  async function handleJoinSession(sessionId: string): Promise<void> {
    try {
      setBusySessionId(sessionId);
      setStatusMessage("");
      await authedFetch(`/sessions/${sessionId}/join`, { method: "POST" });
      await loadData();
      setStatusMessage("Joined session successfully.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Could not join this session.");
    } finally {
      setBusySessionId(null);
    }
  }

  function openScheduleModal(courseId?: string): void {
    setShowScheduleModal(true);
    setScheduleStep(1);
    setStatusMessage("");
    if (courseId) {
      setWizardCourseId(courseId);
    }
  }

  function closeScheduleModal(): void {
    setShowScheduleModal(false);
    setStudentQuery("");
    setStudentResults([]);
    setSelectedInviteEmails([]);
  }

  function toggleInviteEmail(email: string): void {
    setSelectedInviteEmails((current) =>
      current.includes(email) ? current.filter((value) => value !== email) : [...current, email],
    );
  }

  const selectedCourseTitle =
    courses.find((course) => course.id === wizardCourseId)?.title ?? "course";
  const generatedRoomName = roomNameFromTopic(wizardTopic, selectedCourseTitle);

  const wizardStartDate = combineDateTime(wizardDate, wizardStartTime);
  const wizardEndDate = new Date(wizardStartDate.getTime() + wizardDurationMinutes * 60 * 1000);

  const hostConflicts = sessions.filter((session) => {
    if (session.host_user_id !== me?.id && !session.joined) {
      return false;
    }
    const existingStart = new Date(session.start_time).getTime();
    const existingEnd = new Date(session.end_time).getTime();
    return existingStart < wizardEndDate.getTime() && existingEnd > wizardStartDate.getTime();
  }).length;

  async function handleCreateSession(): Promise<void> {
    if (!wizardCourseId || !wizardTopic.trim()) {
      setStatusMessage("Select a course and provide a session title.");
      return;
    }
    if (wizardEndDate <= wizardStartDate) {
      setStatusMessage("End time must be after start time.");
      return;
    }

    const reminderMinutes = wizardReminderOneHour ? 60 : wizardReminderFifteen ? 15 : settings?.reminder_minutes_before ?? 30;

    try {
      setCreatingSession(true);
      setStatusMessage("");

      await authedFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({
          course_id: wizardCourseId,
          classroom_name: generatedRoomName,
          topic_focus: wizardTopic.trim(),
          description: wizardDescription.trim() || null,
          start_time: wizardStartDate.toISOString(),
          end_time: wizardEndDate.toISOString(),
          meet_link: buildDefaultVirtualRoomUrl({
            courseId: wizardCourseId,
            classroomName: generatedRoomName,
            topicFocus: wizardTopic,
            startTime: wizardStartDate.toISOString(),
          }),
          reminder_minutes_before: reminderMinutes,
          invite_emails: selectedInviteEmails,
        }),
      });

      closeScheduleModal();
      await loadData();
      setStatusMessage(
        wizardRecurring === "one_time"
          ? "Session created successfully."
          : "Session created. Recurring series UI is staged; duplicate upcoming sessions manually for now.",
      );

      setWizardTopic("");
      setWizardDescription("");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to schedule session.");
    } finally {
      setCreatingSession(false);
    }
  }

  const weekTitle = `${weekDays[0].toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} - ${weekDays[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  const monthTitle = new Date(weekAnchor).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const dayTitle = new Date(weekAnchor).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const calendarLabel =
    calendarView === "month" ? "Month View" : calendarView === "day" ? "Day View" : "Week View";
  const calendarTitle =
    calendarView === "month" ? monthTitle : calendarView === "day" ? dayTitle : weekTitle;

  const timelineDays = calendarView === "day" ? [new Date(weekAnchor)] : weekDays;

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          <section className="page-card-strong rounded-[2rem] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-[color:var(--foreground)]">Virtual Sessions</h1>
                <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                  Schedule, host, and join course-focused study sessions.
                </p>
              </div>
              <button
                onClick={() => openScheduleModal()}
                className="primary-button inline-flex items-center gap-2 px-5 py-2.5 text-sm"
              >
                <Plus size={16} />
                Schedule New Session
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {TAB_OPTIONS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.14em] ${
                    activeTab === tab.key
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                      : "border-[color:var(--border)] bg-white/80 text-[color:var(--ink-muted)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-3 rounded-[1.6rem] border border-[color:var(--border)] bg-white/80 p-4 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="soft-label">Filter by Course</span>
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="field-shell"
              >
                <option value="all">All Courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="soft-label">Date</span>
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                className="field-shell"
              >
                <option value="this_week">This Week</option>
                <option value="next_7_days">Next 7 Days</option>
                <option value="all_time">All Time</option>
              </select>
            </label>

            <label className="space-y-1 lg:col-span-2">
              <span className="soft-label">Search sessions</span>
              <div className="field-shell flex items-center gap-2 px-3">
                <Search size={15} className="text-[color:var(--ink-subtle)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by topic, course, host, or Jitsi link"
                  className="w-full bg-transparent text-sm outline-none"
                />
                <Filter size={15} className="text-[color:var(--ink-subtle)]" />
              </div>
            </label>
          </section>

          {loading && <p className="mt-4 text-sm text-[color:var(--ink-muted)]">Loading sessions...</p>}
          {statusMessage && <p className="mt-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          <section className="mt-4 rounded-[1.6rem] border border-[color:var(--border)] bg-white/75 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="section-kicker">My Courses</p>
              <button
                onClick={() => setShowCoursesPanel((current) => !current)}
                className="secondary-button px-3 py-1.5 text-xs"
              >
                {showCoursesPanel ? "Collapse" : "Expand"}
              </button>
            </div>

            {showCoursesPanel && (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {courseMeta.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`rounded-[1.2rem] border px-4 py-3 text-left ${
                      selectedCourseId === course.id
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                        : "border-[color:var(--border)] bg-white/80"
                    }`}
                  >
                    <p className="font-semibold text-[color:var(--foreground)]">{course.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                      {course.activeCount > 0
                        ? `${course.activeCount} active ${course.activeCount === 1 ? "session" : "sessions"}`
                        : "No active sessions"}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                      {course.nextSession
                        ? `Next: ${new Date(course.nextSession.start_time).toLocaleString([], {
                            weekday: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : "Create first session"}
                    </p>
                  </button>
                ))}
                {courseMeta.length === 0 && (
                  <p className="rounded-[1rem] bg-white/70 px-3 py-2 text-sm text-[color:var(--ink-muted)]">
                    No courses found yet.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(340px,380px)_minmax(0,1fr)]">
            <aside className="space-y-4">
              <article className="glass-panel rounded-[1.6rem] p-5">
                <p className="section-kicker">Session Details</p>

                {!selectedSession && (
                  <p className="mt-3 text-sm text-[color:var(--ink-muted)]">Select a session to view details.</p>
                )}

                {selectedSession && (
                  <div className="mt-3 space-y-4 text-sm">
                    <h3 className="text-lg font-semibold text-[color:var(--foreground)]">{selectedSession.topic_focus}</h3>
                    <p className="text-[color:var(--ink-muted)]">{selectedSession.course_title}</p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <p className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[color:var(--ink-muted)]">
                        <Clock3 size={14} />
                        {new Date(selectedSession.start_time).toLocaleString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>

                      <p className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[color:var(--ink-muted)]">
                        <Users size={14} />
                        Participants {selectedSession.participant_count}/{selectedSession.participant_count + selectedSession.invited_count}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <p className="rounded-[0.9rem] border border-[color:var(--border)] bg-white/75 px-3 py-2 text-xs text-[color:var(--ink-muted)] sm:col-span-2">
                        Jitsi Link:{" "}
                        <a
                          href={selectedSessionMeetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[color:var(--accent-strong)] underline decoration-[color:var(--accent-strong)]/40 underline-offset-2 break-all"
                        >
                          {selectedSessionMeetingUrl}
                        </a>
                      </p>
                      <p className="rounded-[0.9rem] border border-[color:var(--border)] bg-white/75 px-3 py-2 text-xs text-[color:var(--ink-muted)]">
                        Visibility: <span className="font-semibold text-[color:var(--foreground)]">{selectedSession.invited_count > 0 ? "Private" : "Public"}</span>
                      </p>
                      <p className="rounded-[0.9rem] border border-[color:var(--border)] bg-white/75 px-3 py-2 text-xs text-[color:var(--ink-muted)]">
                        Status: <span className="font-semibold text-[color:var(--foreground)]">{selectedSession.status}</span>
                      </p>
                      <p className="rounded-[0.9rem] border border-[color:var(--border)] bg-white/75 px-3 py-2 text-xs text-[color:var(--ink-muted)]">
                        Rating: <span className="font-semibold text-[color:var(--foreground)]">{selectedSession.average_rating ?? "Not rated"}</span>
                      </p>
                    </div>

                    {selectedSession.description && (
                      <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3">
                        <p className="soft-label mb-2">Session Focus</p>
                        <p className="text-xs text-[color:var(--ink-muted)]">{selectedSession.description}</p>
                      </div>
                    )}

                    <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3">
                      <p className="soft-label mb-2">Host</p>
                      <p className="font-medium text-[color:var(--foreground)]">{selectedSession.host_name ?? "Unknown Host"}</p>
                    </div>

                    <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3">
                      <p className="soft-label mb-2">Participants</p>
                      <div className="space-y-2">
                        {selectedSession.participants.slice(0, 6).map((participant) => (
                          <div key={participant.user_id} className="flex items-center justify-between text-xs">
                            <span className="text-[color:var(--foreground)]">{participant.full_name || participant.email}</span>
                            <span className="text-[color:var(--ink-muted)]">{participant.status}</span>
                          </div>
                        ))}
                        {selectedSession.participants.length === 0 && (
                          <p className="text-xs text-[color:var(--ink-muted)]">No participants yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3">
                      <p className="soft-label mb-2">Shared Resources</p>
                      {loadingResources ? (
                        <p className="text-xs text-[color:var(--ink-muted)]">Loading resources...</p>
                      ) : sessionResources.length === 0 ? (
                        <p className="text-xs text-[color:var(--ink-muted)]">No resources shared yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {sessionResources.map((resource) => (
                            <p key={resource.id} className="text-xs text-[color:var(--foreground)]">
                              {resource.resource_type === "link" ? "Link" : "File"}: {resource.title}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (!selectedSession.joined) {
                            void handleJoinSession(selectedSession.id);
                          }
                        }}
                        disabled={selectedSession.joined || busySessionId === selectedSession.id}
                        className="secondary-button px-3 py-2 text-xs disabled:opacity-60"
                      >
                        {busySessionId === selectedSession.id
                          ? "Submitting..."
                          : selectedSession.joined
                            ? "Joined"
                            : selectedSession.invited_count > 0
                              ? "Request to Join"
                              : "Join Session"}
                      </button>

                      <button
                        onClick={() => toggleSavedSession(selectedSession.id)}
                        className="secondary-button px-3 py-2 text-xs"
                      >
                        {savedSessionIds.includes(selectedSession.id) ? "Unsave" : "Save"}
                      </button>

                      <button
                        onClick={() => {
                          window.open(selectedSessionMeetingUrl, "_blank", "noopener,noreferrer");
                        }}
                        className="primary-button px-3 py-2 text-xs"
                      >
                        Open Jitsi
                      </button>

                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(selectedSessionMeetingUrl);
                          setStatusMessage("Jitsi link copied.");
                        }}
                        className="secondary-button px-3 py-2 text-xs"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                )}
              </article>

              <article className="page-card rounded-[1.6rem] border p-5">
                <p className="section-kicker">Quick Stats</p>
                <div className="mt-4 space-y-2 text-sm text-[color:var(--ink-muted)]">
                  <p className="flex items-center justify-between">
                    <span>Sessions this week</span>
                    <strong className="text-[color:var(--foreground)]">{sessionsThisWeek}</strong>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Hours logged</span>
                    <strong className="text-[color:var(--foreground)]">{hoursLogged.toFixed(1)} hrs</strong>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Avg attendance</span>
                    <strong className="text-[color:var(--foreground)]">{averageAttendance.toFixed(1)} ppl</strong>
                  </p>
                </div>
              </article>

            </aside>

            <section className="min-w-0 space-y-4">
              <article className="glass-panel-strong rounded-[1.6rem] p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="section-kicker">{calendarLabel}</p>
                    <h2 className="mt-1 text-xl font-bold text-[color:var(--foreground)]">{calendarTitle}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const previous = new Date(weekAnchor);
                        if (calendarView === "month") {
                          previous.setMonth(previous.getMonth() - 1);
                        } else if (calendarView === "day") {
                          previous.setDate(previous.getDate() - 1);
                        } else {
                          previous.setDate(previous.getDate() - 7);
                        }
                        previous.setHours(0, 0, 0, 0);
                        setWeekAnchor(calendarView === "week" ? startOfWeek(previous) : previous);
                      }}
                      className="secondary-button px-3 py-1.5 text-xs"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => {
                        const next = new Date(weekAnchor);
                        if (calendarView === "month") {
                          next.setMonth(next.getMonth() + 1);
                        } else if (calendarView === "day") {
                          next.setDate(next.getDate() + 1);
                        } else {
                          next.setDate(next.getDate() + 7);
                        }
                        next.setHours(0, 0, 0, 0);
                        setWeekAnchor(calendarView === "week" ? startOfWeek(next) : next);
                      }}
                      className="secondary-button px-3 py-1.5 text-xs"
                    >
                      Next
                    </button>
                    <div className="ml-2 flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-white/70 p-1">
                      {(["week", "month", "day"] as CalendarView[]).map((view) => (
                        <button
                          key={view}
                          onClick={() => setCalendarView(view)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            calendarView === view
                              ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                              : "text-[color:var(--ink-muted)]"
                          }`}
                        >
                          {view.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {calendarView === "month" ? (
                  <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/75 p-3">
                    <div className="mb-2 grid grid-cols-7 gap-2">
                      {DAY_LABELS.map((label) => (
                        <p
                          key={label}
                          className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-muted)]"
                        >
                          {label}
                        </p>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                      {monthDays.map((day) => {
                        const daySessions = sessionsByDate.get(day.key) ?? [];
                        return (
                          <div
                            key={day.key}
                            onClick={() => {
                              setWeekAnchor(new Date(day.date));
                              setCalendarView("day");
                            }}
                            className={`min-h-[104px] cursor-pointer rounded-lg border p-2 transition-colors ${
                              day.isToday
                                ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                                : day.isCurrentMonth
                                  ? "border-[color:var(--border)] bg-white/90 hover:bg-white"
                                  : "border-[color:var(--border)] bg-white/45"
                            }`}
                          >
                            <p
                              className={`text-xs font-semibold ${
                                day.isCurrentMonth ? "text-[color:var(--foreground)]" : "text-[color:var(--ink-subtle)]"
                              }`}
                            >
                              {day.date.getDate()}
                            </p>
                            <div className="mt-2 space-y-1">
                              {daySessions.slice(0, 2).map((session) => (
                                <p
                                  key={session.id}
                                  className="truncate rounded bg-white/85 px-1.5 py-1 text-[11px] text-[color:var(--foreground)]"
                                  title={`${formatTime(session.start_time)} ${session.topic_focus}`}
                                >
                                  {formatTime(session.start_time)} {session.topic_focus}
                                </p>
                              ))}
                              {daySessions.length > 2 && (
                                <p className="text-[11px] text-[color:var(--ink-muted)]">+{daySessions.length - 2} more</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={calendarView === "week" ? "overflow-x-auto pb-1" : ""}>
                    <div className={calendarView === "week" ? "grid min-w-[980px] grid-cols-7 gap-3" : "grid gap-3"}>
                      {timelineDays.map((day) => {
                        const key = toDateInputValue(day);
                        const daySessions = weekSessionsByDay.get(key) ?? sessionsByDate.get(key) ?? [];
                        const isToday = key === toDateInputValue(new Date());
                        return (
                          <div
                            key={key}
                            className={`rounded-[1.1rem] border p-3 ${
                              isToday
                                ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                                : "border-[color:var(--border)] bg-white/80"
                            }`}
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
                              {DAY_LABELS[day.getDay()]} {day.getDate()}
                            </p>
                            <div className="mt-2 space-y-2">
                              {daySessions.map((session) => {
                                const hostedByMe = session.host_user_id === me?.id;
                                return (
                                  <button
                                    key={session.id}
                                    onClick={() => setSelectedSessionId(session.id)}
                                    className={`w-full overflow-hidden rounded-lg border px-2 py-2 text-left text-xs ${
                                      selectedSessionId === session.id
                                        ? "border-[color:var(--accent)] bg-white"
                                        : "border-transparent bg-white/70"
                                    }`}
                                  >
                                    <p className="truncate font-semibold text-[color:var(--foreground)]">{session.course_title}</p>
                                    <p className="text-[color:var(--ink-muted)]">
                                      {formatTime(session.start_time)} - {formatTime(session.end_time)}
                                    </p>
                                    <p className="text-[color:var(--ink-muted)]">
                                      {session.participant_count}/{session.participant_count + session.invited_count} attendees
                                    </p>
                                    {hostedByMe && (
                                      <p className="mt-1 font-semibold text-[color:var(--accent-strong)]">You host</p>
                                    )}
                                  </button>
                                );
                              })}
                              {daySessions.length === 0 && (
                                <p className="rounded-md bg-white/60 px-2 py-1 text-xs text-[color:var(--ink-subtle)]">No sessions</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>

              <article className="page-card rounded-[1.6rem] border p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="section-kicker">All Sessions</p>
                  <button
                    onClick={() => {
                      setActiveTab("all");
                      setDateFilter("all_time");
                      setSelectedCourseId("all");
                      setShowAllSessionsPanel((current) => !current);
                    }}
                    className="secondary-button px-4 py-2 text-xs"
                  >
                    {showAllSessionsPanel ? "Hide Sessions" : "View All Sessions"}
                  </button>
                </div>

                {showAllSessionsPanel && (
                  <div className="mt-4 space-y-3">
                    <p className="rounded-[0.9rem] bg-white/70 px-3 py-2 text-xs text-[color:var(--ink-muted)]">
                      Search and filters above apply to this list.
                    </p>

                    {filteredSessions.length === 0 && (
                      <p className="rounded-[1rem] bg-white/70 px-3 py-2 text-sm text-[color:var(--ink-muted)]">
                        No sessions found with current filters.
                      </p>
                    )}

                    {filteredSessions.map((session) => {
                      const visibility = session.invited_count > 0 ? "Private" : "Public";
                      const actionLabel = session.joined
                        ? "Joined"
                        : visibility === "Private"
                          ? "Request to Join"
                          : "Join Session";
                      return (
                        <article key={session.id} className="rounded-[1rem] border border-[color:var(--border)] bg-white/80 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--foreground)]">{session.topic_focus}</p>
                              <p className="text-xs text-[color:var(--ink-muted)]">{session.course_title} • Host: {session.host_name ?? "Unknown"}</p>
                              <p className="text-xs text-[color:var(--ink-muted)]">
                                {new Date(session.start_time).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[color:var(--background-alt)] px-2 py-1 text-xs text-[color:var(--ink-muted)]">
                                {session.participant_count}/{session.participant_count + session.invited_count} participants
                              </span>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                  visibility === "Private"
                                    ? "bg-[color:var(--navy-tint)] text-[color:var(--navy)]"
                                    : "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                                }`}
                              >
                                {visibility}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedSessionId(session.id)}
                              className="secondary-button px-3 py-1.5 text-xs"
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                if (!session.joined) {
                                  void handleJoinSession(session.id);
                                }
                              }}
                              disabled={session.joined || busySessionId === session.id}
                              className="secondary-button px-3 py-1.5 text-xs disabled:opacity-60"
                            >
                              {busySessionId === session.id ? "Submitting..." : actionLabel}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>
          </section>
        </div>
      </main>

      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(9,20,35,0.58)] p-3">
          <div className="w-full max-w-4xl rounded-[1.8rem] border border-[color:var(--border)] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--foreground)]">Schedule New Virtual Session</h2>
                <p className="text-xs text-[color:var(--ink-muted)]">Step {scheduleStep} of 4</p>
              </div>
              <button onClick={closeScheduleModal} className="rounded-full border border-[color:var(--border)] p-2">
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 h-2 rounded-full bg-[color:var(--background-alt)]">
              <div className="h-2 rounded-full bg-[color:var(--accent)]" style={{ width: `${scheduleStep * 25}%` }} />
            </div>

            {scheduleStep === 1 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Select Course</span>
                  <select
                    value={wizardCourseId}
                    onChange={(event) => setWizardCourseId(event.target.value)}
                    className="field-shell"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Session Title</span>
                  <input
                    value={wizardTopic}
                    onChange={(event) => setWizardTopic(event.target.value)}
                    className="field-shell"
                    placeholder="Derivatives and Chain Rule Review"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Description / Topics to Cover</span>
                  <textarea
                    value={wizardDescription}
                    onChange={(event) => setWizardDescription(event.target.value)}
                    className="field-shell min-h-28"
                    placeholder="List agenda points and outcomes for this session"
                  />
                </label>
              </div>
            )}

            {scheduleStep === 2 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="soft-label">Date</span>
                  <input
                    type="date"
                    value={wizardDate}
                    onChange={(event) => setWizardDate(event.target.value)}
                    className="field-shell"
                  />
                </label>

                <label className="space-y-1">
                  <span className="soft-label">Start Time</span>
                  <input
                    type="time"
                    value={wizardStartTime}
                    onChange={(event) => setWizardStartTime(event.target.value)}
                    className="field-shell"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Duration</span>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map((minutes) => (
                      <button
                        key={minutes}
                        onClick={() => setWizardDurationMinutes(minutes)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          wizardDurationMinutes === minutes
                            ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                            : "border-[color:var(--border)]"
                        }`}
                      >
                        {minutes === 60 ? "1hr" : minutes === 90 ? "1.5hr" : `${minutes / 60}hr`}
                      </button>
                    ))}
                  </div>
                </label>

                <div className="rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--background-alt)] p-3 text-xs text-[color:var(--ink-muted)] md:col-span-2">
                  {hostConflicts > 0
                    ? `Conflict warning: ${hostConflicts} of your sessions overlap this time.`
                    : "Availability check: You are available for this slot."}
                </div>

                <label className="space-y-1">
                  <span className="soft-label">Recurring Session</span>
                  <select
                    value={wizardRecurring}
                    onChange={(event) => setWizardRecurring(event.target.value)}
                    className="field-shell"
                  >
                    <option value="one_time">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-weekly</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="soft-label">Repeat Until</span>
                  <input
                    type="date"
                    value={wizardRecurringUntil}
                    onChange={(event) => setWizardRecurringUntil(event.target.value)}
                    className="field-shell"
                    disabled={wizardRecurring === "one_time"}
                  />
                </label>
              </div>
            )}

            {scheduleStep === 3 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1rem] border border-[color:var(--border)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">Recommended Matches</p>
                    <Sparkles size={16} className="text-[color:var(--accent-strong)]" />
                  </div>
                  <div className="space-y-2">
                    {recommendedTutors.slice(0, 6).map((tutor) => (
                      <label key={tutor.user_id} className="flex items-start gap-2 rounded-lg bg-[color:var(--background-alt)] p-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedInviteEmails.includes(tutor.email)}
                          onChange={() => toggleInviteEmail(tutor.email)}
                        />
                        <span>
                          <strong className="text-[color:var(--foreground)]">{tutor.full_name || tutor.email}</strong>
                          <br />
                          Match: {Math.round((tutor.match_score || 0) * 100)}% | {tutor.email}
                        </span>
                      </label>
                    ))}
                    {recommendedTutors.length === 0 && (
                      <p className="text-xs text-[color:var(--ink-muted)]">No recommendations available yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-[color:var(--border)] p-4">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">Search and Invite Students</p>
                  <input
                    value={studentQuery}
                    onChange={(event) => setStudentQuery(event.target.value)}
                    className="field-shell mt-2"
                    placeholder="Search by name or school email"
                  />
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {studentResults.map((student) => (
                      <label key={student.user_id} className="flex items-start gap-2 rounded-lg bg-[color:var(--background-alt)] p-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedInviteEmails.includes(student.email)}
                          onChange={() => toggleInviteEmail(student.email)}
                        />
                        <span>
                          <strong className="text-[color:var(--foreground)]">{student.full_name || student.email}</strong>
                          <br />
                          {student.email}
                        </span>
                      </label>
                    ))}
                    {studentQuery.trim().length > 1 && studentResults.length === 0 && (
                      <p className="text-xs text-[color:var(--ink-muted)]">No users found for this search.</p>
                    )}
                  </div>
                </div>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Max Capacity</span>
                  <select
                    value={maxCapacity}
                    onChange={(event) => setMaxCapacity(Number(event.target.value))}
                    className="field-shell"
                  >
                    {[4, 6, 8, 10, 12].map((capacity) => (
                      <option key={capacity} value={capacity}>{capacity}</option>
                    ))}
                  </select>
                  <p className="text-xs text-[color:var(--ink-muted)]">Selected invites: {selectedInviteEmails.length}</p>
                </label>
              </div>
            )}

            {scheduleStep === 4 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1rem] border border-[color:var(--border)] p-4 md:col-span-2">
                  <p className="soft-label">Meeting Room Name</p>
                  <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">{generatedRoomName}</p>
                </div>

                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">
                  Enable lobby
                  <input type="checkbox" checked={wizardEnableLobby} onChange={(event) => setWizardEnableLobby(event.target.checked)} />
                </label>

                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">
                  Password protected
                  <input type="checkbox" checked={wizardPasswordProtected} onChange={(event) => setWizardPasswordProtected(event.target.checked)} />
                </label>

                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">
                  Allow participants before host
                  <input type="checkbox" checked={wizardAllowBeforeHost} onChange={(event) => setWizardAllowBeforeHost(event.target.checked)} />
                </label>

                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">
                  Enable recording
                  <input type="checkbox" checked={wizardEnableRecording} onChange={(event) => setWizardEnableRecording(event.target.checked)} />
                </label>

                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">
                  Enable chat
                  <input type="checkbox" checked={wizardEnableChat} onChange={(event) => setWizardEnableChat(event.target.checked)} />
                </label>

                <div className="rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">
                  <p className="font-semibold text-[color:var(--foreground)]">Notifications</p>
                  <label className="mt-2 flex items-center justify-between text-xs">
                    Send reminder 1 hour before
                    <input type="checkbox" checked={wizardReminderOneHour} onChange={(event) => setWizardReminderOneHour(event.target.checked)} />
                  </label>
                  <label className="mt-2 flex items-center justify-between text-xs">
                    Send reminder 15 minutes before
                    <input type="checkbox" checked={wizardReminderFifteen} onChange={(event) => setWizardReminderFifteen(event.target.checked)} />
                  </label>
                </div>

                <div className="rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--background-alt)] p-3 text-xs text-[color:var(--ink-muted)] md:col-span-2">
                  Host reminder: log into your virtual room a few minutes early so you can admit participants and start cleanly.
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setScheduleStep((current) => (current > 1 ? ((current - 1) as ScheduleStep) : current))}
                className="secondary-button px-4 py-2 text-sm"
                disabled={scheduleStep === 1 || creatingSession}
              >
                Back
              </button>

              {scheduleStep < 4 ? (
                <button
                  onClick={() => setScheduleStep((current) => (current < 4 ? ((current + 1) as ScheduleStep) : current))}
                  className="primary-button px-4 py-2 text-sm"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={() => void handleCreateSession()}
                  disabled={creatingSession}
                  className="primary-button inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
                >
                  {creatingSession ? "Creating..." : "Create Session"}
                  <CalendarDays size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
