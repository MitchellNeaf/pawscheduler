// src/pages/PetAppointments.jsx
import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";

const toYMD = (d) => d.toLocaleDateString("en-CA");

const START_HOUR = 6;
const END_HOUR = 21;

const TIME_SLOTS = [];
for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
  for (let min of [0, 15, 30, 45]) {
    TIME_SLOTS.push(
      `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`
    );
  }
}

const SERVICE_OPTIONS = [
  "Wash",
  "Cut",
  "Nails",
  "Deshedding",
  "Tick Treatment",
  "Teeth Cleaning",
  "Ear Cleaning",
  "Other",
];

export default function PetAppointments() {
  const { petId } = useParams();
  const [user, setUser] = useState(null);
  const [pet, setPet] = useState(null);
  const [appointments, setAppointments] = useState([]);

  const [form, setForm] = useState({
    date: "",
    time: "",
    duration_min: 15,
    services: [],
    notes: "",
    amount: "",
  });

  const [otherService, setOtherService] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  // NEW STATES
  const [workingRange, setWorkingRange] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [override, setOverride] = useState(false);
  const [vacationBlocks, setVacationBlocks] = useState([]);

  const [searchParams] = useSearchParams();
  const editIdFromURL = searchParams.get("edit");
  const cloneIdFromURL = searchParams.get("clone");
  const autoShift = searchParams.get("autoShift") === "true";

  // ---------------- LOAD USER ----------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // ---------------- LOAD VACATIONS ----------------
  const loadVacations = useCallback(
    async (date) => {
      if (!user || !date) return [];

      const { data } = await supabase
        .from("vacation_days")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("date", date);

      if (!data || data.length === 0) return [];

      const v = [];

      data.forEach((vac) => {
        const fullDay = !vac.start_time && !vac.end_time;
        if (fullDay) {
          v.push({ type: "full" });
        } else {
          v.push({
            type: "partial",
            start: vac.start_time,
            end: vac.end_time,
          });
        }
      });

      return v;
    },
    [user]
  );

  // ---------------- LOAD EVERYTHING FOR A DATE ----------------
  const loadScheduleForDate = useCallback(
    async (selectedDate) => {
      if (!selectedDate || !user) return;

      // VACATIONS FIRST
      const vacationInfo = await loadVacations(selectedDate);
      setVacationBlocks(vacationInfo);

      // FULL DAY OFF
      if (vacationInfo.some((v) => v.type === "full")) {
        setWorkingRange([]);
        setUnavailable([...TIME_SLOTS]);
        return;
      }

      const [y, m, d] = selectedDate.split("-").map(Number);
      const weekday = new Date(y, m - 1, d).getDay();

      // Working hours
      const { data: hours } = await supabase
        .from("working_hours")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("weekday", weekday)
        .maybeSingle();

      if (!hours) {
        setWorkingRange([]);
        setUnavailable([...TIME_SLOTS]);
        return;
      }

      const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
      const endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
      const range = TIME_SLOTS.slice(startIdx, endIdx + 1);
      setWorkingRange(range);

      // Breaks
      const { data: breaks } = await supabase
        .from("working_breaks")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("weekday", weekday);

      let breakBlocked = new Set();
      (breaks || []).forEach((b) => {
        const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
        const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
        TIME_SLOTS.slice(bi, ei + 1).forEach((s) => breakBlocked.add(s));
      });

      // Existing appts
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, time, duration_min")
        .eq("date", selectedDate)
        .eq("groomer_id", user.id);

      let apptBlocked = new Set();
      (appts || []).forEach((a) => {
        if (a.id === editingId) return;
        const t = a.time?.slice(0, 5);
        const idx = TIME_SLOTS.indexOf(t);
        const blocks = Math.ceil((a.duration_min || 15) / 15);
        for (let i = 0; i < blocks; i++) {
          apptBlocked.add(TIME_SLOTS[idx + i]);
        }
      });

      // Vacation partial
      const vacationPartial = new Set();
      vacationInfo.forEach((vac) => {
        if (vac.type === "partial") {
          const bi = TIME_SLOTS.indexOf(vac.start);
          const ei = TIME_SLOTS.indexOf(vac.end);
          TIME_SLOTS.slice(bi, ei + 1).forEach((s) => vacationPartial.add(s));
        }
      });

      setUnavailable([
        ...new Set([...breakBlocked, ...apptBlocked, ...vacationPartial]),
      ]);
    },
    [user, editingId, loadVacations]
  );

  // ---------------- EDIT ----------------
  const handleEdit = useCallback(
    (appt) => {
      const parsedServices = Array.isArray(appt.services)
        ? appt.services
        : typeof appt.services === "string"
        ? appt.services.split(",").map((s) => s.trim())
        : [];

      setForm({
        date: appt.date,
        time: appt.time?.slice(0, 5) || "",
        duration_min: String(appt.duration_min || 15),
        services: parsedServices,
        notes: appt.notes || "",
        amount: appt.amount || "",
      });

      setEditingId(appt.id);
      setOverride(false);
      loadScheduleForDate(appt.date);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [loadScheduleForDate]
  );

  // ---------------- LOAD PET + APPTS ----------------
  useEffect(() => {
    const loadData = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const currentUser = auth.user;
      setUser(currentUser);

      const { data: petData } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .eq("groomer_id", currentUser.id)
        .maybeSingle();

      if (!petData) {
        setPet(null);
        setAppointments([]);
        setLoading(false);
        return;
      }

      const { data: apptData } = await supabase
        .from("appointments")
        .select("*")
        .eq("pet_id", petId)
        .eq("groomer_id", currentUser.id)
        .order("created_at", { ascending: false });

      setPet(petData);
      setAppointments(apptData || []);
      setLoading(false);

      if (editIdFromURL) {
        const a = apptData.find((x) => x.id === editIdFromURL);
        if (a) handleEdit(a);
      }

      if (cloneIdFromURL) {
        const a = apptData.find((x) => x.id === cloneIdFromURL);
        if (a) {
          const parsedServices = Array.isArray(a.services)
            ? a.services
            : typeof a.services === "string"
            ? a.services.split(",").map((s) => s.trim())
            : [];

          let newDate = a.date;
          if (autoShift) {
            const d = new Date(a.date);
            d.setDate(d.getDate() + 28);
            newDate = toYMD(d);
          }

          setForm({
            date: newDate,
            time: a.time?.slice(0, 5) || "",
            duration_min: String(a.duration_min || 15),
            services: parsedServices,
            notes: a.notes || "",
            amount: a.amount || "",
          });

          loadScheduleForDate(newDate);
        }
      }
    };

    loadData();
  }, [
    petId,
    editIdFromURL,
    cloneIdFromURL,
    autoShift,
    handleEdit,
    loadScheduleForDate,
  ]);

  // ---------------- FORM CHANGE ----------------
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "date") {
      setForm((p) => ({ ...p, date: value, time: "" }));
      loadScheduleForDate(value);
      return;
    }

    if (name === "time" && unavailable.includes(value)) {
      const ok = window.confirm(`${value} is blocked. Override anyway?`);
      if (!ok) {
        setForm((p) => ({ ...p, time: "" }));
        setOverride(false);
        return;
      }
      setOverride(true);
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  // ---------------- TOGGLE SERVICES ----------------
  const toggleService = (service) => {
    if (service === "Other") return;

    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  // ---------------- SAVE APPOINTMENT ----------------
  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    const finalServices = otherService
      ? [...form.services.filter((s) => s !== "Other"), otherService]
      : form.services;

    const payload = {
      groomer_id: user.id,
      pet_id: petId,
      date: form.date,
      time: form.time,
      services: finalServices,
      notes: form.notes,
      duration_min: Number(form.duration_min),
      amount: form.amount ? parseFloat(form.amount) : null,
    };

    let result;
    if (editingId) {
      result = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", editingId)
        .eq("groomer_id", user.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("appointments")
        .insert([payload])
        .select()
        .single();
    }

    const { data } = result;

    if (editingId) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === editingId ? data : a))
      );
    } else {
      setAppointments((prev) => [data, ...prev]);
    }

    setForm({
      date: "",
      time: "",
      services: [],
      notes: "",
      duration_min: 15,
      amount: "",
    });
    setOtherService("");
    setEditingId(null);
    setOverride(false);
  };

  // ---------------- DELETE ----------------
  const handleDelete = async (id) => {
    if (!user) return;
    const ok = window.confirm("Delete this appointment?");
    if (!ok) return;

    await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  // ---------------- REBOOK ----------------
  const handleRebook = (date, time) => {
    const d = new Date(`${date}T${time}`);
    d.setDate(d.getDate() + 28);

    const newDate = toYMD(d);
    setForm((p) => ({ ...p, date: newDate }));
    loadScheduleForDate(newDate);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ---------------- RENDER ----------------
  if (loading) return <div className="p-6">Loading...</div>;

  const isFullVacation =
    vacationBlocks.some((v) => v.type === "full") && form.date;

  return (
    <div className="p-6">
      <Link
        to={`/clients/${pet?.client_id}`}
        className="text-blue-600 underline"
      >
        &larr; Back to Pets
      </Link>

      <h1 className="text-xl font-bold mt-2 mb-4">
        Appointments for {pet?.name}
      </h1>

      <form onSubmit={handleAddOrUpdate} className="space-y-3 mb-6">
        <input
          type="date"
          name="date"
          value={form.date}
          onChange={handleChange}
          required
          className="border p-2 w-full rounded"
        />

        {/* TIME SELECT — WORKING HOURS + BREAKS + VACATIONS */}
        <select
          name="time"
          value={form.time}
          onChange={handleChange}
          required
          className={`border p-2 w-full rounded ${
            isFullVacation ? "bg-red-100" : ""
          }`}
          disabled={!workingRange.length || isFullVacation}
        >
          <option value="">
            {isFullVacation
              ? "Day Off — Vacation"
              : workingRange.length
              ? "Select time"
              : "Closed — no working hours"}
          </option>

          {!isFullVacation &&
            workingRange
              .filter((slot, idx) => {
                const blocks = Math.ceil(
                  Number(form.duration_min || 15) / 15
                );
                const windowSlots = workingRange.slice(
                  idx,
                  idx + blocks
                );
                if (windowSlots.length < blocks) return false;
                if (
                  !override &&
                  windowSlots.some((s) => unavailable.includes(s))
                )
                  return false;
                return true;
              })
              .map((slot) => (
                <option key={slot} value={slot}>
                  {unavailable.includes(slot) && !override
                    ? `⛔ ${slot} (Blocked)`
                    : slot}
                </option>
              ))}
        </select>

        {/* DURATION */}
        <select
          name="duration_min"
          value={form.duration_min}
          onChange={handleChange}
          required
          className="border p-2 w-full rounded"
        >
          {[15, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>

        {/* SERVICES */}
        <div>
          <label className="font-medium block mb-1">Services</label>
          <div className="grid grid-cols-2 gap-1">
            {SERVICE_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.services.includes(s)}
                  onChange={() => toggleService(s)}
                />
                {s}
              </label>
            ))}
          </div>

          {form.services.includes("Other") && (
            <input
              type="text"
              value={otherService}
              onChange={(e) => setOtherService(e.target.value)}
              placeholder="Enter other service…"
              className="mt-2 border p-2 w-full rounded"
            />
          )}
        </div>

        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          placeholder="Notes"
          className="border p-2 w-full rounded"
        />

        <input
          type="number"
          name="amount"
          value={form.amount}
          onChange={handleChange}
          placeholder="Amount (e.g. 45.00)"
          step="0.01"
          min="0"
          className="border p-2 w-full rounded"
        />

        <button className="bg-emerald-600 text-white px-4 py-2 rounded">
          {editingId ? "Update Appointment" : "Add Appointment"}
        </button>
      </form>

      {/* LIST */}
      <ul className="space-y-3">
        {appointments.length === 0 ? (
          <p className="text-gray-600">No appointments yet.</p>
        ) : (
          appointments.map((appt) => (
            <li key={appt.id} className="border p-3 rounded">
              <div className="font-semibold">
                {appt.date} at {appt.time?.slice(0, 5)}
              </div>

              {appt.services && (
                <div className="text-sm mt-1">
                  Services:{" "}
                  {Array.isArray(appt.services)
                    ? appt.services.join(", ")
                    : appt.services}
                </div>
              )}

              {appt.notes && (
                <div className="text-sm text-gray-600 mt-1">
                  {appt.notes}
                </div>
              )}

              {appt.amount && (
                <div className="text-sm mt-1">
                  💵 Amount: ${parseFloat(appt.amount).toFixed(2)}
                </div>
              )}

              <div className="mt-2 flex gap-4 text-sm">
                <button
                  onClick={() => handleRebook(appt.date, appt.time)}
                  className="text-emerald-600 underline"
                >
                  🔁 Rebook 4 Weeks
                </button>
                <button
                  onClick={() => handleEdit(appt)}
                  className="text-blue-600 underline"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleDelete(appt.id)}
                  className="text-red-600 underline"
                >
                  🗑 Delete
                </button>
              </div>

              <div className="flex items-center gap-6 mt-2 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={appt.confirmed || false}
                    onChange={async () => {
                      const { data } = await supabase
                        .from("appointments")
                        .update({ confirmed: !appt.confirmed })
                        .eq("id", appt.id)
                        .eq("groomer_id", user.id)
                        .select()
                        .single();

                      setAppointments((prev) =>
                        prev.map((x) => (x.id === appt.id ? data : x))
                      );
                    }}
                  />
                  Confirmed
                </label>

                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={appt.no_show || false}
                    onChange={async () => {
                      const { data } = await supabase
                        .from("appointments")
                        .update({ no_show: !appt.no_show })
                        .eq("id", appt.id)
                        .eq("groomer_id", user.id)
                        .select()
                        .single();

                      setAppointments((prev) =>
                        prev.map((x) => (x.id === appt.id ? data : x))
                      );
                    }}
                  />
                  No-Show
                </label>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
