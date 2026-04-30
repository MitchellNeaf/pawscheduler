// src/pages/SmsInbox.jsx
// Two-way SMS inbox for groomer ↔ client messaging

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../supabase";

const POLL_INTERVAL = 10000; // poll every 10s for new messages

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMessageTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function SmsInbox() {
  const [user, setUser] = useState(null);
  const [planTier, setPlanTier] = useState("free");
  const [conversations, setConversations] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef(null);
  const replyRef = useRef(null);

  // Load user + plan
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) return;
      setUser(u);
      supabase.from("groomers").select("plan_tier").eq("id", u.id).single()
        .then(({ data: g }) => { if (g?.plan_tier) setPlanTier(g.plan_tier); });
    });
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("get_sms_conversations", {
      p_groomer_id: user.id,
    });
    if (data) setConversations(data);
    setLoadingConvos(false);
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Poll for new conversations
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(loadConversations, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user, loadConversations]);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (phone) => {
    if (!user || !phone) return;
    setLoadingMessages(true);

    const { data } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("groomer_id", user.id)
      .eq("client_phone", phone)
      .order("created_at", { ascending: true });

    if (data) setMessages(data);
    setLoadingMessages(false);

    // Mark inbound messages as read
    await supabase
      .from("sms_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("groomer_id", user.id)
      .eq("client_phone", phone)
      .eq("direction", "inbound")
      .is("read_at", null);

    // Update unread count in conversations list
    setConversations(prev =>
      prev.map(c => c.client_phone === phone ? { ...c, unread_count: 0 } : c)
    );
  }, [user]);

  useEffect(() => {
    if (selectedPhone) loadMessages(selectedPhone);
  }, [selectedPhone, loadMessages]);

  // Poll for new messages in open conversation
  useEffect(() => {
    if (!selectedPhone) return;
    const interval = setInterval(() => loadMessages(selectedPhone), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [selectedPhone, loadMessages]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectConvo = (phone) => {
    setSelectedPhone(phone);
    setReply("");
    setTimeout(() => replyRef.current?.focus(), 100);
  };

  const handleSendReply = async () => {
    if (!reply.trim() || sending || !selectedPhone) return;
    setSending(true);

    const messageText = reply.trim();
    setReply("");

    // Optimistic update
    const optimistic = {
      id: `temp-${Date.now()}`,
      groomer_id: user.id,
      client_phone: selectedPhone,
      direction: "outbound",
      body: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/sendSmsReply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ toPhone: selectedPhone, message: messageText }),
      });

      if (!res.ok) {
        throw new Error("Failed to send");
      }

      // Reload messages to get real record
      await loadMessages(selectedPhone);
      await loadConversations();
    } catch (err) {
      console.error("Send failed:", err);
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setReply(messageText); // restore text
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const selectedConvo = conversations.find(c => c.client_phone === selectedPhone);
  const filteredConvos = conversations.filter(c => {
    const q = search.toLowerCase();
    return (
      (c.client_name || "").toLowerCase().includes(q) ||
      (c.client_phone || "").includes(q) ||
      (c.last_message || "").toLowerCase().includes(q)
    );
  });

  const totalUnread = conversations.reduce((s, c) => s + Number(c.unread_count || 0), 0);

  // Gate for non-basic users
  if (planTier === "free") {
    return (
      <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">💬</div>
          <h2 className="text-xl font-bold text-[var(--text-1)]">SMS Inbox requires Basic or higher</h2>
          <p className="text-sm text-[var(--text-2)]">
            Upgrade to Basic to unlock two-way SMS messaging with your clients directly from PawScheduler.
          </p>
          <a href="/upgrade"
            className="inline-block mt-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
            Upgrade to Basic — $9.99/mo →
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-56px)] bg-[var(--bg)] overflow-hidden">

      {/* ── Conversation list ── */}
      <div className={`flex flex-col border-r border-[var(--border-med)] bg-[var(--surface)]
        ${selectedPhone ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-shrink-0`}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border-med)]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-[var(--text-1)]">
              Messages
              {totalUnread > 0 && (
                <span className="ml-2 text-xs font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </h1>
          </div>
          <input
            type="text"
            placeholder="Search conversations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[var(--border-med)] bg-[var(--bg)] text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)]"
          />
        </div>

        {/* Conversation items */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="animate-pulse flex gap-3 items-center">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-200 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConvos.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-3)]">
              {search ? "No conversations match your search" : "No messages yet.\nClients who text your number will appear here."}
            </div>
          ) : (
            filteredConvos.map((convo) => {
              const isSelected = selectedPhone === convo.client_phone;
              const hasUnread = Number(convo.unread_count) > 0;
              const initials = (convo.client_name || convo.client_phone)
                .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

              return (
                <button
                  key={convo.client_phone}
                  onClick={() => handleSelectConvo(convo.client_phone)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-2)] border-b border-[var(--border-light)]
                    ${isSelected ? "bg-emerald-50 border-l-2 border-l-emerald-500" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                    ${hasUnread ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${hasUnread ? "font-bold text-[var(--text-1)]" : "font-medium text-[var(--text-1)]"}`}>
                        {convo.client_name || convo.client_phone}
                      </span>
                      <span className="text-xs text-[var(--text-3)] flex-shrink-0">
                        {formatTime(convo.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-xs truncate ${hasUnread ? "text-[var(--text-1)] font-medium" : "text-[var(--text-3)]"}`}>
                        {convo.last_direction === "outbound" && <span className="text-[var(--text-3)]">You: </span>}
                        {convo.last_message}
                      </p>
                      {hasUnread && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {convo.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Message thread ── */}
      {selectedPhone ? (
        <div className="flex flex-col flex-1 min-w-0">

          {/* Thread header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-med)] bg-[var(--surface)]">
            <button
              onClick={() => setSelectedPhone(null)}
              className="md:hidden p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-2)]"
            >
              ←
            </button>

            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
              {(selectedConvo?.client_name || selectedPhone).split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[var(--text-1)] text-sm truncate">
                {selectedConvo?.client_name || selectedPhone}
              </div>
              <div className="text-xs text-[var(--text-3)]">{selectedPhone}</div>
            </div>

            {selectedConvo?.client_id && (
              <a
                href={`/clients/${selectedConvo.client_id}`}
                className="text-xs px-3 py-1.5 rounded-xl border border-[var(--border-med)] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition flex-shrink-0"
              >
                View Client
              </a>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-[var(--text-3)]">Loading messages…</div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-[var(--text-3)] text-center">
                  No messages yet. Send one below to start the conversation.
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const isOut = msg.direction === "outbound";
                  const prevMsg = messages[i - 1];
                  const showTime = !prevMsg ||
                    new Date(msg.created_at) - new Date(prevMsg.created_at) > 300000; // 5min gap

                  return (
                    <div key={msg.id}>
                      {showTime && (
                        <div className="text-center text-[10px] text-[var(--text-3)] my-3">
                          {formatMessageTime(msg.created_at)}
                        </div>
                      )}
                      <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                          ${isOut
                            ? "bg-emerald-600 text-white rounded-br-sm"
                            : "bg-[var(--surface)] border border-[var(--border-med)] text-[var(--text-1)] rounded-bl-sm"
                          }`}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Reply box */}
          <div className="px-4 py-3 border-t border-[var(--border-med)] bg-[var(--surface)]">
            <div className="flex items-end gap-2">
              <textarea
                ref={replyRef}
                rows={1}
                value={reply}
                onChange={e => {
                  setReply(e.target.value);
                  // Auto-resize
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send)"
                className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-[var(--border-med)] bg-[var(--bg)] text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-emerald-400 overflow-hidden"
                style={{ minHeight: "42px" }}
              />
              <button
                onClick={handleSendReply}
                disabled={!reply.trim() || sending}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-3)] mt-1.5 px-1">
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>
      ) : (
        /* Empty state on desktop */
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <div className="text-5xl">💬</div>
            <h3 className="font-semibold text-[var(--text-1)]">Select a conversation</h3>
            <p className="text-sm text-[var(--text-2)]">
              Choose a conversation from the left to read and reply to messages.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}