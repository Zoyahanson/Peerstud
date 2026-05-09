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

  const handleSendOtp = async () => {
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
      setError("Supabase auth is not configured yet. Add your Supabase URL and anon key.");
      return;
    }

    try {
      setSubmitting(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          data: name.trim() ? { full_name: name.trim() } : undefined,
        },
      });
      if (error) {
        setError(error.message || "Could not send verification code.");
        return;
      }
      setVerificationStage("otp");
      setMessage("A 6-digit OTP was sent to your organization email. Enter it to verify your account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    setMessage("");

    if (!otp.trim()) {
      setError("Enter the OTP code from your email.");
      return;
    }

    if (!supabase || !isSupabaseConfigured()) {
      setError("Supabase auth is not configured yet. Add your Supabase URL and anon key.");
      return;
    }

    try {
      setSubmitting(true);
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: "email",
      });
      if (error) {
        setError(error.message || "Invalid OTP code.");
        return;
      }

      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) {
        setError(passwordError.message || "Verified email, but failed to set password.");
        return;
      }

      if (data.session?.access_token) {
        const settingsResponse = await fetch(`${API_BASE_URL}/users/me/settings`, {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        });

        if (settingsResponse.ok) {
          const settings = (await settingsResponse.json()) as { onboarding_completed?: boolean };
          router.push(settings.onboarding_completed ? "/dashboard" : "/onboarding");
          return;
        }

        router.push("/onboarding");
        return;
      }

      setMessage("Email verified. You can now sign in.");
      window.setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-main flex items-center justify-center px-6">
      <div className="page-card w-full max-w-md p-10">
        <h2 className="text-3xl font-bold mb-3 text-center text-gray-950">Create Account</h2>

        <p className="text-sm text-gray-700 mb-5 text-center">Organization email registration with OTP verification.</p>

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}
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
              placeholder="Password"
              className="field-shell mb-6"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={handleSendOtp}
              disabled={submitting}
              className="primary-button w-full p-3 transition disabled:opacity-60"
            >
              {submitting ? "Sending OTP..." : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-700 mb-4">
              Enter the OTP sent to {email.trim().toLowerCase()} to verify your organization account.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter OTP code"
              className="field-shell mb-4"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <button
              onClick={handleVerifyOtp}
              disabled={submitting}
              className="primary-button w-full p-3 transition disabled:opacity-60"
            >
              {submitting ? "Verifying OTP..." : "Verify OTP"}
            </button>
            <button
              onClick={handleSendOtp}
              disabled={submitting}
              className="mt-3 w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--ink-muted)] transition hover:bg-[color:var(--background-alt)] disabled:opacity-60"
            >
              Resend OTP
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
