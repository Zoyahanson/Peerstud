"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "../../../../../components/sidebar";
import { authedFetch, hasAuthToken } from "../../../../../lib/api";
import { buildDefaultVirtualRoomUrl } from "../../../../../lib/virtual-room";

type SessionItem = {
  id: string;
  course_id: string;
  classroom_name: string;
  topic_focus: string;
  start_time: string;
  meet_link: string | null;
};

export default function VirtualRoomPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [sessionItem, setSessionItem] = useState<SessionItem | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRoom() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        const sessions = await authedFetch<SessionItem[]>("/sessions");
        if (cancelled) {
          return;
        }
        const matched = sessions.find((item) => item.id === sessionId) ?? null;
        if (!matched) {
          setStatusMessage("Session not found.");
        }
        setSessionItem(matched);
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load room.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRoom();

    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  const roomUrl = useMemo(() => {
    if (!sessionItem) {
      return "";
    }
    return (
      sessionItem.meet_link ||
      buildDefaultVirtualRoomUrl({
        courseId: sessionItem.course_id,
        classroomName: sessionItem.classroom_name,
        topicFocus: sessionItem.topic_focus,
        startTime: sessionItem.start_time,
      })
    );
  }, [sessionItem]);

  return (
    <div className="page-shell">
      <Sidebar />
      <main className="page-main">
        <div className="page-content">
          <section className="page-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="page-title">Session Room</h1>
              <p className="page-subtitle">Join and collaborate without leaving PeerStud.</p>
            </div>
            <Link href="/dashboard/virtual-sessions" className="secondary-button px-4 py-2 text-sm">
              Back To Sessions
            </Link>
          </section>

          {loading && <p className="text-sm text-[color:var(--ink-muted)]">Loading room...</p>}
          {statusMessage && <p className="text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          {!loading && sessionItem && roomUrl && (
            <section className="page-card overflow-hidden p-3 sm:p-4">
              <iframe
                title={`Virtual room for ${sessionItem.classroom_name}`}
                src={roomUrl}
                className="h-[72vh] w-full rounded-[1.2rem] border border-[color:var(--border)] bg-white"
                allow="camera; microphone; fullscreen; display-capture"
              />
              <div className="mt-3 flex justify-end">
                <a
                  href={roomUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="secondary-button px-4 py-2 text-sm"
                >
                  Open In New Tab
                </a>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
