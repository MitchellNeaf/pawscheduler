import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";

export default function UnpaidAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalUnpaidAmount, setTotalUnpaidAmount] = useState(0);

  useEffect(() => {
    const fetchUnpaid = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          date,
          time,
          duration_min,
          services,
          notes,
          confirmed,
          no_show,
          paid,
          amount,
          pets (
            id,
            name,
            tags,
            client_id,
            clients ( id, full_name, phone )
          )
        `)
        .eq("paid", false)
        .or("no_show.eq.false,no_show.is.null")
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (error) {
        console.error("Error fetching unpaid appointments:", error.message);
        setAppointments([]);
        setTotalUnpaidAmount(0);
        setLoading(false);
        return;
      }

      const now = new Date();

      // Build local end-time from date+time+duration (avoid UTC parsing)
      const endAsLocal = (appt) => {
        const [yy, mm, dd] = String(appt.date || "")
          .split("-")
          .map((n) => parseInt(n, 10));
        const [HH = 0, MM = 0, SS = 0] = String(appt.time || "")
          .split(":")
          .map((n) => parseInt(n, 10));
        const start = new Date(yy, (mm || 1) - 1, dd, HH, MM, SS || 0, 0);
        const durMin = Number.isFinite(appt.duration_min) ? appt.duration_min : 15;
        return new Date(start.getTime() + durMin * 60000);
      };

      const filtered = (data || []).filter((appt) => endAsLocal(appt) < now);
      setAppointments(filtered);

      const total = filtered.reduce((sum, appt) => {
        const raw = typeof appt.amount === "string" ? parseFloat(appt.amount) : appt.amount;
        const amt = Number.isFinite(raw) ? raw : 0;
        return sum + amt;
      }, 0);

      setTotalUnpaidAmount(total);
      setLoading(false);
    };

    fetchUnpaid();
  }, []);

  const handleMarkAsPaid = async (id, amount) => {
    const { error } = await supabase.from("appointments").update({ paid: true }).eq("id", id);
    if (error) {
      alert("Error marking as paid: " + error.message);
      return;
    }

    setAppointments((prev) => {
      const updated = prev.filter((appt) => appt.id !== id);
      const raw = typeof amount === "string" ? parseFloat(amount) : amount;
      const amt = Number.isFinite(raw) ? raw : 0;
      setTotalUnpaidAmount((prevTotal) => prevTotal - amt);
      return updated;
    });
  };

  if (loading) return <main className="px-4 py-6">Loading unpaid appointments...</main>;

  return (
    <main>
      <Link to="">&larr; Back to Home</Link>

      <h1 className="mt-2">Unpaid Appointments</h1>

      {totalUnpaidAmount > 0 && (
        <div className="stat mb-4">
          <div className="stat-label">Total Unpaid</div>
          <div className="stat-value text-red-700">${totalUnpaidAmount.toFixed(2)}</div>
        </div>
      )}

      {appointments.length === 0 ? (
        <p className="text-gray-600">🎉 You're all caught up! No unpaid appointments.</p>
      ) : (
        <div className="grid gap-4">
          {appointments.map((appt) => {
            const start = appt.time ? appt.time.slice(0, 5) : "";
            const services = appt.services || [];

            return (
              <div key={appt.id} className="card">
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        {appt.pets?.name} — {appt.pets?.clients?.full_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {appt.date} at {start} • {appt.duration_min} min
                      </div>
                    </div>

                    <div className="chip chip-warning">Unpaid</div>
                  </div>

                  {services.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {services.map((svc) => (
                        <span key={svc} className="chip">
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

                  {appt.notes && (
                    <div className="text-sm text-gray-600 italic">{appt.notes}</div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {typeof appt.amount !== "undefined" && appt.amount !== null && (
                      <span className="font-medium">
                        ${(
                          typeof appt.amount === "string" ? parseFloat(appt.amount) : appt.amount
                        ).toFixed(2)}
                      </span>
                    )}

                    {appt.pets?.clients?.phone && (
                      <>
                        <a href={`tel:${appt.pets.clients.phone}`} className="text-xs">
                          📞 Call
                        </a>
                        <a href={`sms:${appt.pets.clients.phone}`} className="text-xs">
                          ✉️ Text
                        </a>
                      </>
                    )}

                    <button className="btn-secondary text-xs">📤 Send Reminder</button>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => handleMarkAsPaid(appt.id, appt.amount)}
                      className="btn-primary"
                    >
                      ✅ Mark as Paid
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
