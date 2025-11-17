// src/pages/PetAppointments.jsx
import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const toYMD = (d) => d.toLocaleDateString("en-CA");

const parseYMD = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
};

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
  const [searchParams] = useSearchParams();
  const editIdFromURL = searchParams.get("edit");
  const cloneIdFromURL = searchParams.get("clone");
  const autoShift = searchParams.get("autoShift") === "true";

  const [user, setUser] = useState(null);
  const [pet, setPet] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    date: "",
    time: "",
    duration_min: 15,
    services: [],
    notes: "",
    amount: "",
  });

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [otherService, setOtherService] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [workingRange, setWorkingRange] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [override, setOverride] = useState(false);
  const [vacationBlocks, setVacationBlocks] = useState([]);

  const [vacationDates, setVacationDates] = useState([]);
  const [workingWeekdays, setWorkingWeekdays] = useState([]);

  // Load current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Load vacation days for date
  const loadVacations = useCallback(
    async (date) => {
      if (!user || !date) return [];

      const { data, error } = await supabase
        .from("vacation_days")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("date", date);

      if (error || !data?.length) return [];

      return data.map((vac) => {
        const fullDay = !vac.start_time && !vac.end_time;
        if (fullDay) return { type: "full" };

        const startNorm = vac.start_time ? vac.start_time.slice(0, 5) : null;
        const endNorm = vac.end_time ? vac.end_time.slice(0, 5) : null;

        return {
          type: "partial",
          start: startNorm,
          end: endNorm,
        };
      });
    },
    [user]
  );

  // Load schedule for a given date (working hours, breaks, existing appts, vacation)
  const loadScheduleForDate = useCallback(
    async (selectedDate) => {
      if (!selectedDate || !user) return;

      const vacationInfo = await loadVacations(selectedDate);
      setVacationBlocks(vacationInfo);

      // Full day off
      if (vacationInfo.some((v) => v.type === "full")) {
        setWorkingRange([]);
        setUnavailable([...TIME_SLOTS]);
        return;
      }

      const [y, m, d] = selectedDate.split("-").map(Number);
      const weekday = new Date(y, m - 1, d).getDay();

      // Working hours
      const { data: hours, error: hoursError } = await supabase
        .from("working_hours")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("weekday", weekday)
        .maybeSingle();

      if (hoursError || !hours) {
        setWorkingRange([]);
        setUnavailable([...TIME_SLOTS]);
        return;
      }

      const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
      const endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
      const range =
        startIdx === -1 || endIdx === -1
          ? []
          : TIME_SLOTS.slice(startIdx, endIdx + 1);

      setWorkingRange(range);

      // Breaks
      const { data: breaks } = await supabase
        .from("working_breaks")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("weekday", weekday);

      const breakBlocked = new Set();
      (breaks || []).forEach((b) => {
        const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
        const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
        if (bi === -1 || ei === -1) return;
        TIME_SLOTS.slice(bi, ei + 1).forEach((s) => breakBlocked.add(s));
      });

      // Existing appts
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, time, duration_min")
        .eq("date", selectedDate)
        .eq("groomer_id", user.id);

      const apptBlocked = new Set();
      (appts || []).forEach((a) => {
        if (a.id === editingId) return; // don't block the slot for the appt we're editing
        const t = a.time?.slice(0, 5);
        const idx = TIME_SLOTS.indexOf(t);
        if (idx === -1) return;
        const blocks = Math.ceil((a.duration_min || 15) / 15);
        for (let i = 0; i < blocks; i++) {
          const slot = TIME_SLOTS[idx + i];
          if (slot) apptBlocked.add(slot);
        }
      });

      // Partial vacation
      const vacationPartial = new Set();
      vacationInfo.forEach((vac) => {
        if (vac.type === "partial") {
          const bi = TIME_SLOTS.indexOf(vac.start);
          const ei = TIME_SLOTS.indexOf(vac.end);
          if (bi === -1 || ei === -1) return;
          TIME_SLOTS.slice(bi, ei + 1).forEach((s) =>
            vacationPartial.add(s)
          );
        }
      });

      setUnavailable([
        ...new Set([...breakBlocked, ...apptBlocked, ...vacationPartial]),
      ]);
    },
    [user, editingId, loadVacations]
  );

  // Calendar meta: vacation dates
  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data } = await supabase
        .from("vacation_days")
        .select("date")
        .eq("groomer_id", user.id);

      if (data) setVacationDates(data.map((v) => v.date));
    })();
  }, [user]);

  // Calendar meta: working weekdays
  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data } = await supabase
        .from("working_hours")
        .select("weekday")
        .eq("groomer_id", user.id);

      if (data) {
        const days = Array.from(new Set(data.map((h) => h.weekday)));
        setWorkingWeekdays(days);
      }
    })();
  }, [user]);

  // Helper to parse services on edit/clone
  const parseServices = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((s) => s.trim());
    }
    return [];
  };

  // Start editing an appointment
  const startEdit = (appt) => {
    const parsedServices = parseServices(appt.services);

    setForm({
      date: appt.date,
      time: appt.time?.slice(0, 5) || "",
      duration_min: String(appt.duration_min || 15),
      services: parsedServices,
      notes: appt.notes || "",
      amount: appt.amount || "",
    });

    setReminderEnabled(appt.reminder_enabled ?? true);
    setOtherService("");
    setEditingId(appt.id);
    setOverride(false);
    if (appt.date) loadScheduleForDate(appt.date);
  };

  // Start cloning an appointment
  const startClone = (appt) => {
    const parsedServices = parseServices(appt.services);

    let newDate = appt.date;
    if (autoShift && appt.date) {
      const d = new Date(appt.date);
      d.setDate(d.getDate() + 28);
      newDate = toYMD(d);
    }

    setForm({
      date: newDate,
      time: appt.time?.slice(0, 5) || "",
      duration_min: String(appt.duration_min || 15),
      services: parsedServices,
      notes: appt.notes || "",
      amount: appt.amount || "",
    });

    setReminderEnabled(true);
    setOtherService("");
    setEditingId(null);
    setOverride(false);
    if (newDate) loadScheduleForDate(newDate);
  };

  // Load pet + appointments
  useEffect(() => {
    if (!user || !petId) return;

    const loadData = async () => {
      const { data: petData } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .eq("groomer_id", user.id)
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
        .eq("groomer_id", user.id)
        .order("created_at", { ascending: false });

      setPet(petData);
      setAppointments(apptData || []);
      setLoading(false);

      if (apptData && editIdFromURL) {
        const a = apptData.find((x) => x.id === editIdFromURL);
        if (a) startEdit(a);
      }

      if (apptData && cloneIdFromURL && !editIdFromURL) {
        const a = apptData.find((x) => x.id === cloneIdFromURL);
        if (a) startClone(a);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, petId, editIdFromURL, cloneIdFromURL, autoShift]);

  // Auto-select earliest available time if none chosen yet
  useEffect(() => {
    if (!form.date || !workingRange.length || !form.duration_min) return;
    if (form.time) return;

    const blocks = Math.ceil(Number(form.duration_min) / 15);

    const earliest = workingRange.find((slot, idx) => {
      const windowSlots = workingRange.slice(idx, idx + blocks);
      if (windowSlots.length < blocks) return false;
      if (!override && windowSlots.some((s) => unavailable.includes(s)))
        return false;
      return true;
    });

    if (earliest) {
      setForm((prev) => ({ ...prev, time: earliest }));
    }
  }, [
    form.date,
    form.duration_min,
    form.time,        // ✅ add this
    workingRange,
    unavailable,
    override
  ]);


  // Form change handler
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "date") {
      setForm((p) => ({ ...p, date: value, time: "" }));
      setOverride(false);
      loadScheduleForDate(value);
      return;
    }

    if (name === "time") {
      if (value && unavailable.includes(value) && !override) {
        const ok = window.confirm(`${value} is blocked. Override anyway?`);
        if (!ok) {
          setForm((p) => ({ ...p, time: "" }));
          setOverride(false);
          return;
        }
        setOverride(true);
      }
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  // Toggle services
  const toggleService = (service) => {
    if (service === "Other") {
      // just toggle "Other" in the list; input field is separate
      setForm((prev) => {
        const exists = prev.services.includes("Other");
        return {
          ...prev,
          services: exists
            ? prev.services.filter((s) => s !== "Other")
            : [...prev.services, "Other"],
        };
      });
      if (!form.services.includes("Other")) setOtherService("");
      return;
    }

    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  // Save appointment (add or update)
  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    const normalizedTime =
      form.time && form.time.length === 5 ? `${form.time}:00` : form.time;

    const baseServices = form.services.filter((s) => s !== "Other");
    const finalServices = otherService
      ? [...baseServices, otherService]
      : baseServices;

    const payload = {
      groomer_id: user.id,
      pet_id: petId,
      date: form.date,
      time: normalizedTime,
      services: finalServices,
      notes: form.notes,
      duration_min: Number(form.duration_min),
      amount: form.amount ? parseFloat(form.amount) : null,
      reminder_enabled: reminderEnabled,
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

    const { data, error } = result;
    if (error || !data) return;

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
      duration_min: 15,
      services: [],
      notes: "",
      amount: "",
    });
    setReminderEnabled(true);
    setOtherService("");
    setEditingId(null);
    setOverride(false);
    setVacationBlocks([]);
    setWorkingRange([]);
    setUnavailable([]);
  };

  // Delete
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

  // Rebook 4 weeks later
  const handleRebook = (date, time) => {
    if (!date || !time) return;
    const d = new Date(`${date}T${time}`);
    d.setDate(d.getDate() + 28);
    const newDate = toYMD(d);

    setForm((p) => ({
      ...p,
      date: newDate,
      time: "",
    }));
    setEditingId(null);
    setOverride(false);
    setReminderEnabled(true);
    loadScheduleForDate(newDate);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  const isFullVacation =
    vacationBlocks.some((v) => v.type === "full") && form.date;

  return (
    <div className="p-6">
      <Link
        to={`/clients/${pet?.client_id}`}
        className="btn btn-secondary mb-4 inline-block"
      >
        ← Back to Pets
      </Link>


      <h1 className="text-xl font-bold mt-2 mb-4">
        Appointments for {pet?.name}
      </h1>

      <form onSubmit={handleAddOrUpdate} className="space-y-3 mb-6">
        {/* DATE */}
        <div className="relative overflow-visible z-50">
          <DatePicker
            id="date-input"
            selected={form.date ? parseYMD(form.date) : null}
            onChange={(d) => {
              if (!d) return;
              const value = toYMD(d);
              setForm((p) => ({ ...p, date: value, time: "" }));
              setOverride(false);
              loadScheduleForDate(value);
            }}
            dateFormat="yyyy-MM-dd"
            className="border p-2 w-full rounded"
            placeholderText="Select date"

            /* MOBILE — show full inline calendar */
            inline={window.innerWidth < 500}

            /* ❌ REMOVED popperPlacement and popperModifiers 
              (these caused: fn is not a function) */

            onCalendarOpen={() => {
              const el = document.getElementById("date-input");
              if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
            }}

            filterDate={(d) => {
              const f = toYMD(d);
              return !vacationDates.includes(f);
            }}
            dayClassName={(d) => {
              const f = toYMD(d);
              if (vacationDates.includes(f)) return "bg-red-300 text-white";
              if (workingWeekdays.length && !workingWeekdays.includes(d.getDay()))
                return "bg-gray-200 text-gray-500";
              return "";
            }}
            renderDayContents={(day, date) => {
              const f = toYMD(date);
              let title = "";
              if (vacationDates.includes(f)) {
                title = "Groomer is on vacation or partially unavailable";
              } else if (workingWeekdays.length && !workingWeekdays.includes(date.getDay())) {
                title = "Closed day — groomer override allowed";
              }
              return <span title={title || undefined}>{day}</span>;
            }}
          />

        </div>


        {/* TIME */}
        <select
          name="time"
          value={form.time}
          onChange={handleChange}
          required
          className={`border p-2 w-full rounded ${
            isFullVacation ? "bg-red-100" : ""
          }`}
          disabled={!workingRange.length || isFullVacation || !form.date}
        >
          <option value="">
            {isFullVacation
              ? "Day Off — Vacation"
              : !form.date
              ? "Select a date first"
              : workingRange.length
              ? "Select time"
              : "Closed — no working hours"}
          </option>

          {!isFullVacation &&
            form.date &&
            workingRange
              .filter((slot, idx) => {
                const blocks = Math.ceil(
                  Number(form.duration_min || 15) / 15
                );
                const windowSlots = workingRange.slice(idx, idx + blocks);
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
                  {slot}
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

        {/* NOTES */}
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          placeholder="Notes"
          className="border p-2 w-full rounded"
        />

        {/* AMOUNT */}
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

        {/* REMINDER TOGGLE */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={reminderEnabled}
            onChange={(e) => setReminderEnabled(e.target.checked)}
          />
          Send appointment reminder?
        </label>

        <button className="btn btn-primary w-full">
          {editingId ? "Update Appointment" : "Add Appointment"}
        </button>

      </form>

      {/* APPOINTMENT LIST */}
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

              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <button
                  onClick={() => handleRebook(appt.date, appt.time)}
                  className="btn btn-outline"
                >
                  🔁 Rebook 4 Weeks
                </button>

                <button
                  onClick={() => startEdit(appt)}
                  className="btn btn-outline"
                >
                  ✏️ Edit
                </button>

                <button
                  onClick={() => handleDelete(appt.id)}
                  className="btn btn-outline text-red-600 border-red-300 hover:bg-red-50"
                >
                  🗑 Delete
                </button>

              </div>

              <div className="flex flex-wrap items-center gap-6 mt-2 text-sm">
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

                      if (!data) return;
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

                      if (!data) return;
                      setAppointments((prev) =>
                        prev.map((x) => (x.id === appt.id ? data : x))
                      );
                    }}
                  />
                  No-Show
                </label>

                <span className="text-xs text-gray-500">
                  Reminder:{" "}
                  {appt.reminder_enabled ? "On" : "Off"}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
