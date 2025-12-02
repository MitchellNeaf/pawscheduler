// src/pages/PetAppointments.jsx
import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { sendEmail } from "../utils/sendEmail";

const toYMD = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;

const parseYMD = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d); // keep this local
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
    slot_weight: 1,
    services: [],
    notes: "",
    amount: "",
  });

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [otherService, setOtherService] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [workingRange, setWorkingRange] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [slotLoad, setSlotLoad] = useState({});
  const [override, setOverride] = useState(false);
  const [vacationBlocks, setVacationBlocks] = useState([]);

  const [vacationDates, setVacationDates] = useState([]);
  const [workingWeekdays, setWorkingWeekdays] = useState([]);

  // Load current auth user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Load groomer profile (max_parallel + branding)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: groomer } = await supabase
        .from("groomers")
        .select(
          "max_parallel, logo_url, business_name, business_phone, business_address"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (groomer) {
        setUser((prev) => ({ ...prev, ...groomer }));
      }
    })();
  }, [user?.id]);

  // Load vacation days for selected date
  const loadVacations = useCallback(
    async (date) => {
      if (!user || !date) return [];

      const { data } = await supabase
        .from("vacation_days")
        .select("*")
        .eq("groomer_id", user.id)
        .eq("date", date);

      if (!data?.length) return [];

      return data.map((vac) => {
        if (!vac.start_time && !vac.end_time) return { type: "full" };

        return {
          type: "partial",
          start: vac.start_time ? vac.start_time.slice(0, 5) : null,
          end: vac.end_time ? vac.end_time.slice(0, 5) : null,
        };
      });
    },
    [user]
  );

  // Load schedule (hours, breaks, existing appts) for date
  const loadScheduleForDate = useCallback(
    async (selectedDate) => {
      if (!selectedDate || !user) return;

      const vacationInfo = await loadVacations(selectedDate);
      setVacationBlocks(vacationInfo);

      // Full day off
      if (vacationInfo.some((v) => v.type === "full")) {
        setWorkingRange([]);
        setUnavailable([...TIME_SLOTS]);
        setSlotLoad({});
        return;
      }

      const [y, m, d] = selectedDate.split("-").map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();



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
        setSlotLoad({});
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

      // Existing appointments → slotLoad
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, time, duration_min, slot_weight")
        .eq("date", selectedDate)
        .eq("groomer_id", user.id);

      const newSlotLoad = {};
      (appts || []).forEach((a) => {
        if (a.id === editingId) return; // ignore current editing appt

        const t = a.time?.slice(0, 5);
        const start = TIME_SLOTS.indexOf(t);
        if (start === -1) return;

        const blocks = Math.ceil((a.duration_min || 15) / 15);
        const w = a.slot_weight ?? 1;

        for (let i = 0; i < blocks; i++) {
          const slot = TIME_SLOTS[start + i];
          if (!slot) continue;
          newSlotLoad[slot] = (newSlotLoad[slot] || 0) + w;
        }
      });

      // Partial vacations
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

      setUnavailable([...new Set([...breakBlocked, ...vacationPartial])]);
      setSlotLoad(newSlotLoad);
    },
    [user, editingId, loadVacations]
  );

  // Calendar: vacation dates
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

  // Calendar: working weekdays
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("working_hours")
        .select("weekday")
        .eq("groomer_id", user.id);
      if (data) {
        setWorkingWeekdays([...new Set(data.map((h) => h.weekday))]);
      }
    })();
  }, [user]);

  // Helper: parse services from string/array
  const parseServices = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((s) => s.trim());
    }
    return [];
  };

  // Start editing
  const startEdit = (appt) => {
    const parsed = parseServices(appt.services);

    setForm({
      date: appt.date,
      time: appt.time?.slice(0, 5) || "",
      duration_min: String(appt.duration_min || 15),
      slot_weight: appt.slot_weight ?? 1,
      services: parsed,
      notes: appt.notes || "",
      amount: appt.amount || "",
    });

    setReminderEnabled(appt.reminder_enabled ?? true);
    setOtherService("");
    setEditingId(appt.id);
    setOverride(false);

    if (appt.date) loadScheduleForDate(appt.date);
  };

  // Start cloning
  const startClone = (appt) => {
    const parsed = parseServices(appt.services);

    let newDate = appt.date;
    if (autoShift && appt.date) {
      const [y, m, day] = appt.date.split("-").map(Number);
      const d = new Date(y, m - 1, day);
      d.setDate(d.getDate() + 28);
      newDate = toYMD(d);   // <-- FIXED
    }


    setForm({
      date: newDate,
      time: appt.time?.slice(0, 5) || "",
      duration_min: String(appt.duration_min || 15),
      slot_weight: appt.slot_weight ?? 1,
      services: parsed,
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

    const load = async () => {
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

      // Default slot_weight from PET for NEW appointments only
      if (!editIdFromURL && !cloneIdFromURL) {
        setForm((prev) => ({
          ...prev,
          slot_weight: petData.slot_weight ?? 1,
        }));
      }

      if (apptData && editIdFromURL) {
        const a = apptData.find((x) => x.id === editIdFromURL);
        if (a) startEdit(a);
      }

      if (apptData && cloneIdFromURL && !editIdFromURL) {
        const a = apptData.find((x) => x.id === cloneIdFromURL);
        if (a) startClone(a);
      }
    };

    load();
  }, [user, petId, editIdFromURL, cloneIdFromURL, autoShift]);

  // AUTO-DURATION: based ONLY on services (Option A)
  useEffect(() => {
    const s = form.services;

    if (s.length === 1 && s.includes("Nails")) {
      return setForm((f) => ({ ...f, duration_min: "15" }));
    }

    if (
      s.includes("Deshedding") ||
      s.includes("Tick Treatment") ||
      s.length >= 5
    ) {
      return setForm((f) => ({ ...f, duration_min: "60" }));
    }

    if (s.includes("Wash") && s.includes("Cut")) {
      return setForm((f) => ({ ...f, duration_min: "45" }));
    }

    if (s.includes("Wash") || s.includes("Cut") || s.length >= 2) {
      return setForm((f) => ({ ...f, duration_min: "30" }));
    }

    // Default baseline for most dogs
    return setForm((f) => ({ ...f, duration_min: "45" }));
  }, [form.services]);

  // AUTO-SELECT earliest usable time
  useEffect(() => {
    if (!form.date || !workingRange.length || !form.duration_min) return;
    if (form.time) return;

    const blocks = Math.ceil(Number(form.duration_min) / 15);
    const cap = user?.max_parallel ?? 1;
    const weight = Number(form.slot_weight || 1);

    const earliest = workingRange.find((slot, idx) => {
      const windowSlots = workingRange.slice(idx, idx + blocks);
      if (windowSlots.length < blocks) return false;

      // hard blocks
      if (!override && windowSlots.some((s) => unavailable.includes(s)))
        return false;

      // capacity check
      const fits = windowSlots.every((s) => {
        const existing = slotLoad[s] || 0;
        return existing + weight <= cap;
      });

      return fits;
    });

    if (earliest) {
      setForm((prev) => ({ ...prev, time: earliest }));
    }
  }, [
    form.date,
    form.duration_min,
    form.time,
    form.slot_weight,
    workingRange,
    unavailable,
    override,
    slotLoad,
    user?.max_parallel,
  ]);

  // FORM CHANGE HANDLER
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

    if (name === "slot_weight") {
      setForm((p) => ({ ...p, slot_weight: Number(value) || 1 }));
      return;
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  // TOGGLE SERVICES
  const toggleService = (service) => {
    if (service === "Other") {
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

  // SAVE (add or update)
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
      slot_weight: Number(form.slot_weight || 1),
      max_parallel: user?.max_parallel ?? 1,
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

    // SEND EMAIL CONFIRMATION
    if (reminderEnabled && data?.date && data?.time) {
      const { data: petRow } = await supabase
        .from("pets")
        .select("client_id, name")
        .eq("id", petId)
        .single();

      if (petRow?.client_id) {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("email")
          .eq("id", petRow.client_id)
          .single();

        const clientEmail = clientRow?.email;

        if (clientEmail) {
          await sendEmail({
            to: clientEmail,
            subject: "Your Grooming Appointment is Confirmed",
            template: "confirmation",
            data: {
              groomer_id: user.id,
              confirm_url: `https://app.pawscheduler.app/.netlify/functions/confirmAppointment?id=${data.id}`,
              logo_url: user?.logo_url ?? "",
              business_name: user?.business_name ?? "",
              business_address: user?.business_address ?? "",
              business_phone: user?.business_phone ?? "",
              groomer_email: user?.email ?? "",
              pet_name: petRow.name,
              date: data.date,
              time: data.time?.slice(0, 5),
              duration_min: data.duration_min,
              services: Array.isArray(data.services)
                ? data.services.join(", ")
                : data.services,
              price: data.amount ?? "",
              notes_block: data.notes
                ? `<tr><td><strong>Notes:</strong> ${data.notes}</td></tr>`
                : "",
            },
          });
        }
      }
    }

    // RESET FORM
    setForm({
      date: "",
      time: "",
      duration_min: 15,
      slot_weight: 1,
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
    setSlotLoad({});
  };

  // DELETE
  const handleDelete = async (id) => {
    if (!user) return;
    if (!window.confirm("Delete this appointment?")) return;

    await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  // REBOOK 4 weeks later
  const handleRebook = (date, time) => {
    if (!date || !time) return;
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 28);
    const newDate = toYMD(dt);


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

  const capacity = user?.max_parallel ?? 1;
  const weight = Number(form.slot_weight || 1);

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
            selected={
              form.date
                ? new Date(
                    Number(form.date.substring(0,4)),
                    Number(form.date.substring(5,7)) - 1,
                    Number(form.date.substring(8,10))
                  )
                : null
            }

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
            inline={window.innerWidth < 500}
            onCalendarOpen={() =>
              document.getElementById("date-input")?.scrollIntoView({
                block: "center",
                behavior: "smooth",
              })
            }
            filterDate={(d) => {
              const f = toYMD(d);
              return !vacationDates.includes(f);
            }}
            dayClassName={(d) => {
              const f = toYMD(d);
              if (vacationDates.includes(f)) return "bg-red-300 text-white";
              if (
                workingWeekdays.length &&
                !workingWeekdays.includes(d.getDay())
              )
                return "bg-gray-200 text-gray-500";
              return "";
            }}
            renderDayContents={(day, date) => {
              const f = toYMD(date);
              let title = "";
              if (vacationDates.includes(f)) {
                title = "Groomer is on vacation or partially unavailable";
              } else if (
                workingWeekdays.length &&
                !workingWeekdays.includes(date.getDay())
              ) {
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

                // Hard blocks
                if (
                  !override &&
                  windowSlots.some((s) => unavailable.includes(s))
                )
                  return false;

                // Capacity
                const fits = windowSlots.every((s) => {
                  const existing = slotLoad[s] || 0;
                  return existing + weight <= capacity;
                });

                return fits;
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

        {/* SIZE / DIFFICULTY */}
        <div>
          <label className="font-medium block mb-1">
            Dog size / difficulty
          </label>
          <select
            name="slot_weight"
            value={form.slot_weight}
            onChange={handleChange}
            className="border p-2 w-full rounded"
          >
            <option value={1}>Small / Medium (1 spot)</option>
            <option value={2}>Large (2 spots)</option>
            <option value={3}>Giant / Heavy Coat (3 spots)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Higher values block more of your capacity during this time.
          </p>
        </div>

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

                      if (data) {
                        setAppointments((prev) =>
                          prev.map((x) => (x.id === appt.id ? data : x))
                        );
                      }
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

                      if (data) {
                        setAppointments((prev) =>
                          prev.map((x) => (x.id === appt.id ? data : x))
                        );
                      }
                    }}
                  />
                  No-Show
                </label>

                <span className="text-xs text-gray-500">
                  Reminder: {appt.reminder_enabled ? "On" : "Off"}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
