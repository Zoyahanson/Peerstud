"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAllowedDomains, isAllowedSchoolEmail, loadSchoolEmailPolicy } from "../../lib/auth-policy";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  firebaseAuth,
  isFirebaseConfigured,
  sendEmailVerification,
  signOut,
  updateProfile,
} from "../../lib/firebase";

export default function Register() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadSchoolEmailPolicy().then((policy) => setAllowedDomains(policy.allowed_domains));
  }, []);

  const handleRegister = async () => {
    setError("");
    setMessage("");

    if (!isAllowedSchoolEmail(email, allowedDomains)) {
      setError(`Register with a supported school email. Allowed domains: ${formatAllowedDomains(allowedDomains)}.`);
      return;
    }

    if (!firebaseAuth || !isFirebaseConfigured()) {
      setError("Firebase auth is not configured yet. Add the frontend API keys to enable registration.");
      return;
    }

    try {
      setSubmitting(true);
      const methods = await fetchSignInMethodsForEmail(firebaseAuth, email.trim().toLowerCase());
      if (methods.length) {
        setError("An account already exists for this school email. Try signing in instead.");
        return;
      }

      const credentials = await createUserWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password);
      if (name.trim()) {
        await updateProfile(credentials.user, { displayName: name.trim() });
      }
      await sendEmailVerification(credentials.user);
      await signOut(firebaseAuth);
      setMessage("Account created. Check your school inbox and verify your email before signing in.");
      window.setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-main flex items-center justify-center px-6">
      <div className="page-card w-full max-w-md p-10">
        <h2 className="text-3xl font-bold mb-3 text-center text-gray-950">Create Account</h2>

        <p className="text-sm text-gray-700 mb-5 text-center">School email registration.</p>

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}
        {message && <p className="text-green-700 text-sm mb-4">{message}</p>}

        <input
          type="text"
          placeholder="Full Name"
          className="field-shell mb-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

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
          onClick={handleRegister}
          disabled={submitting}
          className="primary-button w-full p-3 transition disabled:opacity-60"
        >
          {submitting ? "Creating Account..." : "Register"}
        </button>

        <p className="text-xs text-gray-700 mt-4">
          Supported school domains: {formatAllowedDomains(allowedDomains)}
        </p>
      </div>
    </main>
  );
}
