"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAllowedDomains, isAllowedSchoolEmail, loadSchoolEmailPolicy } from "../../lib/auth-policy";
import {
  fetchSignInMethodsForEmail,
  firebaseAuth,
  isFirebaseConfigured,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "../../lib/firebase";

const DEMO_USER = {
  email: "demo@peerstud.test",
  password: "demo1234",
  token: "demo-token",
};

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

    // Local demo fallback to keep UI testable even when backend auth is unavailable.
    if (email === DEMO_USER.email && password === DEMO_USER.password) {
      localStorage.setItem("token", DEMO_USER.token);
      window.dispatchEvent(new Event("auth-changed"));
      router.push("/dashboard");
      return;
    }

    if (!isAllowedSchoolEmail(email, allowedDomains)) {
      setError(`Use your verified school email address. Allowed domains: ${formatAllowedDomains(allowedDomains)}.`);
      return;
    }

    if (!firebaseAuth || !isFirebaseConfigured()) {
      setError("Firebase auth is not configured yet. API keys are still required for real sign in.");
      return;
    }

    try {
      setSubmitting(true);
      const methods = await fetchSignInMethodsForEmail(firebaseAuth, email.trim().toLowerCase());
      if (!methods.length) {
        setError("No account exists for this school email. Register first.");
        return;
      }

      const credentials = await signInWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password);
      if (!credentials.user.emailVerified) {
        await sendEmailVerification(credentials.user);
        await signOut(firebaseAuth);
        setError("Verify your school email before signing in. A new verification email has been sent.");
        return;
      }

      const token = await credentials.user.getIdToken(true);
      localStorage.setItem("token", token);
      window.dispatchEvent(new Event("auth-changed"));
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

        <p className="text-xs text-[color:var(--ink-subtle)] mb-4">
          Demo login: {DEMO_USER.email} / {DEMO_USER.password}
        </p>

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
