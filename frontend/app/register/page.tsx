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
  const [verificationStage, setVerificationStage] = useState<"details" | "otp">("details");

  useEffect(() => {
    loadSchoolEmailPolicy().then((policy) => setAllowedDomains(policy.allowed_domains));
  }, []);

  async function redirectAfterAuth(accessToken: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/me/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const settings = (await res.json()) as { onboarding_completed?: boolean };
        router.push(settings.onboarding_completed ? "/dashboard" : "/onboarding");
        return;
      }
    } catch {
      // fall through to default
    }
    router.push("/onboarding");
  }

  const handleSignUp = async () => {
    setError("");
    setMessage("");

    if (!isAllowedSchoolEmail(email, allowedDomains)) {
      setError(
        `Personal email addresses are not accepted. Use your organization email (${formatAllowedDomains(allowedDomains)}).`,
      );
      return;
    }

    if (password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!supabase || !isSupabaseConfigured()) {
      setError("Supabase auth is not configured. Add your Supabase URL and anon key.");
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
        setError(signUpError.message || "Could not create account.");
        return;
      }

      // Supabase auto-confirmed (email confirmation disabled in dashboard)
      if (data.session?.access_token) {
        await redirectAfterAuth(data.session.access_token);
        return;
      }

      // Email confirmation required — OTP was sent
      setVerificationStage("otp");
      setMessage("A 6-digit code was sent to your organization email. Enter it below to verify.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    setMessage("");

    if (!otp.trim()) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    if (!supabase || !isSupabaseConfigured()) {
      setError("Supabase auth is not configured.");
      return;
    }

    try {
      setSubmitting(true);
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: "signup",
      });

      if (verifyError) {
        setError(verifyError.message || "Invalid or expired code. Try resending.");
        return;
      }

      if (data.session?.access_token) {
        await redirectAfterAuth(data.session.access_token);
        return;
      }

      setMessage("Email verified. Redirecting to sign in...");
      window.setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-main flex items-center justify-center px-6">
      <div className="page-card w-full max-w-md p-10">
        <h2 className="text-3xl font-bold mb-3 text-center text-gray-950">Create Account</h2>
        <p className="text-sm text-gray-700 mb-5 text-center">Organization email registration.</p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {message && <p className="text-green-700 text-sm mb-4">{message}</p>}

        {verificationStage === "details" ? (
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
              onClick={handleSignUp}
              disabled={submitting}
              className="primary-button w-full p-3 transition disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-700 mb-4">
              Enter the 6-digit code sent to <strong>{email.trim().toLowerCase()}</strong>.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="field-shell mb-4"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <button
              onClick={handleVerifyOtp}
              disabled={submitting}
              className="primary-button w-full p-3 transition disabled:opacity-60"
            >
              {submitting ? "Verifying..." : "Verify Code"}
            </button>
            <button
              onClick={handleSignUp}
              disabled={submitting}
              className="mt-3 w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--ink-muted)] transition hover:bg-[color:var(--background-alt)] disabled:opacity-60"
            >
              Resend code
            </button>
          </>
        )}

        <p className="text-xs text-gray-700 mt-4">
          Supported school domains: {formatAllowedDomains(allowedDomains)}
        </p>
      </div>
    </main>
  );
}
