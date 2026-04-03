"use client";

import { useEffect } from "react";

export default function GoogleCalendarCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error") || params.get("error_description");

    if (window.opener) {
      window.opener.postMessage(
        {
          type: "google-calendar-oauth",
          code,
          state,
          error,
        },
        "*",
      );
    }

    window.setTimeout(() => {
      window.close();
    }, 150);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <p className="text-sm text-gray-700">Completing Google Calendar link...</p>
    </main>
  );
}
