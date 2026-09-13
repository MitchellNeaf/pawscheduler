// src/pages/BotConversations.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Same filtering as smsBot.js's own toSafeHistory — keep only genuine
// text exchanges, strip out tool-call internals a groomer shouldn't
// need to see (lookup_client, get_available_slots, etc.).
function toReadableMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const readable = [];
  for (const msg of messages) {
    if (!msg?.role) continue;
    if (typeof msg.content === "string") {
      readable.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text.trim())
        .filter(Boolean);
      if (textParts.length) readable.push({ role: msg.role, content: textParts.join("\n") });
    }
  }
  return readable;
}

export default function BotConversations() {
  const [user, setUser] = useState(null);
  const [planTier, setPlanTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("groomers")
      .select("plan_tier")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setPlanTier(data?.plan_tier || "free"));
  }, [user]);

  useEffect(() => {
    if (!user || planTier !== "pro") return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sms_conversations")
        .select("id, phone, messages, client_id, last_message_at, clients(full_name)")
        .eq("groomer_id", user.id)
        .order("last_message_at", { ascending: false });
      setConversations(data || []);
      setLoading(false);
    })();
  }, [user, planTier]);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const name = (c.clients?.full_name || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  if (planTier === null) return <Loader />;

  if (planTier !== "pro") {
    return (
      <main className="px-4 py-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">AI Booking Bot is a Pro feature</h1>
            <p className="text-sm text-gray-500 mt-1">Let clients book, reschedule, and cancel appointments just by texting — no app download needed.</p>
          </div>
          <ul className="text-left text-sm text-gray-600 space-y-1.5 max-w-sm mx-auto">
            <li>🤖 Clients text to book, check availability, reschedule, or cancel</li>
            <li>💬 Real conversations, handled automatically, day or night</li>
            <li>👀 Every conversation saved here, fully reviewable — nothing happens without your visibility</li>
          </ul>
          <a
            href="/upgrade"
            className="block w-full text-center py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition"
          >
            Upgrade to Pro — $79.99/mo →
          </a>
        </div>
      </main>
    );
  }

  if (loading) return <Loader />;

  return (
    <main className="px-4 py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">🤖 Bot Conversations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every conversation your AI booking assistant has had with clients.</p>
      </div>

      <input
        type="text"
        placeholder="Search by client name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          {conversations.length === 0 ? "No bot conversations yet." : "No matching conversations found."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const isOpen = openId === c.id;
            const messages = toReadableMessages(c.messages);
            return (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {c.clients?.full_name || c.phone || "Unknown"}
                    </div>
                    <div className="text-xs text-gray-500">{fmtDateTime(c.last_message_at)} · {messages.length} messages</div>
                  </div>
                  <span className="text-gray-400 flex-shrink-0 ml-2">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50 max-h-96 overflow-y-auto">
                    {messages.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No readable messages in this conversation.</p>
                    ) : (
                      messages.map((m, i) => (
                        <div
                          key={i}
                          className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                              m.role === "assistant"
                                ? "bg-white border border-gray-200 text-gray-800"
                                : "bg-emerald-600 text-white"
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}