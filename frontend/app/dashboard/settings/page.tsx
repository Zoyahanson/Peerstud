"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, MonitorSmartphone, SlidersHorizontal } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, hasAuthToken } from "../../../lib/api";

type UserSettings = {
  email_alerts: boolean;
  adaptive_layout: boolean;
  desktop_reminders: boolean;
  reminder_minutes_before: number;
  weekly_progress_digest: boolean;
  focus_mode_enabled: boolean;
  show_online_status: boolean;
};

export default function SettingsPage() {
  const router = useRouter();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [adaptiveLayout, setAdaptiveLayout] = useState(true);
  const [desktopReminders, setDesktopReminders] = useState(true);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(30);
  const [weeklyProgressDigest, setWeeklyProgressDigest] = useState(true);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        const settings = await authedFetch<UserSettings>("/users/me/settings");
        if (cancelled) {
          return;
        }
        setEmailAlerts(settings.email_alerts);
        setAdaptiveLayout(settings.adaptive_layout);
        setDesktopReminders(settings.desktop_reminders);
        setReminderMinutesBefore(settings.reminder_minutes_before);
        setWeeklyProgressDigest(settings.weekly_progress_digest);
        setFocusModeEnabled(settings.focus_mode_enabled);
        setShowOnlineStatus(settings.show_online_status);
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load settings.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSave() {
    try {
      setSaving(true);
      setStatusMessage("");
      const updated = await authedFetch<UserSettings>("/users/me/settings", {
        method: "PUT",
        body: JSON.stringify({
          email_alerts: emailAlerts,
          adaptive_layout: adaptiveLayout,
          desktop_reminders: desktopReminders,
          reminder_minutes_before: reminderMinutesBefore,
          weekly_progress_digest: weeklyProgressDigest,
          focus_mode_enabled: focusModeEnabled,
          show_online_status: showOnlineStatus,
        }),
      });
      setEmailAlerts(updated.email_alerts);
      setAdaptiveLayout(updated.adaptive_layout);
      setDesktopReminders(updated.desktop_reminders);
      setReminderMinutesBefore(updated.reminder_minutes_before);
      setWeeklyProgressDigest(updated.weekly_progress_digest);
      setFocusModeEnabled(updated.focus_mode_enabled);
      setShowOnlineStatus(updated.show_online_status);
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
            <p className="page-subtitle">Preferences, reminders, and personalized study controls.</p>
          </div>

          {loading && <p className="mb-4 text-sm text-[color:var(--ink-muted)]">Loading settings...</p>}
          {statusMessage && <p className="mb-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          <section className="asym-grid items-start">
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

                    <label className="flex items-center justify-between rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Weekly progress digest</span>
                      <input type="checkbox" checked={weeklyProgressDigest} onChange={(event) => setWeeklyProgressDigest(event.target.checked)} />
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
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Adaptive layout tuning</span>
                      <input
                        type="checkbox"
                        checked={adaptiveLayout}
                        onChange={(event) => setAdaptiveLayout(event.target.checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Focus mode for low-distraction study</span>
                      <input
                        type="checkbox"
                        checked={focusModeEnabled}
                        onChange={(event) => setFocusModeEnabled(event.target.checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
                      <span className="text-sm font-medium text-[color:var(--foreground)]">Show my online status to peers</span>
                      <input
                        type="checkbox"
                        checked={showOnlineStatus}
                        onChange={(event) => setShowOnlineStatus(event.target.checked)}
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

            <div className="space-y-5">
              <article className="glass-panel rounded-[2rem] p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-[rgba(198,231,255,0.55)] p-3 text-[color:var(--accent-strong)]">
                    <SlidersHorizontal size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-[color:var(--foreground)]">Settings Updated</h2>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]">
                      Google calendar linking has been removed. Session and reminder behavior now runs through in-app controls only.
                    </p>
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
