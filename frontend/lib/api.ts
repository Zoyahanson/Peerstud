import { supabase } from "./supabase";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function getBackendBaseUrl(): string {
  // Keep one canonical absolute backend URL for browser and server calls.
  return API_BASE_URL.replace(/\/$/, "");
}

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

export async function hasAuthToken(): Promise<boolean> {
  return Boolean(await getTokenForRequest());
}

async function parseJsonBody<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return null as T;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return null as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

export async function authedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getTokenForRequest();
  if (!token) {
    throw new Error("Missing auth token");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    // Only parse body on error path — avoids double-parsing on the hot path
    let detail = `Request failed (${response.status})`;
    try {
      const err = await parseJsonBody<{ detail?: string; message?: string }>(response);
      detail = err?.detail ?? err?.message ?? detail;
    } catch {
      // ignore parse errors on error responses
    }
    throw new Error(String(detail));
  }

  return parseJsonBody<T>(response);
}

export async function publicFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const err = await parseJsonBody<{ detail?: string; message?: string }>(response);
      detail = err?.detail ?? err?.message ?? detail;
    } catch {
      // ignore
    }
    throw new Error(String(detail));
  }

  return parseJsonBody<T>(response);
}

