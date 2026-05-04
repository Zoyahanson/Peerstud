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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    // Only parse body on error path — avoids double-parsing on the hot path
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

export async function publicFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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

