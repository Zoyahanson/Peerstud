"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  const handleLogin = async () => {
    setError("");

    // Local demo fallback to keep UI testable even when backend auth is unavailable.
    if (email === DEMO_USER.email && password === DEMO_USER.password) {
      localStorage.setItem("token", DEMO_USER.token);
      window.dispatchEvent(new Event("auth-changed"));
      router.push("/dashboard");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }

      // Save token
      localStorage.setItem("token", data.token);
      window.dispatchEvent(new Event("auth-changed"));

      // Redirect
      router.push("/dashboard");

    } catch (err) {
      setError("Server error");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-lg w-96">
        <h2 className="text-3xl font-bold mb-6 text-center">Welcome Back</h2>

        <p className="text-xs text-gray-500 mb-4">
          Demo login: {DEMO_USER.email} / {DEMO_USER.password}
        </p>

        {error && (
          <p className="text-red-500 text-sm mb-4">{error}</p>
        )}

        <input
          type="email"
          placeholder="Email"
          className="w-full mb-4 p-3 border rounded-lg"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full mb-6 p-3 border rounded-lg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition"
        >
          Sign In
        </button>
      </div>
    </main>
  );
}
