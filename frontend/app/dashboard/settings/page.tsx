"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarDays } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

type UserSettings = {
  email_alerts: boolean;
  desktop_reminders: boolean;
  reminder_minutes_before: number;
};

export default function SettingsPage() {
  const router = useRouter();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [desktopReminders, setDesktopReminders] = useState(true);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    authedFetch<UserSettings>("/users/me/settings")
      .then((settings) => {
        setEmailAlerts(settings.email_alerts);
        setDesktopReminders(settings.desktop_reminders);
        setReminderMinutesBefore(settings.reminder_minutes_before);
      })
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load settings.");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave() {
    try {
      setSaving(true);
      setStatusMessage("");
      const updated = await authedFetch<UserSettings>("/users/me/settings", {
        method: "PUT",
        body: JSON.stringify({
          email_alerts: emailAlerts,
          adaptive_layout: false,
          desktop_reminders: desktopReminders,
          reminder_minutes_before: reminderMinutesBefore,
        }),
      });
      setEmailAlerts(updated.email_alerts);
      setDesktopReminders(updated.desktop_reminders);
      setReminderMinutesBefore(updated.reminder_minutes_before);
      setStatusMessage("Settings saved.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          <div className="page-header max-w-3xl">
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Preferences, reminders, and calendar sync.</p>
          </div>

          {loading && <p className="mb-4 text-sm text-[color:var(--ink-muted)]">Loading settings...</p>}
          {statusMessage && <p className="mb-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          <section className="asym-grid items-start">
            <div className="space-y-5">
              <article className="glass-panel-strong rounded-[2rem] p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-[color:var(--accent-soft)] p-3 text-[color:var(--accent-strong)]">
                    <CalendarDays size={22} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-[color:var(--foreground)]">Calendar & Session Links</h2>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]">
                      PeerStud uses Jitsi room links for live sessions and exports standard .ics invites for calendar apps.
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--ink-muted)]">
                      Use the session list to add any session to Apple Calendar, Outlook, or any other calendar that supports .ics.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <div className="space-y-5">
              <article className="glass-panel-strong rounded-[2rem] p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-[color:var(--accent-soft)] p-3 text-[color:var(--accent-strong)]">
                    <BellRing size={22} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-[color:var(--foreground)]">In-App Scheduling & Reminders</h2>
                    </div>

                    <label className="flex items-center justify-between rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Email alerts for new sessions</span>
                      <input type="checkbox" checked={emailAlerts} onChange={(event) => setEmailAlerts(event.target.checked)} />
                    </label>

                    <label className="flex items-center justify-between rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Desktop/browser reminders</span>
                      <input type="checkbox" checked={desktopReminders} onChange={(event) => setDesktopReminders(event.target.checked)} />
                    </label>

                    <label className="block rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Reminder lead time</span>
                      <select
                        className="field-shell mt-3 text-sm"
                        value={reminderMinutesBefore}
                        onChange={(event) => setReminderMinutesBefore(Number(event.target.value))}
                      >
                        <option value={5}>5 minutes before</option>
                        <option value={10}>10 minutes before</option>
                        <option value={15}>15 minutes before</option>
                        <option value={30}>30 minutes before</option>
                        <option value={60}>1 hour before</option>
                      </select>
                    </label>
                  </div>
                </div>
              </article>

              <button
                onClick={async () => {
                  if (desktopReminders && typeof Notification !== "undefined" && Notification.permission === "default") {
                    await Notification.requestPermission();
                  }
                  await handleSave();
                }}
                disabled={saving}
                className="primary-button w-full px-5 py-3 text-sm hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
