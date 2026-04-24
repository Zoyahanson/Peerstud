"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, MessageCircle, Plus, Search, Send } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

const CHAT_POLL_INTERVAL_MS = 3000;

type ChatContact = {
  user_id: string;
  full_name: string | null;
  email: string;
  credibility_score: number;
  ratings_count: number;
};

type ChatConversation = {
  conversation_id: string;
  peer: ChatContact;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_full_name: string | null;
  content: string;
  created_at: string;
};

export default function ChatPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedPeerUserId, setSelectedPeerUserId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.conversation_id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const refreshConversations = useCallback(async () => {
    const nextConversations = await authedFetch<ChatConversation[]>("/chat/conversations");
    setConversations(nextConversations);
    setSelectedConversationId((current) => {
      if (!current && nextConversations[0]?.conversation_id) {
        return nextConversations[0].conversation_id;
      }
      if (current && nextConversations.some((item) => item.conversation_id === current)) {
        return current;
      }
      return nextConversations[0]?.conversation_id ?? "";
    });
  }, []);

  const refreshMessages = useCallback(async (conversationId: string) => {
    const nextMessages = await authedFetch<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`);
    setMessages(nextMessages);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    Promise.all([
      authedFetch<ChatContact[]>("/chat/contacts"),
      authedFetch<ChatConversation[]>("/chat/conversations"),
    ])
      .then(([contactResponse, conversationResponse]) => {
        setContacts(contactResponse);
        setConversations(conversationResponse);
        setSelectedPeerUserId(contactResponse[0]?.user_id ?? "");
        if (conversationResponse[0]?.conversation_id) {
          setSelectedConversationId(conversationResponse[0].conversation_id);
        }
      })
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load chat.");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    refreshMessages(selectedConversationId)
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load messages.");
      });
  }, [refreshMessages, selectedConversationId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      refreshConversations().catch(() => undefined);
    }, CHAT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      refreshMessages(selectedConversationId).catch(() => undefined);
    }, CHAT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshMessages, selectedConversationId]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages]);

  async function handleStartConversation() {
    if (!selectedPeerUserId) {
      setStatusMessage("Select a contact first.");
      return;
    }

    try {
      setBusy(true);
      setStatusMessage("");
      const conversation = await authedFetch<ChatConversation>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ peer_user_id: selectedPeerUserId }),
      });
      await refreshConversations();
      setSelectedConversationId(conversation.conversation_id);
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to open conversation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedConversationId) {
      setStatusMessage("Open a conversation first.");
      return;
    }
    if (!draft.trim()) {
      setStatusMessage("Type a message before sending.");
      return;
    }

    try {
      setBusy(true);
      setStatusMessage("");
      await authedFetch<ChatMessage>(`/chat/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: draft }),
      });
      setDraft("");
      await refreshMessages(selectedConversationId);
      await refreshConversations();
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <Sidebar />

      {/* Telegram-style full-height messenger */}
      <main className="flex min-h-0 flex-1 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
        {/* Left panel – conversation list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[color:var(--sidebar-bg)] xl:w-80">
          {/* Panel header */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <h2 className="flex-1 text-base font-bold text-white">Messages</h2>
            <button
              title="Edit"
              className="rounded-full bg-white/10 p-2 text-[color:var(--sidebar-text)] hover:bg-white/20 transition"
            >
              <Edit3 size={15} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
              <Search size={13} className="text-[color:var(--sidebar-muted)]" />
              <input
                placeholder="Search conversations"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-[color:var(--sidebar-muted)] focus:outline-none"
              />
            </div>
          </div>

          {/* New conversation */}
          <div className="border-b border-white/10 px-3 pb-3">
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-[color:var(--sidebar-text)] focus:outline-none"
                value={selectedPeerUserId}
                onChange={(e) => setSelectedPeerUserId(e.target.value)}
              >
                <option value="">New conversation…</option>
                {contacts.map((c) => (
                  <option key={c.user_id} value={c.user_id} className="bg-[#1B2E4B]">
                    {c.full_name ?? c.email}
                  </option>
                ))}
              </select>
              <button
                onClick={handleStartConversation}
                disabled={busy || !selectedPeerUserId}
                title="Start conversation"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] text-white disabled:opacity-40 hover:opacity-90 transition"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <p className="px-4 py-8 text-center text-sm text-[color:var(--sidebar-muted)]">Loading…</p>
            )}
            {!loading && conversations.length === 0 && (
              <div className="px-4 py-8 text-center">
                <MessageCircle size={28} className="mx-auto mb-2 text-[color:var(--sidebar-muted)]" />
                <p className="text-sm text-[color:var(--sidebar-muted)]">No conversations yet</p>
              </div>
            )}
            {conversations.map((conv) => {
              const active = conv.conversation_id === selectedConversationId;
              const displayName = conv.peer.full_name ?? conv.peer.email;
              const ini = displayName.slice(0, 2).toUpperCase();
              return (
                <button
                  key={conv.conversation_id}
                  onClick={() => setSelectedConversationId(conv.conversation_id)}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                    active ? "bg-white/15" : "hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy-dark)] text-sm font-semibold text-white">
                    {ini}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                      {conv.last_message_at && (
                        <p className="ml-2 shrink-0 text-[11px] text-[color:var(--sidebar-muted)]">
                          {new Date(conv.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 truncate text-xs text-[color:var(--sidebar-text)]">
                        {conv.last_message ?? "No messages yet"}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[10px] font-bold text-white">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel – message thread */}
        {selectedConversation ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-[color:var(--background)]">
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-[color:var(--border)] bg-white px-5 py-3 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy)] text-sm font-semibold text-white">
                {(selectedConversation.peer.full_name ?? selectedConversation.peer.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[color:var(--foreground)]">
                  {selectedConversation.peer.full_name ?? selectedConversation.peer.email}
                </p>
                <p className="text-xs text-[color:var(--ink-muted)]">{selectedConversation.peer.email}</p>
              </div>
            </div>

            {/* Messages area */}
            <div ref={messageListRef} className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-3">
                {messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 rounded-full bg-[color:var(--navy-tint)] p-5">
                      <MessageCircle size={30} className="text-[color:var(--navy)]" />
                    </div>
                    <p className="text-sm font-medium text-[color:var(--foreground)]">No messages yet</p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)]">Send the first message below</p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.sender_user_id !== selectedConversation.peer.user_id;
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                      {!isMe && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--background-alt)] text-xs font-semibold text-[color:var(--foreground)]">
                          {(msg.sender_full_name ?? "?").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className={`flex max-w-[72%] flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isMe
                              ? "rounded-br-sm bg-[color:var(--navy)] text-white"
                              : "rounded-bl-sm border border-[color:var(--border)] bg-white text-[color:var(--foreground)] shadow-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                        <p className="px-1 text-[11px] text-[color:var(--ink-subtle)]">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Message input */}
            <div className="border-t border-[color:var(--border)] bg-white px-4 py-3">
              {statusMessage && (
                <p className="mb-2 text-xs text-[color:var(--accent-strong)]">{statusMessage}</p>
              )}
              <div className="flex items-end gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2">
                <textarea
                  rows={1}
                  placeholder="Write a message…"
                  className="flex-1 resize-none bg-transparent text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--ink-subtle)] focus:outline-none"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={busy || !draft.trim()}
                  title="Send"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy)] text-white transition hover:bg-[color:var(--navy-dark)] disabled:opacity-40"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-[color:var(--background)]">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--navy-tint)]">
                <MessageCircle size={36} className="text-[color:var(--navy)]" />
              </div>
              <p className="text-lg font-semibold text-[color:var(--foreground)]">Select a conversation</p>
              <p className="mt-1 text-sm text-[color:var(--ink-muted)]">or start a new one on the left</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
