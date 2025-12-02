// src/pages/Schedule.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link, useNavigate } from "react-router-dom";
import Loader from "../components/Loader";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const toYMD = (d) => d.toLocaleDateString("en-CA");
const parseYMD = (s) => {
  const [y, m, d] = s.split("-").map(Number);
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

/* ---------------- Trial Banner ---------------- */
function ScheduleTrialBanner({ userId }) {
  const [status, setStatus] = useState(null);
  const [daysLeft, setDaysLeft] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("groomers")
        .select("subscription_status, trial_end_date")
        .eq("id", userId)
        .single();

      if (!data) return;

      setStatus(data.subscription_status);

      const now = new Date();
      const end = new Date(data.trial_end_date);
      const diff = Math.ceil((end - now) / 86400000);
      setDaysLeft(diff);
    };

    load();
  }, [userId]);

  if (!status) return null;

  if (status === "trial") {
    if (daysLeft < 0) {
      return (
        <div className="bg-red-100 text-red-700 p-3 rounded-md font-semibold mb-4">
          🚫 Your free trial has ended —{" "}
          <Link to="/upgrade" className="underline font-bold">
            upgrade to continue
          </Link>
          .
        </div>
      );
    }

    return (
      <div className="bg-yellow-100 text-yellow-800 p-3 rounded-md font-semibold mb-4">
        ⏳ Trial ends in <strong>{daysLeft}</strong> days —
        <Link to="/upgrade" className="underline font-bold ml-1">
          Upgrade
        </Link>
      </div>
    );
  }

  return null;
}

/* ---------------- Size / Weight Helpers ---------------- */

function sizeBadge(weight) {
  switch (weight) {
    case 1:
      return {
        label: "S/M (1)",
        bg: "bg-green-200 text-green-800",
        bar: "bg-green-400",
        icon: "🟩",
      };
    case 2:
      return {
        label: "Large (2)",
        bg: "bg-orange-200 text-orange-800",
        bar: "bg-orange-400",
        icon: "🟧",
      };
    case 3:
      return {
        label: "XL (3)",
        bg: "bg-red-200 text-red-800",
        bar: "bg-red-400",
        icon: "🟥",
      };
    default:
      return {
        label: `Size ${weight}`,
        bg: "bg-gray-200 text-gray-800",
        bar: "bg-gray-400",
        icon: "⬜",
      };
  }
}

/* ---------------- Toggle Checkbox Component ---------------- */
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
            .select(
              `
              id, pet_id, groomer_id, date, time, duration_min, slot_weight,
              max_parallel, services, notes, confirmed, no_show, paid, amount,
              pets (*, clients (*))
            `
            )
            .single();

          if (!error && data) {
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

/* ---------------- Pet Select Modal (WITH SEARCH) ---------------- */

function PetSelectModal({
  open,
  onClose,
  slot,
  date,
  pets,
  loading,
  onPickPet,
}) {
  const [query, setQuery] = useState("");

  if (!open) return null;

  // filter logic
  const filtered = pets.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.clients?.full_name || "").toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[80vh] flex flex-col">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">
            Add appointment at {slot} on {date}
          </h2>
          <button onClick={onClose} className="text-gray-500 text-sm">✕</button>
        </div>

        {/* SEARCH BAR */}
        <div className="px-4 py-2 border-b bg-gray-50">
          <input
            type="text"
            placeholder="Search pets or clients..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        {/* LIST */}
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <Loader />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-600">
              No matching pets found.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((pet) => (
                <li key={pet.id}>
                  <button
                    onClick={() => onPickPet(pet)}
                    className="w-full text-left border rounded px-3 py-2 hover:bg-blue-50 flex flex-col"
                  >
                    <span className="font-medium">{pet.name}</span>
                    <span className="text-xs text-gray-500">
                      {pet.clients?.full_name || "No client name"}
                    </span>

                    {pet.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {pet.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-4 py-3 border-t text-right">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


/* ---------------- Main Schedule Component ---------------- */

export default function Schedule() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);

  const [selectedDate, setSelectedDate] = useState(() => toYMD(new Date()));
  const [workingRange, setWorkingRange] = useState([]);
  const [breakSlots, setBreakSlots] = useState([]);
  const [capacity, setCapacity] = useState(1);

  const [petModalOpen, setPetModalOpen] = useState(false);
  const [modalSlot, setModalSlot] = useState(null);
  const [pets, setPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(false);

  const navigate = useNavigate();

  // Load logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Load day schedule (working hours, breaks, appointments)
  useEffect(() => {
    if (!user || !selectedDate) return;

    const loadDay = async () => {
      setLoading(true);

      const [y, m, d] = selectedDate.split("-").map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

      const [{ data: groomer }, { data: hours }, { data: breaks }, { data: appts }] =
        await Promise.all([
          supabase
            .from("groomers")
            .select("max_parallel")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("working_hours")
            .select("*")
            .eq("groomer_id", user.id)
            .eq("weekday", weekday)
            .maybeSingle(),
          supabase
            .from("working_breaks")
            .select("*")
            .eq("groomer_id", user.id)
            .eq("weekday", weekday),
          supabase
            .from("appointments")
            .select(
              `
            id, pet_id, groomer_id, date, time, duration_min, slot_weight,
            max_parallel, services, notes, confirmed, no_show, paid, amount,
            pets (
              id, name, tags, client_id,
              clients ( id, full_name, phone )
            )
          `
            )
            .eq("groomer_id", user.id)
            .eq("date", selectedDate)
            .order("time", { ascending: true }),
        ]);

      setCapacity(groomer?.max_parallel || 1);

      if (!hours) {
        setWorkingRange([]);
        setBreakSlots([]);
        setAppointments(appts || []);
        setLoading(false);
        return;
      }

      const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
      const endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
      const range =
        startIdx === -1 || endIdx === -1
          ? []
          : TIME_SLOTS.slice(startIdx, endIdx + 1);
      setWorkingRange(range);

      const breakSet = new Set();
      (breaks || []).forEach((b) => {
        const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
        const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
        if (bi === -1 || ei === -1) return;
        TIME_SLOTS.slice(bi, ei + 1).forEach((s) => breakSet.add(s));
      });
      setBreakSlots([...breakSet]);

      setAppointments(appts || []);
      setLoading(false);
    };

    loadDay();
  }, [user, selectedDate]);

  // DELETE appointment
  const handleDelete = async (id) => {
    if (!user) return;

    const ok = window.confirm("Delete this appointment?");
    if (!ok) return;

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    if (error) return alert(error.message);

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
      slot_weight: appt.slot_weight || 1,
      max_parallel: appt.max_parallel || 1,
      services: appt.services,
      notes: appt.notes || "",
      confirmed: false,
      no_show: false,
      paid: false,
      amount: appt.amount || null,
    });

    if (error) return alert("Error rebooking: " + error.message);
    alert("Rebooked for 4 weeks later.");
  };

  // Open pet select modal for a slot
  const openSlot = async (slot) => {
    setModalSlot(slot);
    setPetModalOpen(true);

    if (!pets.length && user) {
      setLoadingPets(true);
      const { data } = await supabase
        .from("pets")
        .select(
          `
        id, name, tags, client_id,
        clients ( id, full_name )
      `
        )
        .eq("groomer_id", user.id)
        .order("name", { ascending: true });

      setPets(data || []);
      setLoadingPets(false);
    }
  };

  const handlePickPet = (pet) => {
    if (!pet || !modalSlot || !selectedDate) return;
    setPetModalOpen(false);
    navigate(
      `/pets/${pet.id}/appointments?date=${selectedDate}&time=${modalSlot}`
    );
  };

  if (loading) {
    return (
      <main className="px-4 py-6 space-y-4">
        <Loader />
        <Loader />
      </main>
    );
  }

  /* ---------------- Filtering (for cards) ---------------- */

  const today = new Date();
  const todayStr = toYMD(today);

  const filteredAppointments = appointments.filter((appt) => {
    const q = search.toLowerCase();
    if (!q) return true;

    return (
      appt.pets?.name?.toLowerCase().includes(q) ||
      appt.pets?.clients?.full_name?.toLowerCase().includes(q) ||
      appt.pets?.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  /* ---------------- Unpaid Today (for today's date only) ---------------- */

  const unpaidToday =
    selectedDate === todayStr
      ? appointments.filter((appt) => {
          const [y, m, d] = appt.date.split("-").map(Number);
          const [H, M] = (appt.time || "00:00").split(":").map(Number);
          const start = new Date(y, m - 1, d, H, M);
          const end = new Date(
            start.getTime() + (appt.duration_min || 15) * 60000
          );
          return !appt.paid && !appt.no_show && end <= new Date();
        })
      : [];

  const totalUnpaidToday = unpaidToday.length;
  const totalUnpaidAmount = unpaidToday.reduce(
    (sum, a) => sum + (a.amount || 0),
    0
  );

  /* ---------------- Per-slot occupancy ---------------- */

  const appointmentsCoveringSlot = (slot) => {
    const [sh, sm] = slot.split(":").map(Number);
    const slotMinutes = sh * 60 + sm;

    return appointments.filter((appt) => {
      if (!appt.time) return false;
      const startStr = appt.time.slice(0, 5);
      const [ah, am] = startStr.split(":").map(Number);
      const startMin = ah * 60 + am;
      const endMin = startMin + (appt.duration_min || 15);
      return slotMinutes >= startMin && slotMinutes < endMin;
    });
  };

  const slotsWithInfo = workingRange.map((slot) => {
    const slotAppts = appointmentsCoveringSlot(slot);
    const usedWeight = slotAppts.reduce(
      (sum, a) => sum + (a.slot_weight || 1),
      0
    );
    return { slot, usedWeight, appts: slotAppts };
  });

  /* ---------------- Render ---------------- */

  return (
    <main className="px-4 py-6 space-y-4">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

      {user && <ScheduleTrialBanner userId={user.id} />}

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

      {/* DATE & SEARCH BAR */}
      <div className="card mb-4">
        <div className="card-body flex flex-col md:flex-row gap-4">
          <div className="relative overflow-visible z-20">
            <DatePicker
              selected={parseYMD(selectedDate)}
              onChange={(d) => d && setSelectedDate(toYMD(d))}
              dateFormat="yyyy-MM-dd"
              className="border p-2 rounded w-full"
              inline={window.innerWidth < 500}
              onCalendarOpen={() =>
                document
                  .getElementById("schedule-date-input")
                  ?.scrollIntoView({ block: "center", behavior: "smooth" })
              }
              id="schedule-date-input"
            />
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Search pet, client, or tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-72 border rounded px-3 py-2 text-sm"
            />

            <div className="text-sm text-gray-600">
              {workingRange.length ? (
                <>
                  Working hours:{" "}
                  <strong>
                    {workingRange[0]} – {workingRange[workingRange.length - 1]}
                  </strong>
                  <span className="ml-2 text-xs text-gray-500">
                    Capacity: {capacity} dog{capacity > 1 ? "s" : ""} per slot
                  </span>
                </>
              ) : (
                "No working hours set for this weekday — update your profile schedule."
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-green-200" />
                Lightly booked
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-orange-200" />
                Busy
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-red-200" />
                Full
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded border border-dashed border-blue-300" />
                Open slot (tap to add)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-gray-200" />
                Break / blocked
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CAPACITY GRID */}
      {workingRange.length > 0 && (
        <div className="card mb-6">
          <div className="card-body">
            <div className="overflow-x-auto">
              <div
                className="grid border rounded text-xs"
                style={{
                  gridTemplateColumns: `80px repeat(${capacity}, minmax(0, 1fr))`,
                }}
              >
                {/* Header row */}
                <div className="border-b bg-gray-50 px-2 py-1 font-semibold">
                  Time
                </div>
                {Array.from({ length: capacity }).map((_, idx) => (
                  <div
                    key={idx}
                    className="border-b bg-gray-50 px-2 py-1 text-center font-semibold"
                  >
                    Slot {idx + 1}
                  </div>
                ))}

                {/* Rows */}
                {slotsWithInfo.map(({ slot, usedWeight }) => {
                  const isBreak = breakSlots.includes(slot);
                  const isFull = usedWeight >= capacity;
                  let colorClass = "";
                  if (isBreak) {
                    colorClass = "bg-gray-100";
                  } else if (usedWeight === 0) {
                    colorClass = "";
                  } else if (usedWeight < capacity) {
                    colorClass = "bg-green-100";
                  } else if (usedWeight === capacity) {
                    colorClass = "bg-red-100";
                  }

                  return (
                    <>
                      {/* Time label */}
                      <div
                        key={`${slot}-label`}
                        className="border-t px-2 py-1 text-gray-700 font-medium"
                      >
                        {slot}
                      </div>

                      {/* Capacity cells */}
                      {Array.from({ length: capacity }).map((_, idx) => {
                        const clickable = !isBreak && !isFull;
                        const baseClasses =
                          "border-t px-2 py-2 flex items-center justify-center";
                        const clickClasses = clickable
                          ? "cursor-pointer hover:bg-blue-50"
                          : "cursor-not-allowed";

                        return (
                          <div
                            key={`${slot}-c${idx}`}
                            className={`${baseClasses} ${clickClasses} ${
                              !isBreak && usedWeight > 0 ? colorClass : ""
                            }`}
                            onClick={() =>
                              clickable ? openSlot(slot) : undefined
                            }
                          >
                            {isBreak ? (
                              idx === 0 && (
                                <span className="text-[10px] text-gray-500">
                                  Break
                                </span>
                              )
                            ) : usedWeight === 0 ? (
                              <span className="inline-block w-5 h-5 rounded border border-dashed border-blue-300" />
                            ) : idx < usedWeight ? (
                              <span className="inline-block w-5 h-5 rounded bg-blue-300" />
                            ) : (
                              <span className="inline-block w-5 h-5 rounded border border-gray-200" />
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPOINTMENT CARDS */}
      {filteredAppointments.length === 0 ? (
        <p className="text-gray-600 italic">
          No appointments for this day (or search filter).
        </p>
      ) : (
        <div className="grid gap-4">
          {filteredAppointments.map((appt) => {
            const start = (appt.time || "00:00").slice(0, 5);
            const end = getEndTime(start, appt.duration_min || 15);
            const size = sizeBadge(appt.slot_weight || 1);

            const [y, m, d] = appt.date.split("-").map(Number);
            const [H, M] = start.split(":").map(Number);
            const localStart = new Date(y, m - 1, d, H, M);
            const isPast = localStart < new Date();

            return (
              <div
                key={appt.id}
                className={`card relative pt-2 transition-all ${
                  isPast ? "opacity-60" : "opacity-100"
                }`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-2 ${size.bar} rounded-l`}
                />

                <div className="card-body space-y-2">
                  {/* DATE + TIME + SIZE ICON */}
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-500">{appt.date}</div>
                      <div className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        {start} – {end}
                        <span title="Capacity weight">{size.icon}</span>
                      </div>
                    </div>

                    <div className="text-sm text-gray-500">
                      {appt.duration_min} min
                    </div>
                  </div>

                  {/* PET + SIZE BADGE */}
                  <div className="flex items-center gap-2 text-xl font-bold text-gray-800">
                    {appt.pets?.name}
                    <span className={`chip ${size.bg}`}>{size.label}</span>
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
                      {(Array.isArray(appt.services)
                        ? appt.services
                        : String(appt.services).split(",").map((s) => s.trim())
                      ).map((svc) => (
                        <span key={svc} className="chip chip-brand">
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AMOUNT */}
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

      {/* PET SELECT MODAL */}
      <PetSelectModal
        open={petModalOpen}
        onClose={() => setPetModalOpen(false)}
        slot={modalSlot}
        date={selectedDate}
        pets={pets}
        loading={loadingPets}
        onPickPet={handlePickPet}
      />
    </main>
  );
}
