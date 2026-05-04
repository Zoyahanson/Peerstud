"use client";

import { useState } from "react";
import ChatPage from "../chat/page";
import StudyGroupsPage from "../study-groups/page";

export default function CommunityPage() {
  const [tab, setTab] = useState<"chat" | "groups">("chat");

  if (tab === "groups") {
    return (
      <div>
        <StudyGroupsPage onSwitchToChat={() => setTab("chat")} />
      </div>
    );
  }

  return <ChatPage tab={tab} onTabChange={setTab} />;
}
