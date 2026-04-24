"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarDays, MonitorSmartphone } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

type UserSettings = {
  email_alerts: boolean;
  calendar_auto_meet: boolean;
  desktop_reminders: boolean;
  reminder_minutes_before: number;
};

type CalendarStatus = {
  linked: boolean;
  google_email: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [calendarAutoMeet, setCalendarAutoMeet] = useState(true);
  const [desktopReminders, setDesktopReminders] = useState(true);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(30);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({ linked: false, google_email: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyLinking, setBusyLinking] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const waitForOAuthMessage = useCallback(() => {
    return new Promise<{ code: string | null; state: string | null; error: string | null }>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error("OAuth flow timed out.")), 180000);

      function onMessage(event: MessageEvent) {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (!event.data || event.data.type !== "google-calendar-oauth") {
          return;
        }

        window.clearTimeout(timeoutId);
        window.removeEventListener("message", onMessage);
        resolve({
          code: event.data.code ?? null,
          state: event.data.state ?? null,
          error: event.data.error ?? null,
        });
      }

      window.addEventListener("message", onMessage);
    });
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    Promise.all([
      authedFetch<UserSettings>("/users/me/settings"),
      authedFetch<CalendarStatus>("/users/me/google-calendar/status"),
    ])
      .then(([settings, googleCalendar]) => {
        setEmailAlerts(settings.email_alerts);
        setCalendarAutoMeet(settings.calendar_auto_meet);
        setDesktopReminders(settings.desktop_reminders);
        setReminderMinutesBefore(settings.reminder_minutes_before);
        setCalendarStatus(googleCalendar);
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
          calendar_auto_meet: calendarAutoMeet,
          adaptive_layout: false,
          desktop_reminders: desktopReminders,
          reminder_minutes_before: reminderMinutesBefore,
        }),
      });
      setEmailAlerts(updated.email_alerts);
      setCalendarAutoMeet(updated.calendar_auto_meet);
      setDesktopReminders(updated.desktop_reminders);
      setReminderMinutesBefore(updated.reminder_minutes_before);
      setStatusMessage("Settings saved.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkCalendar() {
    try {
      setBusyLinking(true);
      setStatusMessage("");
      const start = await authedFetch<{ authorization_url: string }>("/users/me/google-calendar/link/start", {
        method: "POST",
      });
      const authWindow = window.open(start.authorization_url, "google-calendar-link", "width=520,height=720");
      if (!authWindow) {
        throw new Error("Failed to open OAuth window. Allow pop-ups and try again.");
      }

      const oauthPayload = await waitForOAuthMessage();
      if (oauthPayload.error || !oauthPayload.code || !oauthPayload.state) {
        throw new Error(oauthPayload.error || "OAuth callback did not return a valid code.");
      }

      const linked = await authedFetch<CalendarStatus>("/users/me/google-calendar/link/complete", {
        method: "POST",
        body: JSON.stringify({ code: oauthPayload.code, state: oauthPayload.state }),
      });
      setCalendarStatus(linked);
      setStatusMessage("Google Calendar and Meet linking completed.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to link Google Calendar.");
    } finally {
      setBusyLinking(false);
    }
  }

  async function handleUnlinkCalendar() {
    try {
      setBusyLinking(true);
      setStatusMessage("");
      const unlinked = await authedFetch<CalendarStatus>("/users/me/google-calendar/link", { method: "DELETE" });
      setCalendarStatus(unlinked);
      setStatusMessage("Google Calendar disconnected.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to unlink Google Calendar.");
    } finally {
      setBusyLinking(false);
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
                    <h2 className="text-xl font-semibold text-[color:var(--foreground)]">Google Calendar and Meet</h2>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]">{calendarStatus.linked ? `Connected as ${calendarStatus.google_email ?? "your Google account"}.` : "Connect Google Calendar."}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleLinkCalendar}
                        disabled={busyLinking}
                        className="primary-button px-5 py-3 text-sm hover:-translate-y-0.5 disabled:opacity-60"
                      >
                        {busyLinking ? "Linking..." : "Link Google Account"}
                      </button>
                      <button
                        onClick={handleUnlinkCalendar}
                        disabled={busyLinking || !calendarStatus.linked}
                        className="rounded-full border border-[color:var(--border)] bg-white/80 px-5 py-3 text-sm font-semibold text-[color:var(--foreground)] hover:-translate-y-0.5 disabled:opacity-60"
                      >
                        Unlink
                      </button>
                    </div>
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

              <article className="glass-panel rounded-[2rem] p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-[rgba(255,210,137,0.45)] p-3 text-[color:var(--accent-strong)]">
                    <MonitorSmartphone size={22} />
                  </div>
                  <div className="w-full space-y-4">
                    <label className="flex items-center justify-between rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Auto-generate Meet links</span>
                      <input
                        type="checkbox"
                        checked={calendarAutoMeet}
                        onChange={(event) => setCalendarAutoMeet(event.target.checked)}
                      />
                    </label>

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
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
