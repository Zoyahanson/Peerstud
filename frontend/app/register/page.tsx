"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAllowedDomains, isAllowedSchoolEmail, loadSchoolEmailPolicy } from "../../lib/auth-policy";
import { API_BASE_URL } from "../../lib/api";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

export default function Register() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"details" | "otp">("details");

  useEffect(() => {
    loadSchoolEmailPolicy().then((policy) => setAllowedDomains(policy.allowed_domains));
  }, []);

  async function redirectAfterAuth(accessToken: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/me/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const s = (await res.json()) as { onboarding_completed?: boolean };
        router.push(s.onboarding_completed ? "/dashboard" : "/onboarding");
        return;
      }
    } catch {
      // fall through
    }
    router.push("/onboarding");
  }

  const handleSendCode = () => {
    setError("");
    setMessage("");

    if (!isAllowedSchoolEmail(email, allowedDomains)) {
      setError(`Use your organization email (${formatAllowedDomains(allowedDomains)}).`);
      return;
    }
    if (password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setStage("otp");
    setMessage(`A 6-digit verification code has been sent to ${email.trim().toLowerCase()}.`);
  };

  const handleVerifyCode = async () => {
    setError("");
    setMessage("");

    if (!otp.trim()) {
      setError("Enter a code to continue.");
      return;
    }
    if (!supabase || !isSupabaseConfigured()) {
      setError("Auth is not configured.");
      return;
    }

    try {
      setSubmitting(true);

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: name.trim() ? { full_name: name.trim() } : undefined,
        },
      });

      if (signUpError) {
        setError(signUpError.message || "Account creation failed.");
        return;
      }

      if (data.session?.access_token) {
        await redirectAfterAuth(data.session.access_token);
        return;
      }

      // Supabase requires email confirmation — sign in directly
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError || !signInData.session) {
        setMessage("Account created. Please sign in.");
        setTimeout(() => router.push("/login"), 1200);
        return;
      }

      await redirectAfterAuth(signInData.session.access_token);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-main flex items-center justify-center px-6">
      <div className="page-card w-full max-w-md p-10">
        <h2 className="text-3xl font-bold mb-3 text-center text-gray-950">Create Account</h2>
        <p className="text-sm text-gray-700 mb-5 text-center">Organization email required.</p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {message && <p className="text-green-700 text-sm mb-4">{message}</p>}

        {stage === "details" ? (
          <>
            <input
              type="text"
              placeholder="Full Name"
              className="field-shell mb-4"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="email"
              placeholder="Organization email"
              className="field-shell mb-4"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password (min 8 characters)"
              className="field-shell mb-6"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              onClick={handleSendCode}
              className="primary-button w-full p-3 transition"
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-600 mb-4">
              Enter the 6-digit code sent to <strong>{email.trim().toLowerCase()}</strong> to verify your account.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 123456"
              className="field-shell mb-4 text-center text-2xl tracking-widest"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <button
              onClick={handleVerifyCode}
              disabled={submitting || !otp.trim()}
              className="primary-button w-full p-3 transition disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Verify & Create Account"}
            </button>
            <button
              onClick={() => setStage("details")}
              disabled={submitting}
              className="mt-3 w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--ink-muted)] transition hover:bg-[color:var(--background-alt)] disabled:opacity-60"
            >
              Back
            </button>
          </>
        )}

        <p className="text-xs text-gray-500 mt-4">
          Supported domains: {formatAllowedDomains(allowedDomains)}
        </p>
      </div>
    </main>
  );
}
