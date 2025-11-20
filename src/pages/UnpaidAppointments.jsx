import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";

export default function UnpaidAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalUnpaidAmount, setTotalUnpaidAmount] = useState(0);
  const [user, setUser] = useState(null);

  // Load logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;

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
          groomer_id,
          pets (
            id,
            name,
            tags,
            client_id,
            clients ( id, full_name, phone )
          )
        `)
        .eq("groomer_id", user.id)
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

      // Only include past appointments
      const now = new Date();
      const endAsLocal = (appt) => {
        const [yy, mm, dd] = appt.date.split("-").map(Number);
        const [HH = 0, MM = 0] = (appt.time || "").split(":").map(Number);
        const start = new Date(yy, mm - 1, dd, HH, MM);
        const dur = Number.isFinite(appt.duration_min) ? appt.duration_min : 15;
        return new Date(start.getTime() + dur * 60000);
      };

      const filtered = (data || []).filter((appt) => endAsLocal(appt) < now);
      setAppointments(filtered);

      const total = filtered.reduce((sum, appt) => {
        const raw =
          typeof appt.amount === "string"
            ? parseFloat(appt.amount)
            : appt.amount;
        return sum + (Number.isFinite(raw) ? raw : 0);
      }, 0);

      setTotalUnpaidAmount(total);
      setLoading(false);
    };

    fetchUnpaid();
  }, [user]);

  const handleMarkAsPaid = async (id, amount) => {
    if (!user) return;

    const { error } = await supabase
      .from("appointments")
      .update({ paid: true })
      .eq("id", id)
      .eq("groomer_id", user.id);

    if (error) {
      alert("Error marking as paid: " + error.message);
      return;
    }

    // Remove from list visually
    setAppointments((prev) => {
      const updated = prev.filter((appt) => appt.id !== id);
      const raw = typeof amount === "string" ? parseFloat(amount) : amount;
      const amt = Number.isFinite(raw) ? raw : 0;

      setTotalUnpaidAmount((prevAmount) => prevAmount - amt);

      return updated;
    });
  };

  // ⭐ LOADING SKELETON
  if (loading) {
    return (
      <main className="px-4 py-6 space-y-4">
        <div className="h-6 w-64 bg-gray-200 animate-pulse rounded"></div>
        <Loader />
        <Loader />
        <Loader />
      </main>
    );
  }

  return (
    <main className="px-4 py-6 space-y-4">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Unpaid Appointments</h1>

      {/* SUMMARY */}
      {totalUnpaidAmount > 0 && (
        <div className="stat mb-4">
          <div className="stat-label">Total Unpaid</div>
          <div className="stat-value text-red-700">
            ${totalUnpaidAmount.toFixed(2)}
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {appointments.length === 0 ? (
        <p className="text-gray-600 text-sm">
          🎉 You're all caught up — no unpaid appointments.
        </p>
      ) : (
        <div className="grid gap-4">
          {appointments.map((appt) => {
            const start = (appt.time || "").slice(0, 5);
            const services = appt.services || [];

            return (
              <div
                key={appt.id}
                className="card border-l-4 border-red-400 shadow-md"
              >
                <div className="card-body space-y-3">
                  {/* HEADER SECTION */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        {appt.pets?.name}
                        <span className="text-gray-500 font-normal">
                          {" "}
                          — {appt.pets?.clients?.full_name}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {appt.date} at {start} • {appt.duration_min} min
                      </div>
                    </div>
                    <div className="chip chip-warning">Unpaid</div>
                  </div>

                  {/* SERVICES */}
                  {services.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {services.map((svc) => (
                        <span key={svc} className="chip chip-brand">
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* NOTES */}
                  {appt.notes && (
                    <div className="text-sm italic text-gray-600">
                      {appt.notes}
                    </div>
                  )}

                  {/* CLIENT CONTACT & AMOUNT */}
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {typeof appt.amount === "number" && (
                      <span className="font-semibold text-gray-800">
                        💲{appt.amount.toFixed(2)}
                      </span>
                    )}

                    {appt.pets?.clients?.phone && (
                      <>
                        <a
                          href={`tel:${appt.pets.clients.phone}`}
                          className="text-xs text-blue-600"
                        >
                          📞 Call
                        </a>
                        <a
                          href={`sms:${appt.pets.clients.phone}`}
                          className="text-xs text-blue-600"
                        >
                          ✉️ Text
                        </a>
                      </>
                    )}

                    <button className="btn-secondary text-xs">
                      📤 Send Reminder
                    </button>
                  </div>

                  {/* ACTION BUTTON */}
                  <div>
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
