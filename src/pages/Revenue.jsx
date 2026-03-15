import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";

/* ── legacy service name normalization ── */
const LEGACY_SERVICE_MAP = {
  "Wash": "Bath", "Cut": "Full Groom", "Nail Trim": "Nails",
  "Teeth Cleaning": "Teeth", "Deshedding": "Deshed",
  "Bath Only": "Bath", "Ear Cleaning": "Other", "Tick Treatment": "Other",
};
const normalizeSvc = (s) => LEGACY_SERVICE_MAP[s] || s;

/* ── quick period helpers ── */
const toYMD = (d) => d.toISOString().slice(0, 10);
const PERIODS = [
  {
    label: "This Week", get: () => {
      const now = new Date();
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { start: toYMD(mon), end: toYMD(now) };
    },
  },
  {
    label: "This Month", get: () => {
      const now = new Date();
      return {
        start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        end: toYMD(now),
      };
    },
  },
  {
    label: "Last Month", get: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last  = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toYMD(first), end: toYMD(last) };
    },
  },
  {
    label: "This Year", get: () => ({
      start: `${new Date().getFullYear()}-01-01`,
      end: toYMD(new Date()),
    }),
  },
  { label: "All Time", get: () => ({ start: null, end: null }) },
];

/* ── stat card ── */
function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card">
      <div className="card-body" style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: ".07em", color: "var(--text-3)", marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: "1.55rem", fontWeight: 800,
          color: accent || "var(--text-1)", lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: "0.73rem", color: "var(--text-3)", marginTop: 3 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

/* ── horizontal bar ── */
function Bar({ pct, color }) {
  return (
    <div style={{ height: 7, borderRadius: 99, background: "var(--border-med)",
      overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: `${Math.max(pct, 2)}%`,
        background: color || "var(--brand)", borderRadius: 99,
        transition: "width .4s ease" }} />
    </div>
  );
}

export default function Revenue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [user, setUser]                 = useState(null);

  const [startDate, setStartDate]         = useState(null);
  const [endDate, setEndDate]             = useState(null);
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [activePeriod, setActivePeriod]   = useState("This Month");

  const [sortCol, setSortCol] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select(`
          id, date, time, amount, paid, no_show, services,
          pets ( name, clients ( full_name ) )
        `)
        .eq("groomer_id", user.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false });
      setAppointments(data || []);
      setLoading(false);
    })();
  }, [user]);

  const applyPeriod = (label) => {
    const p = PERIODS.find((x) => x.label === label);
    if (!p) return;
    const { start, end } = p.get();
    setStartDate(start);
    setEndDate(end);
    setActivePeriod(label);
  };

  // Default to This Month once data loads
  useEffect(() => {
    if (!loading) applyPeriod("This Month");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /* ── derived ── */
  const filtered = useMemo(() => appointments.filter((a) => {
    const d = new Date(a.date);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate   && d > new Date(endDate))   return false;
    if (!includeUnpaid && !a.paid)             return false;
    return true;
  }), [appointments, startDate, endDate, includeUnpaid]);

  const paidOnly = useMemo(() => filtered.filter((a) => a.paid), [filtered]);

  const totalRevenue = paidOnly.reduce((s, a) => s + (a.amount || 0), 0);
  const apptCount    = filtered.length;
  const avgPerAppt   = paidOnly.length ? totalRevenue / paidOnly.length : 0;
  const unpaidCount  = filtered.filter((a) => !a.paid && !a.no_show).length;

  const noShowLoss = useMemo(() =>
    appointments.filter((a) => a.no_show).reduce((s, a) => s + (a.amount || 0), 0),
  [appointments]);

  const revenueByService = useMemo(() => {
    const map = {};
    paidOnly.forEach((a) => {
      const list = Array.isArray(a.services) ? a.services : [a.services];
      list.forEach((s) => {
        if (!s) return;
        const n = normalizeSvc(s);
        map[n] = (map[n] || 0) + (a.amount || 0);
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [paidOnly]);

  const maxSvc = revenueByService[0]?.[1] || 1;

  // Last 6 months from all paid appointments (not filtered)
  const monthlyTrend = useMemo(() => {
    const map = {};
    appointments.filter((a) => a.paid).forEach((a) => {
      const key = a.date.slice(0, 7);
      map[key] = (map[key] || 0) + (a.amount || 0);
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6);
  }, [appointments]);

  const maxMonth = Math.max(...monthlyTrend.map(([, v]) => v), 1);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va, vb;
      if (sortCol === "date")   { va = a.date + (a.time || ""); vb = b.date + (b.time || ""); }
      if (sortCol === "amount") { va = a.amount || 0; vb = b.amount || 0; }
      if (sortCol === "client") { va = a.pets?.clients?.full_name || ""; vb = b.pets?.clients?.full_name || ""; }
      if (sortCol === "pet")    { va = a.pets?.name || ""; vb = b.pets?.name || ""; }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [filtered, sortCol, sortAsc]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc((x) => !x);
    else { setSortCol(col); setSortAsc(false); }
  };

  const SortTh = ({ col, children }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        color: sortCol === col ? "var(--brand)" : "var(--text-3)",
        fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase",
        letterSpacing: ".06em", paddingBottom: 8, paddingRight: 12,
      }}
    >
      {children} {sortCol === col ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  const fmtMonth = (ym) => {
    const [y, m] = ym.split("-");
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  if (loading) return <main className="p-6 space-y-6"><Loader /><Loader /></main>;

  return (
    <main className="px-4 py-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <Link to="/" style={{ fontSize: "0.8rem", color: "var(--brand)", fontWeight: 600 }}>
          ← Back
        </Link>
        <h1 style={{ margin: "4px 0 0", fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)" }}>
          Revenue
        </h1>
      </div>

      {/* Quick period filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {PERIODS.map(({ label }) => (
          <button
            key={label}
            onClick={() => applyPeriod(label)}
            style={{
              padding: "5px 14px", borderRadius: 99, fontSize: "0.78rem", fontWeight: 700,
              border: "1.5px solid",
              borderColor: activePeriod === label ? "var(--brand)" : "var(--border-med)",
              background: activePeriod === label ? "var(--brand)" : "transparent",
              color: activePeriod === label ? "white" : "var(--text-2)",
              cursor: "pointer", transition: "all .15s",
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="date" value={startDate || ""}
            onChange={(e) => { setStartDate(e.target.value); setActivePeriod(""); }}
            style={{ fontSize: "0.78rem", padding: "4px 8px", borderRadius: 8,
              border: "1.5px solid var(--border-med)", background: "var(--surface)",
              color: "var(--text-1)" }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>–</span>
          <input
            type="date" value={endDate || ""}
            onChange={(e) => { setEndDate(e.target.value); setActivePeriod(""); }}
            style={{ fontSize: "0.78rem", padding: "4px 8px", borderRadius: 8,
              border: "1.5px solid var(--border-med)", background: "var(--surface)",
              color: "var(--text-1)" }}
          />
        </div>
      </div>

      {/* Include unpaid toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem",
        color: "var(--text-2)", fontWeight: 600, cursor: "pointer", width: "fit-content" }}>
        <input
          type="checkbox" checked={includeUnpaid}
          onChange={() => setIncludeUnpaid((x) => !x)}
          style={{ accentColor: "var(--brand)", width: 15, height: 15 }}
        />
        Include unpaid in totals
      </label>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <StatCard
          label="Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          sub={startDate ? `${startDate} → ${endDate || "today"}` : "All time"}
          accent="var(--brand)"
        />
        <StatCard label="Appointments" value={apptCount} sub={`${paidOnly.length} paid`} />
        <StatCard label="Avg per Appt" value={`$${avgPerAppt.toFixed(2)}`} sub="paid only" />
        <StatCard
          label="Unpaid"
          value={unpaidCount}
          sub="past due"
          accent={unpaidCount > 0 ? "#ef4444" : undefined}
        />
      </div>

      {/* No-show loss */}
      {noShowLoss > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderRadius: 12,
          background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)",
        }}>
          <span style={{ fontSize: "0.85rem", color: "#b91c1c", fontWeight: 600 }}>
            🚫 No-show revenue loss
          </span>
          <span style={{ fontSize: "1rem", fontWeight: 800, color: "#b91c1c" }}>
            ${noShowLoss.toFixed(2)}
          </span>
        </div>
      )}

      {/* Monthly trend */}
      {monthlyTrend.length > 0 && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ margin: "0 0 16px", fontSize: "0.85rem", fontWeight: 700,
              color: "var(--text-1)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Monthly Trend
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {monthlyTrend.map(([ym, amt]) => (
                <div key={ym} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 44, fontSize: "0.72rem", fontWeight: 700,
                    color: "var(--text-3)", flexShrink: 0 }}>
                    {fmtMonth(ym)}
                  </div>
                  <Bar pct={(amt / maxMonth) * 100} />
                  <div style={{ width: 58, textAlign: "right", fontSize: "0.82rem",
                    fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                    ${amt.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue by service */}
      {revenueByService.length > 0 && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ margin: "0 0 16px", fontSize: "0.85rem", fontWeight: 700,
              color: "var(--text-1)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Revenue by Service
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {revenueByService.map(([svc, amt]) => (
                <div key={svc} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 90, fontSize: "0.78rem", fontWeight: 600,
                    color: "var(--text-2)", flexShrink: 0, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {svc}
                  </div>
                  <Bar pct={(amt / maxSvc) * 100} color="var(--brand-light)" />
                  <div style={{ width: 58, textAlign: "right", fontSize: "0.82rem",
                    fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                    ${amt.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Appointment table */}
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700,
            color: "var(--text-1)", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Appointments
            <span style={{ marginLeft: 8, fontSize: "0.75rem", fontWeight: 600,
              color: "var(--text-3)", textTransform: "none", letterSpacing: 0 }}>
              ({sortedFiltered.length})
            </span>
          </h2>
        </div>

        {sortedFiltered.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center",
            color: "var(--text-3)", fontSize: "0.85rem" }}>
            No appointments match this filter.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)" }}>
                  <th style={{ width: 8 }} />
                  <SortTh col="date">Date</SortTh>
                  <SortTh col="pet">Pet</SortTh>
                  <SortTh col="client">Client</SortTh>
                  <th style={{ fontSize: "0.72rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: ".06em",
                    color: "var(--text-3)", paddingBottom: 8, paddingRight: 12 }}>
                    Services
                  </th>
                  <SortTh col="amount">Amount</SortTh>
                  <th style={{ fontSize: "0.72rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: ".06em",
                    color: "var(--text-3)", paddingBottom: 8 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((a) => {
                  const services = Array.isArray(a.services)
                    ? a.services.map(normalizeSvc).join(", ")
                    : normalizeSvc(a.services || "") || "—";
                  const statusColor = a.no_show ? "#ef4444" : a.paid ? "var(--brand)" : "#f59e0b";

                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      {/* status accent bar */}
                      <td style={{ width: 4, padding: 0 }}>
                        <div style={{ width: 4, height: "100%", minHeight: 42,
                          background: statusColor }} />
                      </td>
                      <td style={{ padding: "10px 12px 10px 8px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{a.date}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                          {a.time?.slice(0, 5)}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600,
                        color: "var(--text-1)" }}>
                        {a.pets?.name || "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-2)" }}>
                        {a.pets?.clients?.full_name || "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-3)",
                        fontSize: "0.75rem", maxWidth: 160, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {services}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700,
                        color: a.paid ? "var(--brand)" : "#ef4444", whiteSpace: "nowrap" }}>
                        ${Number(a.amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {a.no_show ? (
                          <span className="chip chip-danger" style={{ fontSize: "0.68rem" }}>
                            No-show
                          </span>
                        ) : a.paid ? (
                          <span className="chip chip-brand" style={{ fontSize: "0.68rem" }}>
                            Paid
                          </span>
                        ) : (
                          <span className="chip chip-warning" style={{ fontSize: "0.68rem" }}>
                            Unpaid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </main>
  );
}