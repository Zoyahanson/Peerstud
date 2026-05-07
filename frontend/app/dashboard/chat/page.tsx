"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu, MessageCircle, PanelLeftClose, Plus, Search, Send, Users, X } from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { authedFetch, getToken } from "../../../lib/api";

const CHAT_POLL_INTERVAL_MS = 3000;
const MOBILE_SIDEBAR_STORAGE_KEY = "peerstud.chat.mobileConversationsOpen";

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

export default function ChatPage({
  tab = "chat",
  onTabChange,
}: {
  tab?: "chat" | "groups";
  onTabChange?: (t: "chat" | "groups") => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  // User search state
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatContact[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showConversationsPanel, setShowConversationsPanel] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const requestedConversationId = searchParams.get("conversation") ?? "";

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.conversation_id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const setConversationsPanelVisibility = useCallback((nextValue: boolean) => {
    setShowConversationsPanel(nextValue);
    if (typeof window === "undefined") {
      return;
    }
    if (window.innerWidth < 1024) {
      window.localStorage.setItem(MOBILE_SIDEBAR_STORAGE_KEY, nextValue ? "1" : "0");
    }
  }, []);

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
        if (requestedConversationId && conversationResponse.some((item) => item.conversation_id === requestedConversationId)) {
          setSelectedConversationId(requestedConversationId);
          return;
        }
        if (conversationResponse[0]?.conversation_id) {
          setSelectedConversationId(conversationResponse[0].conversation_id);
        }
      })
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load chat.");
      })
      .finally(() => setLoading(false));
  }, [requestedConversationId, router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const savedMobileValue = window.localStorage.getItem(MOBILE_SIDEBAR_STORAGE_KEY);
    const mobileOpen = savedMobileValue == null ? false : savedMobileValue === "1";

    if (mediaQuery.matches) {
      setShowConversationsPanel(true);
    } else {
      setShowConversationsPanel(mobileOpen);
    }

    function handleViewportChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setShowConversationsPanel(true);
        return;
      }
      const currentSaved = window.localStorage.getItem(MOBILE_SIDEBAR_STORAGE_KEY);
      setShowConversationsPanel(currentSaved === "1");
    }

    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

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

  // Seed search results as soon as contacts are loaded so dropdown shows on first focus
  useEffect(() => {
    if (contacts.length > 0 && searchResults.length === 0 && !userSearchQuery) {
      setSearchResults(contacts.slice(0, 20));
    }
  }, [contacts, searchResults.length, userSearchQuery]);

  // Debounced user search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = userSearchQuery.trim();
    if (!q) {
      setSearchResults(contacts.slice(0, 20));
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await authedFetch<ChatContact[]>(`/chat/contacts?q=${encodeURIComponent(q)}&limit=20`);
        setSearchResults(results);
      } catch {
        // silently ignore search errors
      } finally {
        setSearchLoading(false);
      }
    }, 280);
  }, [userSearchQuery, contacts]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleStartConversationWith(peerUserId: string) {
    if (!peerUserId) return;
    try {
      setBusy(true);
      setStatusMessage("");
      const conversation = await authedFetch<ChatConversation>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ peer_user_id: peerUserId }),
      });
      await refreshConversations();
      setSelectedConversationId(conversation.conversation_id);
      setUserSearchQuery("");
      setShowSearchResults(false);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setConversationsPanelVisibility(false);
      }
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
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-3 sm:p-4 lg:flex-row lg:p-4" style={{ height: "calc(100vh - 4rem)" }}>
        <div className="flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => setConversationsPanelVisibility(!showConversationsPanel)}
            className="secondary-button inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Menu size={15} />
            {showConversationsPanel ? "Hide Conversations" : "Show Conversations"}
          </button>
          {selectedConversation && (
            <p className="max-w-[48vw] truncate text-xs text-[color:var(--ink-muted)]">
              {selectedConversation.peer.full_name ?? selectedConversation.peer.email}
            </p>
          )}
        </div>

        {/* Left panel – conversation list */}
        <div
          className={`${showConversationsPanel ? "flex" : "hidden"} h-[44vh] w-full shrink-0 flex-col rounded-[1.5rem] border border-white/10 bg-[color:var(--sidebar-bg)] shadow-xl lg:flex lg:h-auto lg:w-72 lg:rounded-[2rem] xl:w-80`}
        >
          {/* Panel header with tab toggle */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            {onTabChange ? (
              <div className="flex flex-1 gap-1 rounded-xl bg-white/10 p-1">
                <button
                  onClick={() => onTabChange("chat")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                    tab === "chat"
                      ? "bg-[color:var(--accent)] text-white"
                      : "text-[color:var(--sidebar-text)] hover:text-white"
                  }`}
                >
                  <MessageCircle size={13} />
                  Chats
                </button>
                <button
                  onClick={() => onTabChange("groups")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                    tab === "groups"
                      ? "bg-[color:var(--navy-dark)] text-white"
                      : "text-[color:var(--sidebar-text)] hover:text-white"
                  }`}
                >
                  <Users size={13} />
                  Groups
                </button>
              </div>
            ) : (
              <h2 className="flex-1 text-base font-bold text-white">Messages</h2>
            )}
            <button
              type="button"
              onClick={() => setConversationsPanelVisibility(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[color:var(--sidebar-text)] lg:hidden"
              aria-label="Collapse conversations"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>

          {/* User search – find anyone to message */}
          <div ref={searchRef} className="relative border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
              <Search size={13} className="shrink-0 text-[color:var(--sidebar-muted)]" />
              <input
                placeholder="Search people…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-[color:var(--sidebar-muted)] focus:outline-none"
                value={userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
              />
              {userSearchQuery && (
                <button
                  onClick={() => { setUserSearchQuery(""); setShowSearchResults(false); }}
                  className="text-[color:var(--sidebar-muted)] hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {showSearchResults && (
              <div className="absolute inset-x-3 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[color:var(--navy-dark)] shadow-xl">
                {searchLoading && (
                  <p className="px-4 py-3 text-xs text-[color:var(--sidebar-muted)]">Searching…</p>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <p className="px-4 py-3 text-xs text-[color:var(--sidebar-muted)]">No users found</p>
                )}
                {!searchLoading && searchResults.map((contact) => (
                  <button
                    key={contact.user_id}
                    disabled={busy}
                    onClick={() => handleStartConversationWith(contact.user_id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/10 transition disabled:opacity-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy)] text-xs font-semibold text-white">
                      {(contact.full_name ?? contact.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate text-sm font-medium text-white">{contact.full_name ?? contact.email}</p>
                      <p className="truncate text-xs text-[color:var(--sidebar-muted)]">{contact.email}</p>
                    </div>
                    <Plus size={14} className="ml-auto shrink-0 text-[color:var(--accent)]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto rounded-b-[2rem]">
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
                  onClick={() => {
                    setSelectedConversationId(conv.conversation_id);
                    if (typeof window !== "undefined" && window.innerWidth < 1024) {
                      setConversationsPanelVisibility(false);
                    }
                  }}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background)] shadow-xl lg:rounded-[2rem]">
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
            <div ref={messageListRef} className="flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
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
                      <div className={`flex max-w-[84%] flex-col gap-1 sm:max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
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
            <div className="border-t border-[color:var(--border)] bg-white px-3 py-3 sm:px-4">
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
          <div className="flex min-h-[40vh] flex-1 items-center justify-center rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background)] shadow-xl lg:min-h-0 lg:rounded-[2rem]">
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
