// src/pages/Schedule.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { sendEmail } from "../utils/sendEmail";

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
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
      setDaysLeft(Math.ceil((end - now) / 86400000));
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
          </Link>.
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

/* ---------------- Helpers ---------------- */
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

const SERVICE_OPTIONS = [
  "Full Groom",
  "Bath Only",
  "Nail Trim",
  "Deshed",
  "Teeth Cleaning",
  "Other",
];

function matchesSearch(appt, query) {
  if (!query.trim()) return true;

  const q = query.toLowerCase();

  return (
    appt.pets?.name?.toLowerCase().includes(q) ||
    appt.pets?.clients?.full_name?.toLowerCase().includes(q) ||
    appt.pets?.tags?.some((t) => t.toLowerCase().includes(q)) ||
    (Array.isArray(appt.services)
      ? appt.services
      : String(appt.services || "").split(","))
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

function getEndTime(start, durationMin) {
  if (!start) return "—";
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + durationMin;
  return `${String(Math.floor(endMin / 60)).padStart(
    2,
    "0"
  )}:${String(endMin % 60).padStart(2, "0")}`;
}

/* ---------------- Pet Select Modal ---------------- */
function PetSelectModal({ open, onClose, slot, date, pets, loading, onPickPet }) {
  const [query, setQuery] = useState("");
  if (!open) return null;

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
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">
            Add appointment at {slot} on {date}
          </h2>
          <button onClick={onClose} className="text-gray-500 text-sm">
            ✕
          </button>
        </div>

        <div className="px-4 py-2 border-b bg-gray-50">
          <input
            type="text"
            placeholder="Search pets or clients..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <Loader />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-600">No matching pets.</p>
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
                      {pet.clients?.full_name}
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

/* ---------------- New Appointment Modal ---------------- */
function NewAppointmentModal({
  open,
  onClose,
  pet,
  form,
  setForm,
  onSave,
  saving,
}) {
  if (!open || !pet) return null;

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const value =
      field === "duration_min"
        ? Number(raw || 0)
        : field === "amount"
        ? Number(raw)
        : raw;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleService = (svc) => {
    setForm((prev) => {
      const exists = prev.services.includes(svc);
      return {
        ...prev,
        services: exists
          ? prev.services.filter((s) => s !== svc)
          : [...prev.services, svc],
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">New Appointment</h2>
          <button onClick={onClose} className="text-gray-500 text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="text-sm text-gray-700">
            <div className="font-semibold">{pet.name}</div>
            <div className="text-xs text-gray-500">{pet.clients?.full_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Date</span>
              <input
                type="date"
                value={form.date}
                onChange={handleChange("date")}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Time</span>
              <input
                type="time"
                step={900}
                value={form.time}
                onChange={handleChange("time")}
                className="border rounded px-2 py-1"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Duration</span>
            <select
              value={form.duration_min}
              onChange={handleChange("duration_min")}
              className="border rounded px-2 py-1"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={120}>120</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Amount ($)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount ?? ""}
              onChange={handleChange("amount")}
              className="border rounded px-2 py-1"
              placeholder="Enter price"
            />
          </label>

          <div className="text-sm">
            <div className="font-medium text-gray-700 mb-1">Services</div>
            <div className="grid grid-cols-2 gap-1">
              {SERVICE_OPTIONS.map((svc) => (
                <label
                  key={svc}
                  className="flex items-center gap-2 text-xs text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form.services.includes(svc)}
                    onChange={() => toggleService(svc)}
                  />
                  {svc}
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes</span>
            <textarea
              value={form.notes}
              onChange={handleChange("notes")}
              className="border rounded px-2 py-1 min-h-[60px]"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.reminder_enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  reminder_enabled: e.target.checked,
                }))
              }
            />
            Send appointment reminder?
          </label>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            onClick={onSave}
            disabled={saving}
            className="text-sm px-3 py-1 rounded bg-blue-600 text-white"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
/* ---------------- Edit Appointment Modal ---------------- */
function EditAppointmentModal({
  open,
  onClose,
  appt,
  form,
  setForm,
  onSave,
  onDelete,
  saving,
}) {
  if (!open || !appt) return null;

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const value =
      field === "duration_min"
        ? Number(raw || 0)
        : field === "amount"
        ? Number(raw)
        : raw;

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleService = (svc) => {
    setForm((prev) => {
      const exists = prev.services.includes(svc);
      return {
        ...prev,
        services: exists
          ? prev.services.filter((s) => s !== svc)
          : [...prev.services, svc],
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">Edit Appointment</h2>
          <button onClick={onClose} className="text-gray-500 text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">

          {/* Pet + Client */}
          <div className="text-sm text-gray-700">
            <div className="font-semibold">{appt.pets?.name}</div>
            <div className="text-xs text-gray-500">{appt.pets?.clients?.full_name}</div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Date</span>
              <input
                type="date"
                value={form.date}
                onChange={handleChange("date")}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Time</span>
              <input
                type="time"
                step={900}
                value={form.time}
                onChange={handleChange("time")}
                className="border rounded px-2 py-1"
              />
            </label>
          </div>

          {/* Duration */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Duration</span>
            <select
              value={form.duration_min}
              onChange={handleChange("duration_min")}
              className="border rounded px-2 py-1"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={120}>120</option>
            </select>
          </label>

          {/* Amount */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Amount ($)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount ?? ""}
              onChange={handleChange("amount")}
              className="border rounded px-2 py-1"
            />
          </label>

          {/* Services */}
          <div className="text-sm">
            <div className="font-medium text-gray-700 mb-1">Services</div>
            <div className="grid grid-cols-2 gap-1">
              {SERVICE_OPTIONS.map((svc) => (
                <label
                  key={svc}
                  className="flex items-center gap-2 text-xs text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form.services.includes(svc)}
                    onChange={() => toggleService(svc)}
                  />
                  {svc}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes</span>
            <textarea
              value={form.notes}
              onChange={handleChange("notes")}
              className="border rounded px-2 py-1 min-h-[60px]"
            />
          </label>

          {/* Reminder */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.reminder_enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  reminder_enabled: e.target.checked,
                }))
              }
            />
            Send appointment reminder?
          </label>
        </div>

        <div className="px-4 py-3 border-t flex justify-between gap-2">
          <button
            onClick={onDelete}
            className="text-sm px-3 py-1 rounded border border-red-500 text-red-600 hover:bg-red-50"
            disabled={saving}
          >
            🗑 Delete
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>

            <button
              onClick={onSave}
              disabled={saving}
              className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Toggle Checkbox ---------------- */
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
              services, notes, confirmed, no_show, paid, amount, reminder_enabled,
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

/* ---------------- Rebook Week Modal ---------------- */
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function RebookWeekModal({ open, appt, onClose, onPickDate }) {
  const [weekStart, setWeekStart] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (!appt) return;
    const [y, m, d] = appt.date.split("-").map(Number);
    const original = new Date(y, m - 1, d);
    original.setDate(original.getDate() + 42);
    const start = startOfWeek(original);
    setWeekStart(start);
    setSelectedDate(toYMD(start));
  }, [appt]);

  if (!open || !appt || !weekStart) return null;

  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i)
  );

  const weekLabel = (() => {
    const opts = { month: "short", day: "numeric" };
    const startStr = weekStart.toLocaleDateString("en-US", opts);
    const endStr = addDays(weekStart, 6).toLocaleDateString("en-US", opts);
    return `${startStr} – ${endStr}`;
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            Rebook {appt.pets?.name} (6 weeks out)
          </h2>
          <button className="text-gray-500 text-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Choose a day in the target week, then we’ll keep you on this schedule
          view so you can pick the exact time.
        </div>

        <div className="flex items-center justify-between text-sm">
          <button
            className="px-2 py-1 border rounded text-xs"
            onClick={() => {
              setWeekStart((prev) => addDays(prev, -7));
              setSelectedDate(null);
            }}
          >
            ← Previous week
          </button>
          <span className="font-medium">{weekLabel}</span>
          <button
            className="px-2 py-1 border rounded text-xs"
            onClick={() => {
              setWeekStart((prev) => addDays(prev, 7));
              setSelectedDate(null);
            }}
          >
            Next week →
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          {weekDays.map((day) => {
            const ymd = toYMD(day);
            const label = day.toLocaleDateString("en-US", {
              weekday: "short",
              month: "numeric",
              day: "numeric",
            });
            const isSelected = selectedDate === ymd;
            return (
              <button
                key={ymd}
                onClick={() => setSelectedDate(ymd)}
                className={`border rounded px-2 py-2 text-left ${
                  isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={!selectedDate}
            onClick={() => {
              if (!selectedDate) return;
              onPickDate(selectedDate);
            }}
          >
            Continue
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

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newPet, setNewPet] = useState(null);
  const [newForm, setNewForm] = useState({
    date: "",
    time: "",
    duration_min: 30,
    services: [],
    notes: "",
    reminder_enabled: true,
    amount: null,
  });
  const [savingNew, setSavingNew] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    time: "",
    duration_min: 30,
    services: [],
    notes: "",
    amount: null,
    reminder_enabled: false,
  });

  const [savingEdit, setSavingEdit] = useState(false);

  const [rebookModalOpen, setRebookModalOpen] = useState(false);
  const [rebookAppt, setRebookAppt] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    if (!user || !selectedDate) return;

    const loadDay = async () => {
      setLoading(true);

      const [y, m, d] = selectedDate.split("-").map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

      const [
        { data: groomer },
        { data: hours },
        { data: breaks },
        { data: appts },
      ] = await Promise.all([
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
          .select(`
            id, pet_id, groomer_id, date, time, duration_min, slot_weight,
            services, notes, confirmed, no_show, paid, amount, reminder_enabled,
            pets (
              id, name, tags, client_id,
              clients ( id, full_name, phone )
            )
          `)
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

  const handleDelete = async (id) => {
    if (!user) return;
    const ok = window.confirm("Delete this appointment?");
    if (!ok) return;

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    if (error) {
      alert(error.message);
      return;
    }

    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  const openRebookModal = (appt) => {
    setRebookAppt(appt);
    setRebookModalOpen(true);
  };

  const handleRebookDatePicked = (dateYMD) => {
    if (!rebookAppt) return;
    setSelectedDate(dateYMD);
    setRebookModalOpen(false);
    setRebookAppt(null);
  };

  const openSlot = async (slot) => {
    setModalSlot(slot);
    setPetModalOpen(true);

    if (!pets.length && user) {
      setLoadingPets(true);
      const { data } = await supabase
        .from("pets")
        .select(`
          id, name, tags, client_id, slot_weight,
          clients ( id, full_name )
        `)
        .eq("groomer_id", user.id)
        .order("name", { ascending: true });

      setPets(data || []);
      setLoadingPets(false);
    }
  };

  const handlePickPet = (pet) => {
    if (!pet || !modalSlot || !selectedDate) return;
    setPetModalOpen(false);
    setNewPet(pet);
    setNewForm({
      date: selectedDate,
      time: modalSlot,
      duration_min: 30,
      services: [],
      notes: "",
      reminder_enabled: true,
      amount: null,
    });
    setNewModalOpen(true);
  };

  const handleSaveNew = async () => {
    if (!user || !newPet) return;
    if (!newForm.date || !newForm.time) {
      alert("Date and time are required.");
      return;
    }

    setSavingNew(true);
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        groomer_id: user.id,
        pet_id: newPet.id,
        date: newForm.date,
        time: newForm.time,
        duration_min: newForm.duration_min || 30,
        services: newForm.services,
        notes: newForm.notes,
        slot_weight: newPet.slot_weight || 1,
        reminder_enabled: newForm.reminder_enabled,
        amount: newForm.amount ?? null,
      })
      .select(`
        id, pet_id, groomer_id, date, time, duration_min, slot_weight,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled,
        pets (
          id, name, tags, client_id,
          clients ( id, full_name, phone )
        )
      `)
      .single();

    setSavingNew(false);

    if (error) {
      alert(error.message);
      return;
    }

    setAppointments((prev) =>
      [...prev, data].sort((a, b) =>
        (a.time || "").localeCompare(b.time || "")
      )
    );

    setNewModalOpen(false);
    setNewPet(null);
    setModalSlot(null);
  };

  const handleOpenEditModal = (appt) => {
    const servicesArray = Array.isArray(appt.services)
      ? appt.services
      : appt.services
      ? String(appt.services)
          .split(",")
          .map((s) => s.trim())
      : [];

    setEditAppt(appt);
    setEditForm({
      date: appt.date,
      time: (appt.time || "00:00").slice(0, 5),
      duration_min: appt.duration_min || 30,
      services: servicesArray,
      notes: appt.notes || "",
      amount: appt.amount ?? null,
      reminder_enabled: appt.reminder_enabled ?? false,
    });

    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!user || !editAppt) return;
    if (!editForm.date || !editForm.time) {
      alert("Date and time are required.");
      return;
    }

    setSavingEdit(true);

    const { data, error } = await supabase
      .from("appointments")
      .update({
        date: editForm.date,
        time: editForm.time,
        duration_min: editForm.duration_min || 30,
        services: editForm.services,
        notes: editForm.notes,
        amount: editForm.amount ?? null,
        reminder_enabled: editForm.reminder_enabled,
        slot_weight: editAppt.slot_weight || 1,
      })
      .eq("id", editAppt.id)
      .eq("groomer_id", user.id)
      .select(`
        id, pet_id, groomer_id, date, time, duration_min, slot_weight,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled,
        pets ( id, name, tags, client_id, clients ( id, full_name, phone ) )
      `)
      .single();

    setSavingEdit(false);

    if (error) {
      alert(error.message);
      return;
    }

    setAppointments((prev) =>
      prev
        .map((a) => (a.id === editAppt.id ? data : a))
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    );

    setEditModalOpen(false);
    setEditAppt(null);
  };

  if (loading) {
    return (
      <main className="px-4 py-6 space-y-6 max-w-5xl mx-auto">
        <Loader />
        <Loader />
      </main>
    );
  }

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

  const expandedSlotAppointments = (slot) => {
    const appts = appointmentsCoveringSlot(slot);
    const expanded = [];
    appts.forEach((a) => {
      const weight = a.slot_weight || 1;
      for (let i = 0; i < weight; i++) {
        expanded.push(a);
      }
    });
    return expanded.slice(0, capacity);
  };

  const slotsWithInfo = workingRange.map((slot) => {
    const slotAppts = appointmentsCoveringSlot(slot);
    const usedWeight = slotAppts.reduce(
      (sum, a) => sum + (a.slot_weight || 1),
      0
    );
    return { slot, usedWeight };
  });

  return (
    <main className="px-3 sm:px-4 py-6 space-y-6">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

      {user && <ScheduleTrialBanner userId={user.id} />}

      {totalUnpaidToday > 0 && (
        <div className="stat flex items-center justify-between mb-4 bg-red-50 border-red-200">
          <div>
            <div className="stat-label text-red-700">Unpaid Today</div>
            <div className="stat-value text-red-700">
              {totalUnpaidToday} appt{totalUnpaidToday > 1 ? "s" : ""} • $
              {totalUnpaidAmount.toFixed(2)}
            </div>
          </div>
          <span className="chip chip-danger">Action Needed</span>
        </div>
      )}

      <div className="card mb-6 shadow-md border border-gray-200">
        <div className="card-body flex flex-col md:flex-row gap-6">
          <div className="relative overflow-visible z-20">
            <DatePicker
              selected={parseYMD(selectedDate)}
              onChange={(d) => d && setSelectedDate(toYMD(d))}
              dateFormat="yyyy-MM-dd"
              className="border p-2 rounded w-full"
              inline={window.innerWidth < 500}
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
                    Capacity: {capacity} dog{capacity > 1 ? "s" : ""}
                  </span>
                </>
              ) : (
                "No working hours set for this weekday — update your profile schedule."
              )}
            </div>

            <div className="schedule-legend flex flex-wrap gap-3 text-xs text-gray-600">
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
                {/* Header Row */}
                <div className="border-b bg-gray-100 px-3 py-2 font-semibold text-gray-700 text-sm shadow-sm">
                  Time
                </div>
                {Array.from({ length: capacity }).map((_, idx) => (
                  <div
                    key={`h${idx}`}
                    className="border-b bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700 text-sm shadow-sm"
                  >
                    Slot {idx + 1}
                  </div>
                ))}

                {/* MAIN FIXED GRID RENDER */}
                {slotsWithInfo.map(({ slot, usedWeight }) => {
                  const isBreak = breakSlots.includes(slot);
                  const expanded = expandedSlotAppointments(slot);

                  return (
                    <React.Fragment key={slot}>
                      {/* TIME COLUMN */}
                      <div className="border-t px-2 py-1 text-gray-700 font-medium">
                        {slot}
                      </div>

                      {/* CAPACITY COLUMNS */}
                      {Array.from({ length: capacity }).map((_, idx) => {
                        const cellAppt = expanded[idx] || null;
                        const clickable = !isBreak && !cellAppt;

                        return (
                          <div
                            key={`${slot}-c${idx}`}
                            className={`border-t px-2 py-2 flex items-center justify-center ${
                              isBreak
                                ? "bg-gray-100 cursor-not-allowed"
                                : clickable
                                ? "cursor-pointer hover:bg-blue-50"
                                : "cursor-pointer"
                            }`}
                            onClick={() => {
                              if (isBreak) return;
                              if (!cellAppt) return openSlot(slot);
                              handleOpenEditModal(cellAppt);
                            }}
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
                              <div
                                className={`
                                  flex flex-col items-center text-[9px] leading-tight transition-all
                                  ${
                                    search.trim().length > 0 && matchesSearch(cellAppt, search)
                                      ? "search-match"
                                      : search.trim().length > 0
                                      ? "search-dim"
                                      : ""
                                  }

                                `}
                              >
                                <span
                                  className={`
                                    inline-block w-5 h-5 rounded
                                    ${
                                      usedWeight === 1
                                        ? "bg-green-300"
                                        : usedWeight < capacity
                                        ? "bg-orange-300"
                                        : "bg-red-300"
                                    }
                                  `}
                                ></span>

                                <span className="mt-0.5 text-center text-gray-700">
                                  {cellAppt.pets?.clients?.full_name ||
                                    "Client"}{" "}
                                  ({cellAppt.pets?.name || "Pet"})
                                </span>
                              </div>
                            ) : (
                              <span className="inline-block w-5 h-5 rounded border border-gray-200" />
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIST VIEW OF APPOINTMENTS BELOW GRID */}
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
                  search.trim().length > 0 && matchesSearch(appt, search)
                    ? "search-match"
                    : search.trim().length > 0
                    ? "search-dim"
                    : ""
                }
                ${isPast ? "opacity-60" : ""}`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-2 ${size.bar} rounded-l`}
                />

                <div className="card-body space-y-2">
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

                  <div className="flex items-center gap-2 text-xl font-bold text-gray-800">
                    {appt.pets?.name}
                    <span className={`chip ${size.bg}`}>{size.label}</span>
                  </div>

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

                  {appt.services?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(appt.services)
                        ? appt.services
                        : String(appt.services)
                            .split(",")
                            .map((s) => s.trim())
                      ).map((svc) => (
                        <span key={svc} className="chip chip-brand">
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

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

                  {appt.notes && (
                    <div className="text-sm italic text-gray-500">
                      {appt.notes}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      className="btn-secondary"
                      onClick={() => openRebookModal(appt)}
                    >
                      🔁 Rebook (6 Weeks)
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={() => handleOpenEditModal(appt)}
                    >
                      ✏️ Edit
                    </button>

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

      {/* MODALS */}
      <PetSelectModal
        open={petModalOpen}
        onClose={() => setPetModalOpen(false)}
        slot={modalSlot}
        date={selectedDate}
        pets={pets}
        loading={loadingPets}
        onPickPet={handlePickPet}
      />

      <NewAppointmentModal
        open={newModalOpen}
        onClose={() => {
          if (!savingNew) {
            setNewModalOpen(false);
            setNewPet(null);
          }
        }}
        pet={newPet}
        form={newForm}
        setForm={setNewForm}
        onSave={handleSaveNew}
        saving={savingNew}
      />

      <EditAppointmentModal
        open={editModalOpen}
        onClose={() => {
          if (!savingEdit) {
            setEditModalOpen(false);
            setEditAppt(null);
          }
        }}
        appt={editAppt}
        form={editForm}
        setForm={setEditForm}
        onSave={handleSaveEdit}
        onDelete={() => {
          if (editAppt) {
            handleDelete(editAppt.id);
            setEditModalOpen(false);
            setEditAppt(null);
          }
        }}
        saving={savingEdit}
      />

      <RebookWeekModal
        open={rebookModalOpen}
        appt={rebookAppt}
        onClose={() => {
          setRebookModalOpen(false);
          setRebookAppt(null);
        }}
        onPickDate={handleRebookDatePicked}
      />
    </main>
  );
}
