"use client";

import { useState } from "react";
import Sidebar from "../../../components/sidebar";

export default function SettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [calendarAutoMeet, setCalendarAutoMeet] = useState(true);

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <main className="flex-1 p-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

        <section className="bg-white p-6 rounded-2xl shadow border border-gray-100 space-y-4 max-w-2xl">
          <label className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
            <span className="text-sm text-gray-700">Email alerts for new sessions</span>
            <input type="checkbox" checked={emailAlerts} onChange={(event) => setEmailAlerts(event.target.checked)} />
          </label>

          <label className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
            <span className="text-sm text-gray-700">Auto-generate Meet links</span>
            <input
              type="checkbox"
              checked={calendarAutoMeet}
              onChange={(event) => setCalendarAutoMeet(event.target.checked)}
            />
          </label>
        </section>
      </main>
    </div>
  );
}
