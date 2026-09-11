// src/pages/RequestHistory.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLES = {
  approved:   { label: "✓ Approved",  className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  declined:   { label: "✕ Declined",  className: "bg-red-100 text-red-700 border-red-200" },
  waitlisted: { label: "⏸ Waitlisted", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

export default function RequestHistory() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const [approvedRes, waitlistedRes, declinedRes] = await Promise.all([
        // Confirmed requests that started as a booking-page or new-client request
        supabase
          .from("appointments")
          .select("id, date, time, services, source, pets(name, clients(full_name, phone, email))")
          .eq("groomer_id", user.id)
          .eq("confirmed", true)
          .in("source", ["booking_page", "new_client_booking"]),
        // Currently waitlisted
        supabase
          .from("appointments")
          .select("id, date, time, services, source, pets(name, clients(full_name, phone, email))")
          .eq("groomer_id", user.id)
          .eq("waitlist", true),
        // Declined — from the archive table
        supabase
          .from("declined_appointments")
          .select("id, date, time, services, source, pet_name, client_name, client_phone, client_email, declined_at")
          .eq("groomer_id", user.id),
      ]);

      const approved = (approvedRes.data || []).map(a => ({
        id: `a-${a.id}`,
        status: "approved",
        petName: a.pets?.name || "—",
        clientName: a.pets?.clients?.full_name || "—",
        phone: a.pets?.clients?.phone || "",
        email: a.pets?.clients?.email || "",
        date: a.date,
        time: a.time,
        services: a.services || [],
        isNewClient: a.source === "new_client_booking",
        sortKey: a.date || "",
      }));

      const waitlisted = (waitlistedRes.data || []).map(a => ({
        id: `w-${a.id}`,
        status: "waitlisted",
        petName: a.pets?.name || "—",
        clientName: a.pets?.clients?.full_name || "—",
        phone: a.pets?.clients?.phone || "",
        email: a.pets?.clients?.email || "",
        date: a.date,
        time: a.time,
        services: a.services || [],
        isNewClient: a.source === "new_client_booking",
        sortKey: a.date || "",
      }));

      const declined = (declinedRes.data || []).map(d => ({
        id: `d-${d.id}`,
        status: "declined",
        petName: d.pet_name || "—",
        clientName: d.client_name || "—",
        phone: d.client_phone || "",
        email: d.client_email || "",
        date: d.date,
        time: d.time,
        services: d.services || [],
        isNewClient: d.source === "new_client_booking",
        sortKey: d.declined_at || d.date || "",
      }));

      const merged = [...approved, ...waitlisted, ...declined].sort((a, b) =>
        (b.sortKey || "").localeCompare(a.sortKey || "")
      );

      setEntries(merged);
      setLoading(false);
    };

    load();
  }, [user]);

  const filtered = entries.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!e.petName.toLowerCase().includes(q) && !e.clientName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) return <Loader />;

  return (
    <main className="px-4 py-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Request History</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every booking request and what happened to it — approved, declined, or waitlisted.</p>
      </div>

      <input
        type="text"
        placeholder="Search by client or pet name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
      />

      <div className="flex gap-2 flex-wrap">
        {["all", "approved", "declined", "waitlisted"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              statusFilter === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {s === "all" ? "All" : STATUS_STYLES[s].label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No matching requests found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{e.petName}</span>
                  <span className="text-gray-400 text-sm">·</span>
                  <span className="text-gray-600 text-sm">{e.clientName}</span>
                  {e.isNewClient && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">NEW CLIENT</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {fmtDate(e.date)} {e.time && `at ${fmtTime(e.time)}`}
                  {e.services?.length > 0 && ` · ${e.services.join(", ")}`}
                </div>
                {(e.phone || e.email) && (
                  <div className="text-xs text-gray-400 mt-0.5">{[e.phone, e.email].filter(Boolean).join(" · ")}</div>
                )}
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLES[e.status].className}`}>
                {STATUS_STYLES[e.status].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}