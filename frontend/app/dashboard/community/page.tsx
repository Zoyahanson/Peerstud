"use client";

import { useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import ChatPage from "../chat/page";
import StudyGroupsPage from "../study-groups/page";

export default function CommunityPage() {
  const [tab, setTab] = useState<"chat" | "groups">("chat");

  return (
    <div className="relative">
      <div className="pointer-events-none fixed left-0 right-0 top-16 z-30 flex justify-center px-4">
        <div className="pointer-events-auto inline-flex gap-1 rounded-2xl border border-[color:var(--border)] bg-white/90 p-1 shadow-lg backdrop-blur">
          <button
            onClick={() => setTab("chat")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === "chat"
                ? "bg-[color:var(--navy)] text-white"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            <MessageCircle size={15} />
            Chat
          </button>
          <button
            onClick={() => setTab("groups")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === "groups"
                ? "bg-[color:var(--green)] text-white"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            <Users size={15} />
            Study Groups
          </button>
        </div>
      </div>

      {tab === "chat" ? <ChatPage /> : <StudyGroupsPage />}
    </div>
  );
}
