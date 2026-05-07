"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAllowedDomains, isAllowedSchoolEmail, loadSchoolEmailPolicy } from "../../lib/auth-policy";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadSchoolEmailPolicy()
      .then((policy) => setAllowedDomains(policy.allowed_domains))
      .finally(() => setLoadingPolicy(false));
  }, []);

  const handleLogin = async () => {
    setError("");

    if (!isAllowedSchoolEmail(email, allowedDomains)) {
      setError(
        `Personal email addresses are not accepted. Use your organization email (${formatAllowedDomains(allowedDomains)}).`,
      );
      return;
    }

    if (!supabase || !isSupabaseConfigured()) {
      setError("Supabase auth is not configured yet. Add your Supabase URL and anon key.");
      return;
    }

    try {
      setSubmitting(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setError(error.message || "Sign in failed.");
        return;
      }
      if (!data.session) {
        setError("Sign in did not return an active session.");
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("token", data.session.access_token);
        window.dispatchEvent(new Event("auth-changed"));
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-main flex items-center justify-center px-6">
      <div className="page-card w-full max-w-md p-10">
        <h2 className="text-3xl font-bold mb-3 text-center text-[color:var(--foreground)]">Welcome Back</h2>

        <p className="text-sm text-[color:var(--ink-muted)] mb-5 text-center">School email sign in.</p>

        {loadingPolicy && <p className="text-sm text-[color:var(--ink-muted)] mb-4">Loading school email policy...</p>}

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        <input
          type="email"
          placeholder="School email"
          className="field-shell mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="field-shell mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={submitting}
          className="primary-button w-full p-3 transition disabled:opacity-60"
        >
          {submitting ? "Signing In..." : "Sign In"}
        </button>
      </div>
    </main>
  );
}
