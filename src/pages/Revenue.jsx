import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";

export default function Revenue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [includeUnpaid, setIncludeUnpaid] = useState(false);

  // Load logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Load revenue data
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

  if (loading) {
    return (
      <main className="p-6 space-y-6">
        <Loader />
      </main>
    );
  }

  /* ----------------- FILTER LOGIC ----------------- */
  const filtered = appointments.filter((a) => {
    const d = new Date(a.date);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(endDate)) return false;
    if (!includeUnpaid && !a.paid) return false;
    return true;
  });

  /* ----------------- CALCULATIONS ----------------- */
  const totalRevenue = filtered.reduce((sum, a) => sum + (a.amount || 0), 0);

  // 2. Revenue by Service
  const revenueByService = {};
  filtered.forEach((a) => {
    const list = Array.isArray(a.services) ? a.services : [a.services];
    list.forEach((s) => {
      if (!s) return;
      revenueByService[s] = (revenueByService[s] || 0) + (a.amount || 0);
    });
  });

  // 3. No-show revenue loss
  const noShowLoss = appointments
    .filter((a) => a.no_show)
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  // 5. Monthly trend
  const revenueByMonth = {};
  appointments.forEach((a) => {
    const key = a.date.slice(0, 7); // "YYYY-MM"
    revenueByMonth[key] = (revenueByMonth[key] || 0) + (a.amount || 0);
  });

  return (
    <main className="px-4 py-6 max-w-4xl mx-auto space-y-6">
      <Link to="/" className="text-blue-600 text-sm underline">
        ← Back
      </Link>

      <h1 className="text-2xl font-bold">Revenue</h1>

      {/* ----------------- FILTERS ----------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded border">
        <div>
          <label className="text-sm">Start Date</label>
          <input
            type="date"
            className="border rounded p-1 w-full"
            value={startDate || ""}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm">End Date</label>
          <input
            type="date"
            className="border rounded p-1 w-full"
            value={endDate || ""}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            checked={includeUnpaid}
            onChange={() => setIncludeUnpaid((x) => !x)}
          />
          <span className="text-sm">Include Unpaid</span>
        </label>

        <div className="text-right mt-5">
          <div className="font-bold text-lg">${totalRevenue.toFixed(2)}</div>
          <div className="text-xs text-gray-600">Filtered Total</div>
        </div>
      </div>

      {/* ----------------- NO SHOW LOSS ----------------- */}
      <div className="p-4 bg-red-50 border rounded">
        <div className="font-bold text-red-700">
          Lost Revenue (No-Shows): ${noShowLoss.toFixed(2)}
        </div>
      </div>

      {/* ----------------- REVENUE BY SERVICE ----------------- */}
      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Revenue by Service</h2>
        {Object.keys(revenueByService).length === 0 ? (
          <p className="text-sm text-gray-500">No data.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {Object.entries(revenueByService).map(([service, amt]) => (
              <li key={service}>
                <span className="font-medium">{service}:</span> $
                {amt.toFixed(2)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ----------------- MONTHLY TREND ----------------- */}
      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Monthly Trend</h2>
        <ul className="text-sm space-y-1">
          {Object.entries(revenueByMonth).map(([month, amt]) => (
            <li key={month}>
              <span className="font-medium">{month}:</span> $
              {amt.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>

      {/* ----------------- APPOINTMENT TABLE ----------------- */}
      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Appointments</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-gray-600">
                <th>Date</th>
                <th>Time</th>
                <th>Pet</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="bg-white hover:bg-gray-50">
                  <td>{a.date}</td>
                  <td>{a.time?.slice(0, 5)}</td>
                  <td>{a.pets?.name || "—"}</td>
                  <td>{a.pets?.clients?.full_name || "—"}</td>
                  <td>${Number(a.amount || 0).toFixed(2)}</td>
                  <td>{a.paid ? "Paid" : "Unpaid"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
