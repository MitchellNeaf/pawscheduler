import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";

// Local date helpers
const toYMD = (d) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in LOCAL time
const parseYMD = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };

export default function Schedule() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("today");
  const [search, setSearch] = useState("");
  const [savingRebookId, setSavingRebookId] = useState(null);

  useEffect(() => {
    const fetchAppointments = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          pet_id,
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
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (error) {
        console.error("Error fetching schedule:", error.message);
      } else {
        setAppointments(data || []);
      }
      setLoading(false);
    };

    fetchAppointments();
  }, []);

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this appointment?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (!error) {
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } else {
      alert("Error deleting appointment: " + error.message);
    }
  };

  // ✅ Add this async handler (fixes the orphaned await build error)
  const handleQuickRebook = async (appt, weeks = 4) => {
    try {
      setSavingRebookId(appt.id);

      // Compute new date string in local time
      const base = parseYMD(appt.date);
      base.setDate(base.getDate() + weeks * 7);
      const newDateStr = toYMD(base);

      const petId = appt.pet_id ?? appt.pets?.id;

      const { error } = await supabase.from("appointments").insert({
        pet_id: petId,
        date: newDateStr,
        time: appt.time,
        duration_min: Number.isFinite(appt.duration_min) ? appt.duration_min : 60,
        services: appt.services ?? [],
        notes: appt.notes ?? "",
        amount: typeof appt.amount === "number" ? appt.amount : null,
        confirmed: false,
        no_show: false,
        paid: false,
      });

      if (error) {
        console.error("Error rebooking:", error.message);
        alert("Error rebooking: " + error.message);
        return;
      }

      // Refresh list so the new appt shows
      const { data, error: fetchErr } = await supabase
        .from("appointments")
        .select(`
          id,
          pet_id,
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
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (!fetchErr) setAppointments(data || []);
      alert("Rebooked for 4 weeks later.");
    } finally {
      setSavingRebookId(null);
    }
  };

  if (loading) return <main className="px-4 py-6">Loading schedule...</main>;

  const DANGER_TAGS = ["Bites", "Anxious", "Aggressive", "Matting"];
  const todayStr = toYMD(new Date());

  const filterAppointments = () => {
    const today = new Date();
    const todayYmd = toYMD(today);

    return appointments.filter((appt) => {
      const apptDate = parseYMD(appt.date);

      if (filter === "today") return appt.date === todayYmd;

      if (filter === "thisWeek") {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + 7);
        return apptDate.getTime() >= parseYMD(todayYmd).getTime() &&
               apptDate.getTime() <= parseYMD(toYMD(endOfWeek)).getTime();
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
        return apptDate.getTime() >= parseYMD(toYMD(past30)).getTime() &&
               apptDate.getTime() <  parseYMD(todayYmd).getTime();
      }

      return true;
    });
  };

  const filteredAppointments = filterAppointments().filter((appt) => {
    const lowerSearch = search.toLowerCase();
    return (
      appt.pets?.name?.toLowerCase().includes(lowerSearch) ||
      appt.pets?.clients?.full_name?.toLowerCase().includes(lowerSearch) ||
      appt.pets?.tags?.some((tag) => tag.toLowerCase().includes(lowerSearch))
    );
  });

  const unpaidToday = filteredAppointments.filter((appt) => {
    // Build local Date for start
    const [y, m, d] = appt.date.split("-").map(Number);
    const [H, M, S = 0] = (appt.time || "00:00").split(":").map(Number);
    const start = new Date(y, (m || 1) - 1, d, H, M, S || 0, 0);

    // Calculate end time in local timezone
    const dur = Number.isFinite(appt.duration_min) ? appt.duration_min : 15;
    const end = new Date(start.getTime() + dur * 60000);

    const now = new Date();

    return (
      appt.date === todayStr &&
      !appt.paid &&
      !appt.no_show &&
      end <= now // Only include if appointment has ended
    );
  });

  const totalUnpaidToday = unpaidToday.length;
  const totalUnpaidAmount = unpaidToday.reduce((sum, appt) => sum + (appt.amount || 0), 0);

  return (
    <main>
      <Link to="/">&larr; Back to Home</Link>

      <h1 className="mt-2">Upcoming Appointments (Next 7 Days)</h1>

      {totalUnpaidToday > 0 && (
        <div className="stat mb-4">
          <div className="stat-label">Unpaid Today</div>
          <div className="stat-value text-red-700">
            {totalUnpaidToday} appt{totalUnpaidToday > 1 ? "s" : ""} • ${totalUnpaidAmount.toFixed(2)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-3">
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
            >
              <option value="today">Today Only</option>
              <option value="thisWeek">This Week</option>
              <option value="thisMonth">This Month</option>
              <option value="past30">Past 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <p className="text-gray-600">No appointments match filter.</p>
      ) : (
        <div className="grid gap-4">
          {filteredAppointments.map((appt) => {
            const start = (appt.time || "00:00").slice(0, 5); // guard against undefined
            const end = getEndTime(start, appt.duration_min || 15);
            const tags = appt.pets?.tags || [];
            const services = appt.services || [];
            const now = new Date();
            const apptDateTime = new Date(`${appt.date}T${appt.time || "00:00"}`);
            const isPast = apptDateTime < now;

            return (
              <div
                key={appt.id}
                className={`card ${isPast ? "opacity-60" : ""}`}
              >
                <div className="card-body">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                    <div>
                      <div className={`text-sm ${isPast ? "text-gray-400" : "text-gray-500"}`}>
                        {appt.date}
                      </div>
                      <div className="text-lg font-semibold text-gray-800">
                        {start} – {end}
                        {isPast && (
                          <span className="ml-2 text-xs text-red-500 font-medium">Missed?</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 md:mt-0 text-sm text-gray-600">
                      {appt.duration_min} min
                    </div>
                  </div>

                  <div className="text-gray-800 font-bold text-xl mb-1">
                    {appt.pets?.name}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag) =>
                      DANGER_TAGS.includes(tag) ? (
                        <span key={tag} className="chip chip-danger">⚠ {tag}</span>
                      ) : (
                        <span key={tag} className="chip">{tag}</span>
                      )
                    )}
                  </div>

                  <div className="text-sm text-gray-500 mb-2 flex flex-wrap items-center gap-2">
                    Client: {appt.pets?.clients?.full_name}
                    {appt.pets?.clients?.phone && (
                      <>
                        <a href={`tel:${appt.pets.clients.phone}`} className="text-xs">📞 Call</a>
                        <a href={`sms:${appt.pets.clients.phone}`} className="text-xs">✉️ Text</a>
                      </>
                    )}
                  </div>

                  {services?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {services.map((svc) => (
                        <span key={svc} className="chip chip-brand">{svc}</span>
                      ))}
                    </div>
                  )}

                  {typeof appt.amount === "number" && !isNaN(appt.amount) && (
                    <div className={`text-sm font-medium ${appt.paid ? "text-gray-700" : "text-red-600"}`}>
                      💲Price: ${appt.amount.toFixed(2)} {appt.paid ? "(Paid)" : "(Unpaid)"}
                    </div>
                  )}

                  {appt.notes && (
                    <div className="text-sm text-gray-600 italic mb-2">{appt.notes}</div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <button
                      onClick={() => handleQuickRebook(appt, 4)}
                      className="btn-secondary"
                      disabled={savingRebookId === appt.id}
                    >
                      {savingRebookId === appt.id ? "Rebooking…" : "🔁 Rebook 4 weeks"}
                    </button>

                    {appt.pets ? (
                      <Link
                        to={`/pets/${appt.pets.id}/appointments?edit=${appt.id}`}
                        className="btn-secondary"
                      >
                        ✏️ Edit
                      </Link>
                    ) : (
                      <span className="text-gray-400 italic">No pet linked</span>
                    )}

                    <button onClick={() => handleDelete(appt.id)} className="btn-danger">
                      🗑 Delete
                    </button>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={appt.confirmed || false}
                        onChange={async () => {
                          const { data, error } = await supabase
                            .from("appointments")
                            .update({ confirmed: !appt.confirmed })
                            .eq("id", appt.id)
                            .select(`*, pets (*, clients (*))`)
                            .single();
                          if (!error) {
                            setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data : a)));
                          }
                        }}
                      />
                      Confirmed
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={appt.no_show || false}
                        onChange={async () => {
                          const { data, error } = await supabase
                            .from("appointments")
                            .update({ no_show: !appt.no_show })
                            .eq("id", appt.id)
                            .select(`*, pets (*, clients (*))`)
                            .single();
                          if (!error) {
                            setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data : a)));
                          }
                        }}
                      />
                      No-Show
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={appt.paid || false}
                        onChange={async () => {
                          const { data, error } = await supabase
                            .from("appointments")
                            .update({ paid: !appt.paid })
                            .eq("id", appt.id)
                            .select(`*, pets (*, clients (*))`)
                            .single();
                          if (!error) {
                            setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data : a)));
                          }
                        }}
                      />
                      Paid
                    </label>
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

function getEndTime(start, durationMin) {
  if (!start) return "—";
  const [h, m] = start.split(":").map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + durationMin;
  const endHour = Math.floor(endMinutes / 60);
  const endMin = endMinutes % 60;
  return `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
}
