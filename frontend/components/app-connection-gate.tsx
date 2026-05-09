"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { publicFetch } from "../lib/api";

type HealthResponse = {
  backend: boolean;
  database: boolean;
  status: string;
};

type ConnectionState = "checking" | "ready" | "offline";

async function checkPlatformHealth(): Promise<HealthResponse> {
  return publicFetch<HealthResponse>("/health", {
    cache: "no-store",
  });
}

export default function AppConnectionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>("checking");
  const [message, setMessage] = useState("Connecting to backend and database...");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setState("checking");
      setMessage("Connecting to backend and database...");
      try {
        const health = await checkPlatformHealth();
        if (cancelled) {
          return;
        }
        if (health.backend && health.database) {
          setState("ready");
          return;
        }
        setState("offline");
        setMessage("Backend is reachable, but the database is not ready yet.");
      } catch {
        if (!cancelled) {
          setState("offline");
          setMessage("Cannot reach the backend right now. Please retry.");
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const subtitle = useMemo(() => {
    if (state === "checking") {
      return "This usually takes a few seconds while services synchronize.";
    }
    return message;
  }, [message, state]);

  if (state === "ready") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_16%_20%,rgba(255,212,138,0.33),transparent_40%),radial-gradient(circle_at_84%_16%,rgba(142,182,255,0.24),transparent_46%),var(--background)] px-6 py-10">
      <div className="mx-auto flex min-h-[75vh] max-w-3xl flex-col items-center justify-center rounded-[2rem] border border-[color:var(--border)] bg-white/80 p-8 text-center shadow-sm backdrop-blur-sm">
        <p className="section-kicker">PeerStud Platform Check</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
          {state === "checking" ? "Warming up your workspace" : "Connection unavailable"}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--ink-muted)]">{subtitle}</p>

        {state === "checking" ? (
          <div className="mt-8 h-2 w-64 overflow-hidden rounded-full bg-[color:var(--background-alt)]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[color:var(--accent)]" />
          </div>
        ) : (
          <button
            onClick={() => setAttempt((current) => current + 1)}
            className="primary-button mt-8 px-6 py-3 text-sm"
          >
            Retry Connection
          </button>
        )}
      </div>
    </div>
  );
}
