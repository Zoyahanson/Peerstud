import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ACCESS_TOKEN_STORAGE_KEY = "token";

function syncStoredAccessToken(accessToken: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }

  window.dispatchEvent(new Event("auth-changed"));
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

if (supabase && typeof window !== "undefined") {
  void supabase.auth.getSession().then(({ data }) => {
    syncStoredAccessToken(data.session?.access_token ?? null);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    syncStoredAccessToken(session?.access_token ?? null);
  });
}
