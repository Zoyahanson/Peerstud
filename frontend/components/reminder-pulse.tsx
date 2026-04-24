"use client";

import { useEffect } from "react";
import { authedFetch, getToken } from "../lib/api";

type UserSettings = {
  desktop_reminders: boolean;
  reminder_minutes_before: number;
};

type SessionItem = {
  id: string;
  topic_focus: string;
  classroom_name: string;
  start_time: string;
  joined: boolean;
  meet_link: string | null;
};

const NOTIFIED_REMINDERS_KEY = "peerstud-sent-reminders";

function readSentReminderMap(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(NOTIFIED_REMINDERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSentReminderMap(value: Record<string, string>) {
  window.localStorage.setItem(NOTIFIED_REMINDERS_KEY, JSON.stringify(value));
}

export default function ReminderPulse() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return;
    }

    const token = getToken();
    if (!token || Notification.permission !== "granted") {
      return;
    }

    let cancelled = false;

    async function loadReminderCandidates() {
      try {
        const [settings, sessions] = await Promise.all([
          authedFetch<UserSettings>("/users/me/settings"),
          authedFetch<SessionItem[]>("/sessions"),
        ]);
        if (cancelled || !settings.desktop_reminders) {
          return;
        }

        const now = Date.now();
        const threshold = now + settings.reminder_minutes_before * 60 * 1000;
        const sentMap = readSentReminderMap();
        let changed = false;

        for (const session of sessions) {
          if (!session.joined) {
            continue;
          }

          const sessionTime = new Date(session.start_time).getTime();
          const reminderFingerprint = `${session.start_time}:${settings.reminder_minutes_before}`;
          if (sessionTime <= now || sessionTime > threshold || sentMap[session.id] === reminderFingerprint) {
            continue;
          }

          new Notification(`Upcoming: ${session.topic_focus}`, {
            body: `${session.classroom_name} starts at ${new Date(session.start_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}${session.meet_link ? " • Meet link ready" : ""}`,
            tag: `peerstud-${session.id}`,
          });
          sentMap[session.id] = reminderFingerprint;
          changed = true;
        }

        if (changed) {
          writeSentReminderMap(sentMap);
        }
      } catch {
        // Ignore reminder failures so the app shell still loads cleanly.
      }
    }

    void loadReminderCandidates();
    const intervalId = window.setInterval(() => {
      void loadReminderCandidates();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
