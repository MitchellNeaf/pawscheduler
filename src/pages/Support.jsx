// src/pages/Support.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import ConfirmModal from "../components/ConfirmModal";

export default function Support() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Pre-fill from the groomer's own account so they don't have to retype it
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email || "");
      supabase.from("groomers").select("full_name").eq("id", u.id).maybeSingle()
        .then(({ data: g }) => { if (g?.full_name) setName(g.full_name); });
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setSending(true);
    try {
      const res = await fetch("/.netlify/functions/contactSupport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });

      if (res.ok) {
        setMessage("");
        setConfirmConfig({
          title: "Message sent ✓",
          message: "Thanks for reaching out — I read every message personally and usually reply within a day or two.",
          confirmLabel: "OK",
          onConfirm: () => {},
        });
      } else {
        setConfirmConfig({
          title: "Something went wrong",
          message: "Your message didn't send. Please try again in a moment.",
          confirmLabel: "OK",
          onConfirm: () => {},
        });
      }
    } catch {
      setConfirmConfig({
        title: "Something went wrong",
        message: "Your message didn't send. Please check your connection and try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💬</div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Contact Support</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Questions, bugs, feature ideas — send it over. This goes straight to me, not a ticket queue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm bg-[var(--bg)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm bg-[var(--bg)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={6}
              placeholder="What's going on?"
              className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm bg-[var(--bg)] text-[var(--text-1)] resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Message"}
          </button>
        </form>
      </div>

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </main>
  );
}