import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";

export default function Revenue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  // Helpers
  const todayStr = new Date().toISOString().split("T")[0];
  const startOfWeek = getStartOfWeek(new Date());
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const totalForRange = (startDate, endDate, paidOnly = true) =>
    appointments
      .filter((a) => {
        const apptDate = new Date(a.date);
        return apptDate >= startDate && apptDate <= endDate && (!paidOnly || a.paid);
      })
      .reduce((sum, a) => sum + (a.amount || 0), 0);

  const totalUnpaid = appointments
    .filter((a) => !a.paid)
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  const paidAppointments = appointments.filter((a) => a.paid);
  const unpaidAppointments = appointments.filter((a) => !a.paid);

  if (loading) return <main className="px-4 py-6">Loading revenue data...</main>;

  return (
    <main>
      <Link to="/">&larr; Back to Home</Link>
      <h1 className="mt-2">Revenue Overview</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard title="Today" amount={totalForRange(new Date(todayStr), new Date(todayStr))} />
        <SummaryCard title="This Week" amount={totalForRange(startOfWeek, new Date())} />
        <SummaryCard title="This Month" amount={totalForRange(startOfMonth, new Date())} />
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

function SummaryCard({ title, amount, highlight }) {
  const safe = Number(amount || 0);
  return (
    <div className="stat">
      <div className="stat-label">{title}</div>
      <div className={`stat-value ${highlight ? "text-red-700" : "text-gray-900"}`}>
        ${safe.toFixed(2)}
      </div>
    </div>
  );
}

function Section({ title, data, emptyText, unpaid }) {
  return (
    <div className="mb-8 card">
      <div className="card-header">
        <h2 className={`${unpaid ? "text-red-700" : "text-gray-800"} m-0`}>{title}</h2>
      </div>
      <div className="card-body">
        {data.length === 0 ? (
          <p className="text-gray-500">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
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
                  <tr key={a.id} className={unpaid ? "bg-red-50" : ""}>
                    <td>{a.date}</td>
                    <td>{a.time?.slice(0, 5)}</td>
                    <td>{a.pets?.name || "—"}</td>
                    <td>{a.pets?.clients?.full_name || "—"}</td>
                    <td>{Array.isArray(a.services) ? a.services.join(", ") : a.services || ""}</td>
                    <td className="text-right">
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

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Start on Monday
  return new Date(d.setDate(diff));
}
