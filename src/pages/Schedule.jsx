import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";

const toYMD = (d) => d.toLocaleDateString("en-CA");
const parseYMD = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export default function Schedule() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("today");
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);

  // Load logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchAppointments = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          pet_id,
          groomer_id,
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
        .eq("groomer_id", user.id)
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (error) console.error("Error fetching schedule:", error.message);

      setAppointments(data || []);
      setLoading(false);
    };

    fetchAppointments();
  }, [user]);

  // DELETE HANDLER
  const handleDelete = async (id) => {
    if (!user) return;

    const confirmDelete = window.confirm("Delete this appointment?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    if (error) {
      alert("Error deleting appointment: " + error.message);
      return;
    }

    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  // REBOOK 4 WEEKS
  const handleRebook = async (appt) => {
    if (!user) return;

    const base = parseYMD(appt.date);
    base.setDate(base.getDate() + 28);
    const newDate = toYMD(base);

    const { error } = await supabase.from("appointments").insert({
      groomer_id: user.id,
      pet_id: appt.pet_id,
      date: newDate,
      time: appt.time,
      duration_min: appt.duration_min,
      services: appt.services,
      notes: appt.notes || "",
      confirmed: false,
      no_show: false,
      paid: false,
      amount: appt.amount || null,
    });

    if (error) return alert("Error rebooking: " + error.message);
    alert("Rebooked 4 weeks later.");
  };

  if (loading) {
    return (
      <main className="px-4 py-6 space-y-4">
        <div className="h-6 w-48 bg-gray-200 animate-pulse rounded"></div>
        <Loader />
        <Loader />
        <Loader />
      </main>
    );
  }

  // FILTERING
  const today = new Date();
  const todayStr = toYMD(today);

  const filterAppointments = () => {
    return appointments.filter((appt) => {
      const apptDate = parseYMD(appt.date);

      if (filter === "today") return appt.date === todayStr;

      if (filter === "thisWeek") {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + 7);
        return apptDate >= today && apptDate <= endOfWeek;
      }

      if (filter === "thisMonth") {
        return (
          apptDate.getFullYear() === today.getFullYear() &&
          apptDate.getMonth() === today.getMonth()
        );
      }

      if (filter === "past30") {
        const past30 = new Date(today);
        past30.setDate(today.getDate() - 30);
        return apptDate >= past30 && apptDate < today;
      }

      return true;
    });
  };

  const filteredAppointments = filterAppointments().filter((appt) => {
    const lower = search.toLowerCase();
    return (
      appt.pets?.name?.toLowerCase().includes(lower) ||
      appt.pets?.clients?.full_name?.toLowerCase().includes(lower) ||
      appt.pets?.tags?.some((tag) => tag.toLowerCase().includes(lower))
    );
  });

  // UNPAID TODAY
  const unpaidToday = filteredAppointments.filter((appt) => {
    // ⭐ FIX — LOCAL DATE CONSTRUCTION
    const [y, m, d] = appt.date.split("-").map(Number);
    const [H, M] = (appt.time || "00:00").split(":").map(Number);
    const start = new Date(y, m - 1, d, H, M); // ⭐ FIX

    const end = new Date(start.getTime() + (appt.duration_min || 15) * 60000);
    return (
      appt.date === todayStr &&
      !appt.paid &&
      !appt.no_show &&
      end <= new Date()
    );
  });

  const totalUnpaidToday = unpaidToday.length;
  const totalUnpaidAmount = unpaidToday.reduce(
    (sum, a) => sum + (a.amount || 0),
    0
  );

  return (
    <main className="px-4 py-6 space-y-4">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

      {totalUnpaidToday > 0 && (
        <div className="stat mb-4">
          <div className="stat-label">Unpaid Today</div>
          <div className="stat-value text-red-700">
            {totalUnpaidToday} appt
            {totalUnpaidToday > 1 ? "s" : ""} • $
            {totalUnpaidAmount.toFixed(2)}
          </div>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="card mb-4">
        <div className="card-body flex flex-col md:flex-row md:items-center gap-3">
          <input
            type="text"
            placeholder="Search pet, client, or tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-64"
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="today">Today</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="past30">Past 30 Days</option>
          </select>
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <p className="text-gray-600 italic">No appointments match this filter.</p>
      ) : (
        <div className="grid gap-4">
          {filteredAppointments.map((appt) => {
            const start = (appt.time || "00:00").slice(0, 5);
            const end = getEndTime(start, appt.duration_min || 15);

            // ⭐ FIX — replace UTC-based date parsing
            const [y, m, d] = appt.date.split("-").map(Number);
            const [H, M] = start.split(":").map(Number);
            const localStart = new Date(y, m - 1, d, H, M); // ⭐ FIX

            const isPast = localStart < new Date(); // ⭐ FIX

            return (
              <div
                key={appt.id}
                className={`card transition-all ${
                  isPast ? "opacity-60" : "opacity-100"
                }`}
              >
                <div className="card-body space-y-2">
                  {/* DATE + TIME */}
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-500">{appt.date}</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {start} – {end}
                      </div>
                    </div>

                    <div className="text-sm text-gray-500">
                      {appt.duration_min} min
                    </div>
                  </div>

                  {/* PET */}
                  <div className="text-xl font-bold text-gray-800">
                    {appt.pets?.name}
                  </div>

                  {/* TAGS */}
                  {appt.pets?.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {appt.pets.tags.map((tag) =>
                        ["Bites", "Anxious", "Aggressive", "Matting"].includes(
                          tag
                        ) ? (
                          <span key={tag} className="chip chip-danger">
                            ⚠ {tag}
                          </span>
                        ) : (
                          <span key={tag} className="chip">
                            {tag}
                          </span>
                        )
                      )}
                    </div>
                  )}

                  {/* CLIENT */}
                  <div className="text-sm text-gray-600 flex flex-wrap gap-3 items-center">
                    <span>{appt.pets?.clients?.full_name}</span>
                    {appt.pets?.clients?.phone && (
                      <>
                        <a
                          href={`tel:${appt.pets.clients.phone}`}
                          className="text-blue-600 text-xs"
                        >
                          📞 Call
                        </a>
                        <a
                          href={`sms:${appt.pets.clients.phone}`}
                          className="text-blue-600 text-xs"
                        >
                          ✉️ Text
                        </a>
                      </>
                    )}
                  </div>

                  {/* SERVICES */}
                  {appt.services?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {appt.services.map((svc) => (
                        <span key={svc} className="chip chip-brand">
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* PRICE */}
                  {typeof appt.amount === "number" && (
                    <div
                      className={`text-sm font-medium ${
                        appt.paid ? "text-gray-600" : "text-red-600"
                      }`}
                    >
                      💲 {appt.amount.toFixed(2)}{" "}
                      {appt.paid ? "(Paid)" : "(Unpaid)"}
                    </div>
                  )}

                  {/* NOTES */}
                  {appt.notes && (
                    <div className="text-sm italic text-gray-500">
                      {appt.notes}
                    </div>
                  )}

                  {/* ACTION BUTTONS */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      className="btn-secondary"
                      onClick={() => handleRebook(appt)}
                    >
                      🔁 Rebook 4 Weeks
                    </button>

                    <Link
                      to={`/pets/${appt.pets.id}/appointments?edit=${appt.id}`}
                      className="btn-secondary"
                    >
                      ✏️ Edit
                    </Link>

                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(appt.id)}
                    >
                      🗑 Delete
                    </button>

                    {/* Toggles */}
                    <ToggleCheckbox
                      label="Confirmed"
                      field="confirmed"
                      appt={appt}
                      user={user}
                      setAppointments={setAppointments}
                    />
                    <ToggleCheckbox
                      label="No-Show"
                      field="no_show"
                      appt={appt}
                      user={user}
                      setAppointments={setAppointments}
                    />
                    <ToggleCheckbox
                      label="Paid"
                      field="paid"
                      appt={appt}
                      user={user}
                      setAppointments={setAppointments}
                    />
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

function ToggleCheckbox({ label, field, appt, user, setAppointments }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={appt[field] || false}
        onChange={async () => {
          const { data, error } = await supabase
            .from("appointments")
            .update({ [field]: !appt[field] })
            .eq("id", appt.id)
            .eq("groomer_id", user.id)
            .select(`*, pets (*, clients (*))`)
            .single();

          if (!error) {
            setAppointments((prev) =>
              prev.map((a) => (a.id === appt.id ? data : a))
            );
          }
        }}
      />
      {label}
    </label>
  );
}

function getEndTime(start, durationMin) {
  if (!start) return "—";
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + durationMin;
  return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(
    endMin % 60
  ).padStart(2, "0")}`;
}
