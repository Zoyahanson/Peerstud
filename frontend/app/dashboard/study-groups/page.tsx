"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hash, MessageCircle, Plus, Users, X } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

type CourseSummary = {
  id: string;
  title: string;
  description: string | null;
  instructor_id: string;
  sessions_count: number;
  resources_count: number;
};

type StudyGroupMember = {
  user_id: string;
  full_name: string | null;
  email: string;
  status: string;
  attendance_count: number;
  joined_at: string;
  last_active_at: string;
};

type StudyGroup = {
  id: string;
  course_id: string;
  course_title: string;
  topic_focus: string;
  scheduled_start: string;
  scheduled_end: string;
  target_size: number;
  min_size: number;
  max_size: number;
  attendance_required: boolean;
  inactive_after_days: number;
  system_suggested: boolean;
  status: string;
  member_count: number;
  open_slots: number;
  joined: boolean;
  members: StudyGroupMember[];
};

type StudyGroupRecommendation = {
  course_id: string;
  course_title: string;
  enrolled_count: number;
  recommendation_type: "join_existing" | "create_suggested";
  message: string;
  suggested_group: StudyGroup | null;
  suggested_topic_focus: string | null;
  suggested_start: string | null;
  suggested_end: string | null;
  complementary_signals: string[];
};

function toDateTimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }
  return new Date(value).toISOString().slice(0, 16);
}

export default function StudyGroupsPage({ onSwitchToChat }: { onSwitchToChat?: () => void } = {}) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [recommendation, setRecommendation] = useState<StudyGroupRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [topicFocus, setTopicFocus] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [targetSize, setTargetSize] = useState("6");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    authedFetch<CourseSummary[]>("/courses")
      .then((response) => {
        setCourses(response);
        setSelectedCourseId(response[0]?.id ?? "");
        setError("");
      })
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load study groups.");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!selectedCourseId) {
      setGroups([]);
      setRecommendation(null);
      return;
    }

    setGroupsLoading(true);
    Promise.all([
      authedFetch<StudyGroup[]>(`/study-groups?course_id=${selectedCourseId}`),
      authedFetch<StudyGroupRecommendation>(`/study-groups/recommendation?course_id=${selectedCourseId}`),
    ])
      .then(([groupResponse, recommendationResponse]) => {
        setGroups(groupResponse);
        setRecommendation(recommendationResponse);
        if (recommendationResponse.recommendation_type === "create_suggested") {
          setTopicFocus(recommendationResponse.suggested_topic_focus ?? "");
          setScheduledStart(toDateTimeLocal(recommendationResponse.suggested_start));
          setScheduledEnd(toDateTimeLocal(recommendationResponse.suggested_end));
          setTargetSize(String(Math.min(Math.max(recommendationResponse.enrolled_count || 6, 5), 15)));
        }
      })
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load study groups.");
      })
      .finally(() => setGroupsLoading(false));
  }, [selectedCourseId]);

  async function refreshSelectedCourse() {
    if (!selectedCourseId) {
      return;
    }
    const [groupResponse, recommendationResponse] = await Promise.all([
      authedFetch<StudyGroup[]>(`/study-groups?course_id=${selectedCourseId}`),
      authedFetch<StudyGroupRecommendation>(`/study-groups/recommendation?course_id=${selectedCourseId}`),
    ]);
    setGroups(groupResponse);
    setRecommendation(recommendationResponse);
  }

  async function handleCreateGroup() {
    if (!selectedCourseId) {
      return;
    }
    try {
      setSaving(true);
      setStatusMessage("");
      await authedFetch<StudyGroup>("/study-groups", {
        method: "POST",
        body: JSON.stringify({
          course_id: selectedCourseId,
          topic_focus: topicFocus,
          scheduled_start: new Date(scheduledStart).toISOString(),
          scheduled_end: new Date(scheduledEnd).toISOString(),
          target_size: Number(targetSize),
        }),
      });
      setStatusMessage("Study group created.");
      await refreshSelectedCourse();
    } catch (createError: unknown) {
      setStatusMessage(createError instanceof Error ? createError.message : "Failed to create group.");
    } finally {
      setSaving(false);
    }
  }

  async function handleJoinGroup(groupId: string) {
    try {
      setStatusMessage("");
      await authedFetch<StudyGroup>(`/study-groups/${groupId}/join`, { method: "POST" });
      setStatusMessage("You joined the study group.");
      await refreshSelectedCourse();
    } catch (joinError: unknown) {
      setStatusMessage(joinError instanceof Error ? joinError.message : "Failed to join group.");
    }
  }

  async function handleMarkAttendance(groupId: string) {
    try {
      setStatusMessage("");
      await authedFetch<StudyGroup>(`/study-groups/${groupId}/attendance`, { method: "POST" });
      setStatusMessage("Attendance recorded.");
      await refreshSelectedCourse();
    } catch (attendanceError: unknown) {
      setStatusMessage(attendanceError instanceof Error ? attendanceError.message : "Failed to record attendance.");
    }
  }

  return (
    <div className="page-shell">
      <Sidebar />

      {/* Telegram-style group browser */}
      <main className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4" style={{ height: "calc(100vh - 4rem)" }}>
        {/* Left panel – group list */}
        <div className="flex w-72 shrink-0 flex-col rounded-[2rem] border border-white/10 bg-[color:var(--sidebar-bg)] shadow-xl xl:w-80">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            {onSwitchToChat ? (
              <div className="flex flex-1 gap-1 rounded-xl bg-white/10 p-1">
                <button
                  onClick={onSwitchToChat}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[color:var(--sidebar-text)] transition hover:text-white"
                >
                  <MessageCircle size={13} />
                  Chats
                </button>
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--navy-dark)] px-2 py-1.5 text-xs font-semibold text-white transition"
                >
                  <Users size={13} />
                  Groups
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-bold text-white">Study Groups</h2>
                <p className="text-[11px] text-[color:var(--sidebar-muted)]">
                  {groups.length} active group{groups.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
            <button
              onClick={() => { setShowCreateForm(true); setSelectedGroupId(null); }}
              title="Create group"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-white hover:opacity-90 transition"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Course selector */}
          <div className="border-b border-white/10 px-3 py-3">
            <select
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-[color:var(--sidebar-text)] focus:outline-none"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id} className="bg-[#1B2E4B]">
                  {course.title}
                </option>
              ))}
            </select>
          </div>

          {/* System suggestion banner */}
          {recommendation?.recommendation_type === "join_existing" && recommendation.suggested_group && (
            <div className="border-b border-white/10 px-3 py-3">
              <div className="rounded-xl bg-[color:var(--accent)]/20 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--accent)]">✨ Suggested for you</p>
                <p className="mt-1 text-xs text-white">{recommendation.message}</p>
              </div>
            </div>
          )}

          {/* Group list */}
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="px-4 py-8 text-center text-sm text-[color:var(--sidebar-muted)]">Loading…</p>}
            {groupsLoading && !loading && (
              <p className="px-4 py-4 text-center text-xs text-[color:var(--sidebar-muted)]">Refreshing…</p>
            )}
            {!loading && !groupsLoading && groups.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Hash size={28} className="mx-auto mb-2 text-[color:var(--sidebar-muted)]" />
                <p className="text-sm text-[color:var(--sidebar-muted)]">No groups yet</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-3 text-xs font-semibold text-[color:var(--accent)] hover:underline"
                >
                  Create one
                </button>
              </div>
            )}
            {groups.map((group) => {
              const active = group.id === selectedGroupId;
              return (
                <button
                  key={group.id}
                  onClick={() => { setSelectedGroupId(group.id); setShowCreateForm(false); }}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left transition ${
                    active ? "bg-white/15" : "hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--green)] text-sm font-bold text-white">
                    {group.topic_focus.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-semibold text-white">{group.topic_focus}</p>
                      {group.joined && (
                        <CheckCircle2 size={13} className="ml-1 shrink-0 text-[color:var(--accent)]" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Users size={11} className="text-[color:var(--sidebar-muted)]" />
                      <p className="text-[11px] text-[color:var(--sidebar-text)]">
                        {group.member_count} / {group.max_size} members
                      </p>
                      <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        group.status === "active"
                          ? "bg-[color:var(--accent)]/20 text-[color:var(--accent)]"
                          : "bg-white/10 text-[color:var(--sidebar-muted)]"
                      }`}>
                        {group.status}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        {showCreateForm ? (
          /* Create group form */
          <div className="flex flex-1 flex-col overflow-y-auto rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--background)] shadow-xl">
            <div className="border-b border-[color:var(--border)] bg-white px-6 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--navy)] text-white">
                  <Plus size={18} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[color:var(--foreground)]">Create Study Group</p>
                  <p className="text-xs text-[color:var(--ink-muted)]">Set up a new group for {courses.find((c) => c.id === selectedCourseId)?.title ?? "your course"}</p>
                </div>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-full p-2 text-[color:var(--ink-muted)] hover:bg-[color:var(--background-alt)] transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-lg px-6 py-8">
              {recommendation?.recommendation_type === "create_suggested" && (
                <div className="mb-6 rounded-2xl bg-[color:var(--accent-soft)] p-4">
                  <p className="text-sm font-semibold text-[color:var(--accent-strong)]">✨ System suggestion</p>
                  <p className="mt-1 text-sm text-[color:var(--foreground)]">{recommendation.message}</p>
                  {recommendation.complementary_signals.map((s) => (
                    <p key={s} className="mt-1 text-xs text-[color:var(--ink-muted)]">{s}</p>
                  ))}
                </div>
              )}

              <div className="space-y-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[color:var(--foreground)]">Topic Focus</span>
                  <input
                    className="field-shell"
                    value={topicFocus}
                    onChange={(e) => setTopicFocus(e.target.value)}
                    placeholder="e.g. Calculus I Midterm Prep"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[color:var(--foreground)]">Starts</span>
                    <input
                      type="datetime-local"
                      className="field-shell"
                      value={scheduledStart}
                      onChange={(e) => setScheduledStart(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[color:var(--foreground)]">Ends</span>
                    <input
                      type="datetime-local"
                      className="field-shell"
                      value={scheduledEnd}
                      onChange={(e) => setScheduledEnd(e.target.value)}
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[color:var(--foreground)]">Target Size (5–15)</span>
                  <input
                    type="number"
                    min={5}
                    max={15}
                    className="field-shell"
                    value={targetSize}
                    onChange={(e) => setTargetSize(e.target.value)}
                  />
                </label>

                {statusMessage && (
                  <p className="rounded-xl bg-[color:var(--accent-soft)] px-4 py-3 text-sm text-[color:var(--accent-strong)]">
                    {statusMessage}
                  </p>
                )}

                <button
                  onClick={async () => { await handleCreateGroup(); setShowCreateForm(false); }}
                  disabled={saving || !selectedCourseId || !topicFocus || !scheduledStart || !scheduledEnd}
                  className="primary-button w-full px-4 py-3 text-sm disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create Group"}
                </button>
              </div>
            </div>
          </div>
        ) : selectedGroup ? (
          /* Group detail */
          <div className="flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--background)] shadow-xl">
            {/* Group header */}
            <div className="border-b border-[color:var(--border)] bg-white px-6 py-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[color:var(--green)] text-base font-bold text-white">
                  {selectedGroup.topic_focus.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[color:var(--foreground)]">{selectedGroup.topic_focus}</p>
                    {selectedGroup.system_suggested && (
                      <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent-strong)]">
                        AI Suggested
                      </span>
                    )}
                    {selectedGroup.joined && (
                      <span className="rounded-full bg-[color:var(--navy-tint)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--navy)]">
                        Joined
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--ink-muted)]">
                    {selectedGroup.course_title} · {selectedGroup.member_count} members · {selectedGroup.open_slots} open slots
                  </p>
                </div>
                <div className="flex gap-2">
                  {!selectedGroup.joined && selectedGroup.open_slots > 0 && (
                    <button
                      onClick={() => handleJoinGroup(selectedGroup.id)}
                      className="primary-button px-4 py-2 text-sm hover:-translate-y-0.5"
                    >
                      Join Group
                    </button>
                  )}
                  {selectedGroup.joined && (
                    <button
                      onClick={() => handleMarkAttendance(selectedGroup.id)}
                      className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:-translate-y-0.5 transition"
                    >
                      ✓ Mark Attendance
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {statusMessage && (
                <div className="mb-4 rounded-2xl bg-[color:var(--accent-soft)] px-4 py-3 text-sm text-[color:var(--accent-strong)]">
                  {statusMessage}
                </div>
              )}

              {/* Schedule */}
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <div className="page-card p-4">
                  <p className="section-kicker mb-1">Starts</p>
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    {new Date(selectedGroup.scheduled_start).toLocaleString()}
                  </p>
                </div>
                <div className="page-card p-4">
                  <p className="section-kicker mb-1">Ends</p>
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    {new Date(selectedGroup.scheduled_end).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Members */}
              <h3 className="mb-3 text-sm font-bold text-[color:var(--foreground)]">
                Members ({selectedGroup.member_count})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedGroup.members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-white p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy-tint)] text-sm font-bold text-[color:var(--navy)]">
                      {(member.full_name ?? member.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                        {member.full_name ?? member.email}
                      </p>
                      <p className="text-xs text-[color:var(--ink-muted)]">
                        {member.attendance_count} attendances · last active {new Date(member.last_active_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      member.status === "active"
                        ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                        : "bg-[color:var(--background-alt)] text-[color:var(--ink-muted)]"
                    }`}>
                      {member.status}
                    </span>
                  </div>
                ))}
                {selectedGroup.members.length === 0 && (
                  <p className="col-span-2 text-sm text-[color:var(--ink-muted)]">No members yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--background)] shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--navy-tint)]">
                <Hash size={36} className="text-[color:var(--navy)]" />
              </div>
              <p className="text-lg font-semibold text-[color:var(--foreground)]">Select a study group</p>
              <p className="mt-1 text-sm text-[color:var(--ink-muted)]">or create a new one with the + button</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
