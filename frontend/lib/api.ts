import { supabase } from "./supabase";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// Module-level token cache — avoids a localStorage read on every single request.
// Cleared when the "auth-changed" event fires (login/logout).
let _cachedToken: string | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("auth-changed", () => {
    _cachedToken = null;
  });
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  if (_cachedToken) return _cachedToken;
  _cachedToken = localStorage.getItem("token");
  return _cachedToken;
}

export function clearToken(): void {
  _cachedToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
  }
}

type DbUser = {
  id: string;
  auth_uid: string;
  email: string;
  full_name: string | null;
};

type JsonObject = Record<string, unknown>;

async function getTokenForRequest(): Promise<string | null> {
  const stored = getToken();
  if (stored) return stored;

  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? null;
  if (accessToken && typeof window !== "undefined") {
    _cachedToken = accessToken;
    window.localStorage.setItem("token", accessToken);
    window.dispatchEvent(new Event("auth-changed"));
  }
  return accessToken;
}

function parsePath(path: string): { pathname: string; searchParams: URLSearchParams } {
  const [pathname, query = ""] = path.split("?", 2);
  return { pathname, searchParams: new URLSearchParams(query) };
}

function parseJsonBody(init: RequestInit): JsonObject {
  if (!init.body || typeof init.body !== "string") {
    return {};
  }

  try {
    return JSON.parse(init.body) as JsonObject;
  } catch {
    return {};
  }
}

async function getCurrentDbUser(): Promise<DbUser> {
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data: authResult, error: authError } = await supabase.auth.getUser();
  if (authError || !authResult.user) {
    throw new Error(authError?.message || "Missing authenticated Supabase user");
  }

  const authUser = authResult.user;
  const normalizedEmail = (authUser.email || "").toLowerCase();
  const fallbackName = (authUser.user_metadata?.full_name as string | undefined) || null;

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id, auth_uid, email, full_name")
    .eq("auth_uid", authUser.id)
    .maybeSingle<DbUser>();

  if (lookupError) {
    throw new Error(lookupError.message || "Failed to load current user");
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      auth_uid: authUser.id,
      email: normalizedEmail,
      full_name: fallbackName,
    })
    .select("id, auth_uid, email, full_name")
    .single<DbUser>();

  if (createError || !created) {
    throw new Error(createError?.message || "Failed to create local user record");
  }

  return created;
}

async function fetchViaBackend<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const err = await response.json();
      detail = err?.detail ?? err?.message ?? detail;
    } catch {
      // ignore parse errors on error responses
    }
    throw new Error(String(detail));
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") return null as T;
  return response.json() as Promise<T>;
}

async function handleSupabaseAuthedRequest<T>(path: string, init: RequestInit): Promise<{ handled: boolean; data?: T }> {
  if (!supabase) {
    return { handled: false };
  }

  const method = (init.method ?? "GET").toUpperCase();
  const { pathname, searchParams } = parsePath(path);
  const dbUser = await getCurrentDbUser();

  if (pathname === "/users/me" && method === "GET") {
    return {
      handled: true,
      data: {
        id: dbUser.id,
        auth_uid: dbUser.auth_uid,
        email: dbUser.email,
        full_name: dbUser.full_name,
      } as T,
    };
  }

  if (pathname === "/users/me/settings" && method === "GET") {
    const { data, error } = await supabase
      .from("user_settings")
      .select("email_alerts, adaptive_layout, desktop_reminders, reminder_minutes_before")
      .eq("user_id", dbUser.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load user settings");
    }

    if (data) {
      return { handled: true, data: data as T };
    }

    const { data: created, error: createError } = await supabase
      .from("user_settings")
      .insert({
        user_id: dbUser.id,
        email_alerts: true,
        adaptive_layout: true,
        desktop_reminders: true,
        reminder_minutes_before: 30,
      })
      .select("email_alerts, adaptive_layout, desktop_reminders, reminder_minutes_before")
      .single();

    if (createError || !created) {
      throw new Error(createError?.message || "Failed to create user settings");
    }
    return { handled: true, data: created as T };
  }

  if (pathname === "/users/me/settings" && method === "PUT") {
    const payload = parseJsonBody(init);
    const upsertPayload = {
      user_id: dbUser.id,
      email_alerts: Boolean(payload.email_alerts ?? true),
      adaptive_layout: Boolean(payload.adaptive_layout ?? true),
      desktop_reminders: Boolean(payload.desktop_reminders ?? true),
      reminder_minutes_before: Number(payload.reminder_minutes_before ?? 30),
    };

    const { data, error } = await supabase
      .from("user_settings")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select("email_alerts, adaptive_layout, desktop_reminders, reminder_minutes_before")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to save user settings");
    }
    return { handled: true, data: data as T };
  }

  if (pathname === "/courses" && method === "GET") {
    const { data: courses, error: courseError } = await supabase
      .from("courses")
      .select("id, title, description, instructor_id")
      .order("title", { ascending: true });
    if (courseError || !courses) {
      throw new Error(courseError?.message || "Failed to load courses");
    }

    const courseIds = courses.map((course) => String(course.id));
    const [sessionCountsResult, resourceCountsResult] = await Promise.all([
      courseIds.length
        ? supabase.from("sessions").select("course_id").in("course_id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? supabase.from("resources").select("course_id").in("course_id", courseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (sessionCountsResult.error) {
      throw new Error(sessionCountsResult.error.message || "Failed to load session counts");
    }
    if (resourceCountsResult.error) {
      throw new Error(resourceCountsResult.error.message || "Failed to load resource counts");
    }

    const sessionCountMap = new Map<string, number>();
    for (const row of sessionCountsResult.data ?? []) {
      const key = String((row as { course_id: string }).course_id);
      sessionCountMap.set(key, (sessionCountMap.get(key) ?? 0) + 1);
    }

    const resourceCountMap = new Map<string, number>();
    for (const row of resourceCountsResult.data ?? []) {
      const key = String((row as { course_id: string }).course_id);
      resourceCountMap.set(key, (resourceCountMap.get(key) ?? 0) + 1);
    }

    const response = courses.map((course) => ({
      ...course,
      sessions_count: sessionCountMap.get(String(course.id)) ?? 0,
      resources_count: resourceCountMap.get(String(course.id)) ?? 0,
    }));

    return { handled: true, data: response as T };
  }

  if (pathname === "/sessions" && method === "GET") {
    let query = supabase
      .from("sessions")
      .select("id, course_id, host_user_id, classroom_name, topic_focus, description, start_time, end_time, meet_link, calendar_event_id, status")
      .order("start_time", { ascending: true });

    const courseId = searchParams.get("course_id");
    if (courseId) {
      query = query.eq("course_id", courseId);
    }

    const { data: sessions, error: sessionError } = await query;
    if (sessionError || !sessions) {
      throw new Error(sessionError?.message || "Failed to load sessions");
    }

    if (!sessions.length) {
      return { handled: true, data: [] as T };
    }

    const sessionIds = sessions.map((session) => String(session.id));
    const courseIds = Array.from(new Set(sessions.map((session) => String(session.course_id))));
    const hostIds = Array.from(new Set(sessions.map((session) => String(session.host_user_id))));

    const [coursesResult, hostsResult, participantsResult, ratingsResult] = await Promise.all([
      supabase.from("courses").select("id, title").in("id", courseIds),
      supabase.from("users").select("id, full_name").in("id", hostIds),
      supabase.from("session_participants").select("session_id, user_id, status, joined_at").in("session_id", sessionIds),
      supabase.from("session_ratings").select("session_id, score").in("session_id", sessionIds),
    ]);

    if (coursesResult.error || hostsResult.error || participantsResult.error || ratingsResult.error) {
      throw new Error(
        coursesResult.error?.message
          || hostsResult.error?.message
          || participantsResult.error?.message
          || ratingsResult.error?.message
          || "Failed to enrich session data",
      );
    }

    const courseTitleMap = new Map<string, string>();
    for (const course of coursesResult.data ?? []) {
      courseTitleMap.set(String(course.id), String((course as { title: string }).title));
    }

    const hostNameMap = new Map<string, string | null>();
    for (const host of hostsResult.data ?? []) {
      hostNameMap.set(String(host.id), (host as { full_name: string | null }).full_name);
    }

    const participantsBySession = new Map<string, Array<{ session_id: string; user_id: string; status: string; joined_at: string }>>();
    for (const participant of participantsResult.data ?? []) {
      const row = participant as { session_id: string; user_id: string; status: string; joined_at: string };
      const key = String(row.session_id);
      participantsBySession.set(key, [...(participantsBySession.get(key) ?? []), row]);
    }

    const ratingBySession = new Map<string, { sum: number; count: number }>();
    for (const rating of ratingsResult.data ?? []) {
      const row = rating as { session_id: string; score: number };
      const key = String(row.session_id);
      const current = ratingBySession.get(key) ?? { sum: 0, count: 0 };
      ratingBySession.set(key, { sum: current.sum + Number(row.score), count: current.count + 1 });
    }

    const participantUserIds = Array.from(
      new Set((participantsResult.data ?? []).map((participant) => String((participant as { user_id: string }).user_id))),
    );
    const participantUsers = participantUserIds.length
      ? await supabase.from("users").select("id, full_name, email").in("id", participantUserIds)
      : { data: [], error: null };

    if (participantUsers.error) {
      throw new Error(participantUsers.error.message || "Failed to load participant users");
    }

    const participantUserMap = new Map<string, { full_name: string | null; email: string }>();
    for (const user of participantUsers.data ?? []) {
      const row = user as { id: string; full_name: string | null; email: string };
      participantUserMap.set(String(row.id), { full_name: row.full_name, email: row.email });
    }

    const response = sessions.map((session) => {
      const sid = String(session.id);
      const participantRows = participantsBySession.get(sid) ?? [];
      const ratings = ratingBySession.get(sid);
      const joined = String(session.host_user_id) === dbUser.id || participantRows.some((participant) => String(participant.user_id) === dbUser.id);

      return {
        id: sid,
        course_id: String(session.course_id),
        course_title: courseTitleMap.get(String(session.course_id)) ?? "Unknown Course",
        host_user_id: String(session.host_user_id),
        host_name: hostNameMap.get(String(session.host_user_id)) ?? null,
        classroom_name: String(session.classroom_name),
        topic_focus: String(session.topic_focus),
        description: session.description as string | null,
        start_time: String(session.start_time),
        end_time: String(session.end_time),
        meet_link: (session.meet_link as string | null) ?? null,
        calendar_event_id: (session.calendar_event_id as string | null) ?? null,
        status: String(session.status ?? "scheduled"),
        participant_count: participantRows.length,
        invited_count: participantRows.length,
        joined,
        average_rating: ratings && ratings.count ? ratings.sum / ratings.count : null,
        participants: participantRows.map((participant) => ({
          user_id: String(participant.user_id),
          full_name: participantUserMap.get(String(participant.user_id))?.full_name ?? null,
          email: participantUserMap.get(String(participant.user_id))?.email ?? "",
          status: String(participant.status),
          joined_at: String(participant.joined_at),
        })),
      };
    });

    return { handled: true, data: response as T };
  }

  if (pathname === "/sessions" && method === "POST") {
    const payload = parseJsonBody(init);
    const { data: inserted, error } = await supabase
      .from("sessions")
      .insert({
        course_id: payload.course_id,
        host_user_id: dbUser.id,
        classroom_name: payload.classroom_name,
        topic_focus: payload.topic_focus,
        description: payload.description ?? null,
        start_time: payload.start_time,
        end_time: payload.end_time,
        meet_link: payload.meet_link ?? null,
        status: "scheduled",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message || "Failed to create session");
    }

    const { data: joinedRow } = await supabase
      .from("session_participants")
      .insert({ session_id: inserted.id, user_id: dbUser.id, status: "confirmed" })
      .select("id")
      .maybeSingle();
    void joinedRow;

    const sessionsResponse = await handleSupabaseAuthedRequest<Array<{ id: string }>>("/sessions", { method: "GET" });
    if (!sessionsResponse.handled || !sessionsResponse.data) {
      throw new Error("Failed to load created session");
    }
    const created = sessionsResponse.data.find((session) => String(session.id) === String(inserted.id));
    if (!created) {
      throw new Error("Created session could not be retrieved");
    }
    return { handled: true, data: created as T };
  }

  if (pathname.match(/^\/sessions\/[^/]+\/join$/) && method === "POST") {
    const sessionId = pathname.split("/")[2];
    const { error } = await supabase
      .from("session_participants")
      .upsert(
        {
          session_id: sessionId,
          user_id: dbUser.id,
          status: "confirmed",
        },
        { onConflict: "session_id,user_id" },
      );

    if (error) {
      throw new Error(error.message || "Failed to join session");
    }

    const sessionsResponse = await handleSupabaseAuthedRequest<Array<{ id: string }>>("/sessions", { method: "GET" });
    if (!sessionsResponse.handled || !sessionsResponse.data) {
      throw new Error("Failed to load joined session");
    }
    const joinedSession = sessionsResponse.data.find((session) => String(session.id) === String(sessionId));
    if (!joinedSession) {
      throw new Error("Joined session could not be retrieved");
    }
    return { handled: true, data: joinedSession as T };
  }

  if (pathname.match(/^\/sessions\/[^/]+\/ratings$/) && method === "POST") {
    const sessionId = pathname.split("/")[2];
    const payload = parseJsonBody(init);
    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("host_user_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !sessionRow) {
      throw new Error(sessionError?.message || "Session not found");
    }

    const { error } = await supabase
      .from("session_ratings")
      .upsert(
        {
          session_id: sessionId,
          rater_user_id: dbUser.id,
          tutor_user_id: sessionRow.host_user_id,
          score: Number(payload.score ?? 0),
          feedback: (payload.feedback as string | null) ?? null,
        },
        { onConflict: "session_id,rater_user_id" },
      );

    if (error) {
      throw new Error(error.message || "Failed to submit rating");
    }

    return { handled: true, data: null as T };
  }

  if (pathname === "/resources" && method === "GET") {
    const { data, error } = await supabase
      .from("resources")
      .select("id, course_id, session_id, title, url, storage_path, file_name, mime_type, file_size_bytes, resource_type, created_at")
      .order("created_at", { ascending: false });

    if (error || !data) {
      throw new Error(error?.message || "Failed to load resources");
    }

    return { handled: true, data: data as T };
  }

  return { handled: false };
}

export async function authedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getTokenForRequest();
  if (!token) {
    throw new Error("Missing auth token");
  }

  try {
    const supabaseResult = await handleSupabaseAuthedRequest<T>(path, init);
    if (supabaseResult.handled) {
      return supabaseResult.data as T;
    }
  } catch {
    // Fall back to backend for endpoints not yet migrated to direct Supabase access.
  }

  return fetchViaBackend<T>(path, init, token);
}

export async function publicFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { pathname } = parsePath(path);
  if (pathname === "/users/auth-policy") {
    const configuredDomains = (process.env.NEXT_PUBLIC_ALLOWED_SCHOOL_EMAIL_DOMAINS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    return {
      allowed_domains: configuredDomains,
      requires_verified_email: true,
    } as T;
  }

  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const err = await response.json();
      detail = err?.detail ?? err?.message ?? detail;
    } catch {
      // ignore
    }
    throw new Error(String(detail));
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") return null as T;
  return response.json() as Promise<T>;
}

