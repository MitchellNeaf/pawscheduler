import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";

export default function Revenue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Load logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          date,
          time,
          amount,
          paid,
          services,
          pets (
            id,
            name,
            clients ( id, full_name )
          )
        `)
        .eq("groomer_id", user.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false });

      if (error) {
        console.error("Error loading revenue data:", error.message);
      } else {
        setAppointments(data || []);
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  // Helpers
  const toYMD = (d) => d.toLocaleDateString("en-CA");
  const todayStr = toYMD(new Date());
  const startOfWeek = getStartOfWeek(new Date());
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const totalForRange = (startDate, endDate, paidOnly = true) =>
    appointments
      .filter((a) => {
        const apptDate = new Date(a.date);
        return (
          apptDate >= startDate &&
          apptDate <= endDate &&
          (!paidOnly || a.paid)
        );
      })
      .reduce((sum, a) => sum + (a.amount || 0), 0);

  const totalUnpaid = appointments
    .filter((a) => !a.paid)
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  const paidAppointments = appointments.filter((a) => a.paid);
  const unpaidAppointments = appointments.filter((a) => !a.paid);

  // ⭐ Graceful loading screen
  if (loading) {
    return (
      <main className="px-4 py-6 space-y-6">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Loader />
          <Loader />
          <Loader />
          <Loader />
        </div>

        <Loader />
        <Loader />
      </main>
    );
  }

  return (
    <main className="px-4 py-6 space-y-6 max-w-5xl mx-auto">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Revenue Overview</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Today"
          amount={totalForRange(new Date(todayStr), new Date(todayStr))}
        />
        <SummaryCard
          title="This Week"
          amount={totalForRange(startOfWeek, new Date())}
        />
        <SummaryCard
          title="This Month"
          amount={totalForRange(startOfMonth, new Date())}
        />
        <SummaryCard title="Unpaid Total" amount={totalUnpaid} highlight />
      </div>

      {/* Paid Appointments */}
      <Section
        title="Paid Appointments"
        data={paidAppointments}
        emptyText="No paid appointments yet."
      />

      {/* Unpaid Appointments */}
      <Section
        title="Unpaid Appointments"
        data={unpaidAppointments}
        emptyText="No unpaid appointments."
        unpaid
      />
    </main>
  );
}

/* ----------------------------- SUMMARY CARD ----------------------------- */

function SummaryCard({ title, amount, highlight }) {
  const safe = Number(amount || 0);
  return (
    <div className="stat shadow-md border rounded-lg">
      <div className="stat-label">{title}</div>
      <div
        className={`stat-value ${
          highlight ? "text-red-700" : "text-gray-900"
        }`}
      >
        ${safe.toFixed(2)}
      </div>
    </div>
  );
}

/* ----------------------------- SECTIONS ----------------------------- */

function Section({ title, data, emptyText, unpaid }) {
  return (
    <div className="card shadow-md border">
      <div className="card-header">
        <h2
          className={`text-lg font-semibold ${
            unpaid ? "text-red-700" : "text-gray-800"
          }`}
        >
          {title}
        </h2>
      </div>

      <div className="card-body">
        {data.length === 0 ? (
          <p className="text-gray-500 text-sm">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-separate border-spacing-y-1">
              <thead>
                <tr className="text-left text-gray-600">
                  <th>Date</th>
                  <th>Time</th>
                  <th>Pet</th>
                  <th>Client</th>
                  <th>Services</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {data.map((a) => (
                  <tr
                    key={a.id}
                    className={`bg-white ${
                      unpaid ? "bg-red-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td>{a.date}</td>
                    <td>{a.time?.slice(0, 5)}</td>
                    <td>{a.pets?.name || "—"}</td>
                    <td>{a.pets?.clients?.full_name || "—"}</td>
                    <td>
                      {Array.isArray(a.services)
                        ? a.services.join(", ")
                        : a.services || ""}
                    </td>
                    <td className="text-right font-medium">
                      ${Number(a.amount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- UTIL ----------------------------- */

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.setDate(diff));
}
