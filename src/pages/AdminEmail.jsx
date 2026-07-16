// src/pages/AdminEmail.jsx
// Admin-only email composer — locked to Mitchell's user ID
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const ADMIN_ID = "b643ea7b";

const PLAN_TIERS = [
  { value: "all",    label: "All users" },
  { value: "free",   label: "Free" },
  { value: "basic",  label: "Basic" },
  { value: "growth", label: "Growth" },
  { value: "pro",    label: "Pro" },
];

export default function AdminEmail() {
  const [supabase, setSupabase] = useState(null);
  const [, setUser] = useState(null);  const [authorized, setAuthorized] = useState(null);
  const [groomers, setGroomers]   = useState([]);
  const [filter, setFilter]       = useState("all");
  const [selected, setSelected]   = useState(new Set());
  const [subject, setSubject]     = useState("");
  const [body, setBody]           = useState("");
  const [sending, setSending]     = useState(false);
  const [result, setResult]       = useState(null);

  // Lazy-load supabase so it doesn't crash on module init
  useEffect(() => {
    import("../supabase").then(({ supabase: sb }) => {
      setSupabase(sb);
    });
  }, []);

  // Auth check
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      setUser(u);
      setAuthorized(u?.id?.startsWith(ADMIN_ID) ?? false);
    });
  }, [supabase]);

  // Load groomers
  useEffect(() => {
    if (!supabase || !authorized) return;
    supabase
      .from("groomers")
      .select("id, full_name, email, plan_tier, subscription_status")
      .order("full_name")
      .then(({ data }) => setGroomers(data || []));
  }, [supabase, authorized]);

  // Filtered list
  const filtered = groomers.filter(g => {
    if (!g.email) return false;
    if (filter === "all") return true;
    return g.plan_tier === filter;
  });

  // Sync selection when filter changes
  useEffect(() => {
    setSelected(new Set(filtered.map(g => g.email)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, groomers]);

  const toggleOne = (email) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(g => g.email)));
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim() || selected.size === 0) return;

    const confirmed = window.confirm(
      `Send "${subject}" to ${selected.size} recipient${selected.size !== 1 ? "s" : ""}?`
    );
    if (!confirmed) return;

    setSending(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/adminSendEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          recipients: [...selected],
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      const json = await res.json();
      setResult(json);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  if (authorized === null) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }

  if (!authorized) {
    return (
      <div className="p-8 text-center space-y-2">
        <div className="text-2xl">🚫</div>
        <div className="font-semibold text-gray-700">Admin only</div>
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Back to Home</Link>
      </div>
    );
  }

  const allChecked = filtered.length > 0 && selected.size === filtered.length;
  const someChecked = selected.size > 0 && selected.size < filtered.length;

  return (
    <main className="px-4 py-6 max-w-3xl mx-auto space-y-6">
      <Link to="/" className="text-sm text-blue-600 hover:underline">← Back to Home</Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📧 Send Email</h1>
        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">Admin only</span>
      </div>

      {/* Plan filter */}
      <div className="bg-white border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Recipients</p>
        <div className="flex flex-wrap gap-2">
          {PLAN_TIERS.map(t => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                filter === t.value
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-emerald-400"
              }`}
            >
              {t.label}
              <span className="ml-1.5 opacity-70">
                ({t.value === "all"
                  ? groomers.filter(g => g.email).length
                  : groomers.filter(g => g.email && g.plan_tier === t.value).length})
              </span>
            </button>
          ))}
        </div>

        <div className="border rounded-xl overflow-hidden">
          <label className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b cursor-pointer hover:bg-gray-100">
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked; }}
              onChange={toggleAll}
              className="w-4 h-4 accent-emerald-600"
            />
            <span className="text-sm font-semibold text-gray-700">
              {allChecked ? "Deselect all" : "Select all"} — {filtered.length} users
            </span>
          </label>

          <div className="max-h-64 overflow-y-auto divide-y">
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-500 italic">No users on this plan.</p>
            )}
            {filtered.map(g => (
              <label key={g.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(g.email)}
                  onChange={() => toggleOne(g.email)}
                  className="w-4 h-4 accent-emerald-600 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{g.full_name}</div>
                  <div className="text-xs text-gray-500 truncate">{g.email}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                  g.plan_tier === "pro"    ? "bg-purple-100 text-purple-700" :
                  g.plan_tier === "growth" ? "bg-blue-100 text-blue-700" :
                  g.plan_tier === "basic"  ? "bg-emerald-100 text-emerald-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {g.plan_tier}
                </span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          {selected.size} recipient{selected.size !== 1 ? "s" : ""} selected
        </p>
      </div>

      {/* Compose */}
      <div className="bg-white border rounded-2xl p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Compose</p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. Exciting new features in PawScheduler!"
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Message</span>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={"Hi there,\n\nJust wanted to let you know..."}
            rows={10}
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
          <p className="text-xs text-gray-400">Plain text — line breaks are preserved. Sent from noreply@pawscheduler.app.</p>
        </label>

        {body.trim() && (
          <div className="rounded-xl border border-dashed border-gray-200 p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preview</p>
            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{body}</p>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || selected.size === 0 || !subject.trim() || !body.trim()}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending
            ? `Sending to ${selected.size} recipient${selected.size !== 1 ? "s" : ""}…`
            : `Send to ${selected.size} recipient${selected.size !== 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-2xl border p-4 space-y-2 ${
          result.error || result.failed > 0
            ? "bg-red-50 border-red-200"
            : "bg-emerald-50 border-emerald-200"
        }`}>
          {result.error ? (
            <p className="text-sm text-red-700 font-semibold">❌ Error: {result.error}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-emerald-800">
                ✅ Sent {result.sent} · Failed {result.failed}
              </p>
              {result.failed > 0 && (
                <div className="space-y-1">
                  {result.results.filter(r => !r.ok).map(r => (
                    <p key={r.email} className="text-xs text-red-600">❌ {r.email} ({r.status})</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}