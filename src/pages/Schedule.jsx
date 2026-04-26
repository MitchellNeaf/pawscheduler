// src/pages/Schedule.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import Loader from "../components/Loader";
import ConfirmModal from "../components/ConfirmModal";
import DarkModeToggle from "../components/DarkModeToggle";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Utility: date formats
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

// Time slots (15-minute increments, 6:00–21:00)
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

// Basic service list for checkboxes
const SERVICE_OPTIONS = [
  "Bath",
  "Full Groom",
  "Nails",
  "Teeth",
  "Deshed",
  "Anal Glands",
  "Puppy Trim",
  "Other",
];

const DEFAULT_PRICING = {
  "Bath":        { 1: 25, 2: 40, 3: 60 },
  "Full Groom":  { 1: 45, 2: 65, 3: 90 },
  "Nails":       { 1: 15, 2: 15, 3: 20 },
  "Teeth":       { 1: 15, 2: 15, 3: 20 },
  "Deshed":      { 1: 35, 2: 55, 3: 75 },
  "Anal Glands": { 1: 15, 2: 15, 3: 20 },
  "Puppy Trim":  { 1: 40, 2: 55, 3: 75 },
  "Other":       { 1: 0,  2: 0,  3: 0  },
};

// Sum prices for selected services based on pet size (slot_weight)
const calcAmount = (services, slotWeight, pricing) => {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) };
  const sz = slotWeight || 1;
  return services.reduce((sum, svc) => {
    const row = p[svc];
    return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
  }, 0);
};

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

/* ---------------- Helpers ---------------- */
function isExpired(dateStr) {
  if (!dateStr) return true; // treat missing as expired
  const today = new Date().setHours(0, 0, 0, 0);
  const expires = new Date(dateStr).setHours(0, 0, 0, 0);
  return expires < today;
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return true; // treat missing as expiring soon
  const today = new Date().setHours(0, 0, 0, 0);
  const expires = new Date(dateStr).setHours(0, 0, 0, 0);
  const diffDays = (expires - today) / 86400000;
  return diffDays >= 0 && diffDays <= 30;
}

function getRabiesRecord(shot_records) {
  if (!Array.isArray(shot_records)) return null;
  return shot_records.find((r) =>
    (r.shot_type || "").toLowerCase().includes("rabies")
  );
}

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

function matchesSearch(appt, query) {
  if (!query.trim()) return true;
  const q = query.toLowerCase();

  return (
    appt.pets?.name?.toLowerCase().includes(q) ||
    appt.pets?.clients?.full_name?.toLowerCase().includes(q) ||
    appt.pets?.tags?.some((t) => t.toLowerCase().includes(q)) ||
    (
      Array.isArray(appt.services)
        ? appt.services
        : String(appt.services || "").split(",")
    )
      .join(" ")
      .toLowerCase()
      .includes(q)
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

/** Build bullet-list HTML for services (• item<br/>) */
function buildServicesHtml(services) {
  const arr = Array.isArray(services)
    ? services
    : services
    ? String(services)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!arr.length) return "—";
  return arr.map((s) => `• ${s}`).join("<br/>");
}

/** Build notes_block HTML row for template or empty string */
function buildNotesBlockHtml(notes) {
  if (!notes || !notes.trim()) return "";
  return `<tr><td><strong>Notes:</strong> ${notes}</td></tr>`;
}

/** Build confirm URL for email button */
function buildConfirmUrl(appointmentId) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/.netlify/functions/confirmAppointment?id=${appointmentId}`;
}

/** Fire-and-forget sendEmail confirmation */
async function sendConfirmationEmail({ appointment, groomerId }) {
  try {
    const pet = appointment.pets;
    const client = pet?.clients;
    if (!client?.email) return; // nothing to send to

    const servicesHtml = buildServicesHtml(appointment.services);
    const notesBlock = buildNotesBlockHtml(appointment.notes || "");
    const confirmUrl = buildConfirmUrl(appointment.id);

    await fetch("/.netlify/functions/sendEmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: client.email,
        subject: `Appointment confirmation for ${pet.name} on ${appointment.date}`,
        template: "confirmation",
        data: {
          groomer_id: groomerId,
          pet_name: pet.name,
          date: appointment.date,
          time: (appointment.time || "").slice(0, 5),
          duration_min: appointment.duration_min || 30,
          services: servicesHtml,
          price:
            typeof appointment.amount === "number"
              ? appointment.amount.toFixed(2)
              : "",
          notes_block: notesBlock,
          confirm_url: confirmUrl,
        },
      }),
    });
  } catch (err) {
    console.error("Error sending confirmation email:", err);
  }
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
              {filtered.map((pet) => {
                const sz = sizeBadge(pet.slot_weight || 1);

                return (
                  <li key={pet.id}>
                    <button
                      onClick={() => onPickPet(pet)}
                      className="w-full text-left border rounded px-3 py-2 hover:bg-blue-50 flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{pet.name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {pet.clients?.full_name}
                          </div>
                        </div>

                        {/* Size pill */}
                        <span
                          className={`shrink-0 px-2 py-1 rounded text-[11px] font-semibold ${sz.bg}`}
                          title="Capacity weight"
                        >
                          {sz.icon} {sz.label}
                        </span>
                      </div>

                      {pet.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
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
                );
              })}
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


/* ---------------- Multi-Pet New Appointment Modal ---------------- */
// Used only for creating new appointments — supports 1 or more pets.
// Each pet gets its own services/duration/amount.
// Shared fields: date, time, notes, reminder_enabled.
function MultiPetAppointmentModal({
  open, onClose,
  newPets, setNewPets,
  form, setForm,
  onSave, saving,
  onAddPet,
  pricing,
  workingRange, breakSlots,
  planTier,
}) {
  if (!open || !newPets.length) return null;

  const updatePetForm = (petId, field, value) => {
    setNewPets((prev) => prev.map((entry) =>
      entry.pet.id === petId
        ? { ...entry, form: { ...entry.form, [field]: value } }
        : entry
    ));
  };

  const togglePetService = (petId, svc) => {
    setNewPets((prev) => prev.map((entry) => {
      if (entry.pet.id !== petId) return entry;
      const exists = entry.form.services.includes(svc);
      const newServices = exists
        ? entry.form.services.filter((s) => s !== svc)
        : [...entry.form.services, svc];
      const slotWeight = entry.pet.slot_weight || 1;
      return {
        ...entry,
        form: {
          ...entry.form,
          services: newServices,
          amount: calcAmount(newServices, slotWeight, pricing),
        },
      };
    }));
  };

  const removePet = (petId) => {
    setNewPets((prev) => prev.filter((e) => e.pet.id !== petId));
  };

  const fmtTime = (slot) => {
    if (!slot) return slot;
    const [h, m] = slot.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold text-gray-800">New Appointment</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {newPets.length} dog{newPets.length > 1 ? "s" : ""} —{" "}
              {newPets.map(e => e.pet.name).join(" & ")}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 text-sm">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">

          {/* Shared: Date + Time */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Date</span>
              <input type="date" value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="border rounded px-2 py-1" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Time</span>
              {workingRange?.length > 0 ? (
                <select value={form.time}
                  onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  className="border rounded px-2 py-1">
                  <option value="">Select a time</option>
                  {workingRange
                    .filter((slot) => !(breakSlots || []).includes(slot))
                    .map((slot) => (
                      <option key={slot} value={slot}>{fmtTime(slot)}</option>
                    ))}
                </select>
              ) : (
                <input type="time" step={900} value={form.time}
                  onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  className="border rounded px-2 py-1" />
              )}
            </label>
          </div>

          {/* Per-pet sections */}
          {newPets.map(({ pet, form: petForm }, idx) => {
            const rabies = getRabiesRecord(pet.shot_records || []);
            const expired = isExpired(rabies?.date_expires);
            const expSoon = isExpiringSoon(rabies?.date_expires);

            return (
              <div key={pet.id} className="border rounded-xl overflow-hidden">
                {/* Pet header */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                  <div>
                    <span className="font-semibold text-sm text-gray-800">{pet.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{pet.clients?.full_name}</span>
                  </div>
                  {newPets.length > 1 && (
                    <button onClick={() => removePet(pet.id)}
                      className="text-red-400 hover:text-red-600 text-xs font-semibold">
                      Remove
                    </button>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  {/* Vaccine warning */}
                  {!rabies ? (
                    <div className="p-2 bg-yellow-100 text-yellow-800 text-xs rounded">⚠️ No rabies record on file</div>
                  ) : expired ? (
                    <div className="p-2 bg-red-100 text-red-700 text-xs rounded">⛔ Rabies expired on {rabies.date_expires}</div>
                  ) : expSoon ? (
                    <div className="p-2 bg-yellow-100 text-yellow-800 text-xs rounded">⚠️ Rabies expires soon ({rabies.date_expires})</div>
                  ) : null}

                  {/* Duration + Amount */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium text-gray-700">Duration</span>
                      <select value={petForm.duration_min}
                        onChange={(e) => updatePetForm(pet.id, "duration_min", Number(e.target.value))}
                        className="border rounded px-2 py-1">
                        {[15, 30, 45, 60, 90, 120].map((m) => (
                          <option key={m} value={m}>{m} min</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium text-gray-700">Amount ($)</span>
                      <input type="number" min="0" step="1"
                        value={petForm.amount ?? ""}
                        onChange={(e) => updatePetForm(pet.id, "amount", Number(e.target.value))}
                        className="border rounded px-2 py-1" placeholder="0" />
                    </label>
                  </div>

                  {/* Services */}
                  <div className="text-sm">
                    <div className="font-medium text-gray-700 mb-1">Services</div>
                    <div className="grid grid-cols-2 gap-1">
                      {SERVICE_OPTIONS.map((svc) => (
                        <label key={svc} className="flex items-center gap-2 text-xs text-gray-700">
                          <input type="checkbox"
                            checked={petForm.services.includes(svc)}
                            onChange={() => togglePetService(pet.id, svc)} />
                          {svc}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add another pet button */}
          <button type="button" onClick={onAddPet}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-semibold hover:border-emerald-400 hover:text-emerald-600 transition-colors">
            + Add another dog
          </button>

          {/* Shared: Notes + Reminder */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes (shared)</span>
            <textarea value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="border rounded px-2 py-1 min-h-[50px]" />
          </label>

          {(planTier === "basic" || planTier === "starter" || planTier === "pro") && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.reminder_enabled}
                onChange={(e) => setForm((p) => ({ ...p, reminder_enabled: e.target.checked }))} />
              Send appointment reminder?
            </label>
          )}
          {planTier === "free" && (
            <p className="text-xs text-[var(--text-3)]">
              🔒 Automatic reminders require Basic or higher. <a href="/upgrade" className="text-emerald-600 font-semibold">Upgrade →</a>
            </p>
          )}

          {/* Total summary */}
          {newPets.some(e => e.form.amount) && (
            <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 rounded-xl text-sm">
              <span className="text-emerald-700 font-medium">Total for all pets</span>
              <span className="font-bold text-emerald-800">
                ${newPets.reduce((sum, e) => sum + (e.form.amount || 0), 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving}
            className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-60">
            {saving ? "Saving..." : `Save ${newPets.length > 1 ? `${newPets.length} Appointments` : "Appointment"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Unified Appointment Modal ---------------- */
// Handles both New and Edit — pass isEdit=true for edit mode (shows Delete button).
// For new: pass pet={...} with shot_records. For edit: pass appt={...} with shot_records.
function AppointmentModal({
  open,
  onClose,
  isEdit,
  // New mode
  pet,
  // Edit mode
  appt,
  onDelete,
  // Shared
  form,
  setForm,
  onSave,
  saving,
  pricing,
  // Working hours for the selected date (from parent Schedule state)
  workingRange,
  breakSlots,
}) {
  if (!open) return null;
  if (isEdit && !appt) return null;
  if (!isEdit && !pet) return null;

  const subject     = isEdit ? appt : pet;
  const petName     = isEdit ? appt.pets?.name        : pet.name;
  const clientName  = isEdit ? appt.pets?.clients?.full_name : pet.clients?.full_name;
  const slotWeight  = isEdit
    ? (appt?.slot_weight || appt?.pets?.slot_weight || 1)
    : (pet?.slot_weight || 1);

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const value =
      field === "duration_min" ? Number(raw || 0) :
      field === "amount"       ? Number(raw) :
      raw;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleService = (svc) => {
    setForm((prev) => {
      const exists = prev.services.includes(svc);
      const newServices = exists
        ? prev.services.filter((s) => s !== svc)
        : [...prev.services, svc];
      return {
        ...prev,
        services: newServices,
        amount: calcAmount(newServices, slotWeight, pricing),
      };
    });
  };

  const rabies  = getRabiesRecord(subject.shot_records);
  const expired = isExpired(rabies?.date_expires);
  const expSoon = isExpiringSoon(rabies?.date_expires);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">
            {isEdit ? "Edit Appointment" : "New Appointment"}
          </h2>
          <button onClick={onClose} className="text-gray-500 text-sm">✕</button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">

          {/* Pet / client name */}
          <div className="text-sm text-gray-700">
            <div className="font-semibold">{petName}</div>
            <div className="text-xs text-gray-500">{clientName}</div>
          </div>

          {/* Rabies status */}
          {!rabies ? (
            <div className="p-2 bg-yellow-100 text-yellow-800 text-xs rounded">⚠️ No rabies record on file</div>
          ) : expired ? (
            <div className="p-2 bg-red-100 text-red-700 text-xs rounded">⛔ Rabies expired on {rabies.date_expires}</div>
          ) : expSoon ? (
            <div className="p-2 bg-yellow-100 text-yellow-800 text-xs rounded">⚠️ Rabies expires soon ({rabies.date_expires})</div>
          ) : (
            <div className="p-2 bg-green-100 text-green-700 text-xs rounded">🟢 Rabies up to date (expires {rabies.date_expires})</div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Date</span>
              <input type="date" value={form.date} onChange={handleChange("date")}
                className="border rounded px-2 py-1" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">Time</span>
              {workingRange && workingRange.length > 0 ? (
                <select
                  value={form.time}
                  onChange={handleChange("time")}
                  className="border rounded px-2 py-1"
                >
                  <option value="">Select a time</option>
                  {workingRange
                    .filter((slot) => !(breakSlots || []).includes(slot))
                    .map((slot) => {
                      const [h, m] = slot.split(":").map(Number);
                      const ampm = h >= 12 ? "PM" : "AM";
                      const h12 = h % 12 || 12;
                      return (
                        <option key={slot} value={slot}>
                          {h12}:{String(m).padStart(2, "0")} {ampm}
                        </option>
                      );
                    })}
                </select>
              ) : (
                <>
                  <input type="time" step={900} value={form.time}
                    onChange={handleChange("time")}
                    className="border rounded px-2 py-1" />
                  <span className="text-[11px] text-amber-600 mt-0.5">
                    ⚠️ No working hours set for this day — any time can be selected
                  </span>
                </>
              )}
            </label>
          </div>

          {/* Duration */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Duration</span>
            <select value={form.duration_min} onChange={handleChange("duration_min")}
              className="border rounded px-2 py-1">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>

          {/* Amount */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">
              Amount ($)
              {form.services.length > 0 && (
                <span className="ml-2 text-xs text-emerald-600 font-normal">
                  auto-calculated · override anytime
                </span>
              )}
            </span>
            <input type="number" min="0" step="1" value={form.amount ?? ""}
              onChange={handleChange("amount")} className="border rounded px-2 py-1"
              placeholder="Enter price" />
          </label>

          {/* Services */}
          <div className="text-sm">
            <div className="font-medium text-gray-700 mb-1">Services</div>
            <div className="grid grid-cols-2 gap-1">
              {SERVICE_OPTIONS.map((svc) => (
                <label key={svc} className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={form.services.includes(svc)}
                    onChange={() => toggleService(svc)} />
                  {svc}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes</span>
            <textarea value={form.notes} onChange={handleChange("notes")}
              className="border rounded px-2 py-1 min-h-[60px]" />
          </label>

          {/* Reminder toggle */}
          {(planTier === "basic" || planTier === "starter" || planTier === "pro") && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.reminder_enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, reminder_enabled: e.target.checked }))} />
              Send appointment reminder?
            </label>
          )}
          {planTier === "free" && (
            <p className="text-xs text-[var(--text-3)]">
              🔒 Automatic reminders require Basic or higher. <a href="/upgrade" className="text-emerald-600 font-semibold">Upgrade →</a>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className={`px-4 py-3 border-t flex gap-2 ${isEdit ? "justify-between" : "justify-end"}`}>
          {isEdit && (
            <button onClick={onDelete} disabled={saving}
              className="text-sm px-3 py-1 rounded border border-red-500 text-red-600 hover:bg-red-50">
              🗑 Delete
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving}
              className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={onSave} disabled={saving}
              className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-60">
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
    <label className="flex items-center gap-2 text-xs sm:text-sm">
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
              pets (
                *,
                clients (
                  id,
                  full_name,
                  phone,
                  email,
                  street,
                  city,
                  state,
                  zip
                )
              )

            `
            )
            .single();

          if (!error && data) {
            const { data: shots } = await supabase
              .from("pet_shot_records")
              .select("*")
              .eq("pet_id", data.pet_id)
              .order("date_expires", { ascending: false });

            const updated = { ...data, shot_records: shots || [] };

            setAppointments((prev) =>
              prev.map((a) => (a.id === appt.id ? updated : a))
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
  const diff = (day + 6) % 7; // Monday-start
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
    original.setDate(original.getDate() + 42); // 6 weeks

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
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white"
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
            onClick={() => onPickDate(selectedDate)}
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
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "grid"
  );

  const [petModalOpen, setPetModalOpen] = useState(false);
  const [modalSlot, setModalSlot] = useState(null);
  const [pets, setPets] = useState([]);
  const [loadingPets, setLoadingPets] = useState(false);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newPets, setNewPets] = useState([]); // array: { pet, form: { duration_min, services, amount } }
  const [newForm, setNewForm] = useState({
    date: "",
    time: "",
    notes: "",
    reminder_enabled: false,
  });
  const [savingNew, setSavingNew] = useState(false);
  const [planTier, setPlanTier] = useState("starter");
  const FREE_LIMIT = 50;
  const [requestingPayment, setRequestingPayment] = useState(null); // appt.id | null
  const [paymentSentFor, setPaymentSentFor] = useState(new Set());

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

  // ConfirmModal state (replaces window.confirm)
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Service pricing loaded from groomers.service_pricing
  const [pricing, setPricing] = useState(DEFAULT_PRICING);

  /* Load user */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Attach rabies shot records for a set of appointments
  const attachShotRecords = async (appts) => {
    if (!appts.length) return [];

    const petIds = Array.from(
      new Set(appts.map((a) => a.pet_id).filter(Boolean))
    );

    if (!petIds.length) return appts;

    const { data: shots } = await supabase
      .from("pet_shot_records")
      .select("*")
      .in("pet_id", petIds)
      .order("date_expires", { ascending: false });

    const grouped = {};
    (shots || []).forEach((s) => {
      if (!grouped[s.pet_id]) grouped[s.pet_id] = [];
      grouped[s.pet_id].push(s);
    });

    return appts.map((a) => ({
      ...a,
      shot_records: grouped[a.pet_id] || [],
    }));
  };

  /* Load schedule data */
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
          .select("max_parallel, service_pricing, plan_tier")
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
            services, notes, confirmed, no_show, paid, amount, reminder_enabled, source, appointment_group_id,
            pets (
              id, name, tags, client_id,
              clients (
                id,
                full_name,
                phone,
                email,
                sms_opt_in,
                street,
                city,
                state,
                zip
              )
            )

          `)
          .eq("groomer_id", user.id)
          .eq("date", selectedDate)
          .order("time", { ascending: true }),
      ]);

      setCapacity(groomer?.max_parallel || 1);
      if (groomer?.service_pricing) {
        setPricing({ ...DEFAULT_PRICING, ...groomer.service_pricing });
      }
      if (groomer?.plan_tier) {
        setPlanTier(groomer.plan_tier);
      }

      if (!hours) {
        const apptsWithShots = await attachShotRecords(appts || []);
        setWorkingRange([]);
        setBreakSlots([]);
        setAppointments(apptsWithShots);
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

      const apptsWithShots = await attachShotRecords(appts || []);
      setAppointments(apptsWithShots);
      setLoading(false);
    };

    loadDay();
  }, [user, selectedDate]);

  /* Delete appointment */
  const handleDelete = async (id) => {
    if (!user) return;

    setConfirmConfig({
      title: "Delete appointment?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase
          .from("appointments")
          .delete()
          .eq("id", id)
          .eq("groomer_id", user.id);

        if (error) {
          console.error("Delete error:", error.message);
          return;
        }
      },
    });
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

  /* Open empty slot → pick pet */
  const openSlot = async (slot) => {
    // Only update slot if opening fresh (not adding a second pet)
    if (!newPets.length) {
      setModalSlot(slot);
      // Reset shared form for a fresh booking
      setNewForm({
        date: selectedDate,
        time: slot,
        notes: "",
        reminder_enabled: false,
      });
    }
    setPetModalOpen(true);

    if (!pets.length && user) {
      setLoadingPets(true);
      const { data } = await supabase
        .from("pets")
        .select(`
          id, name, tags, client_id, slot_weight,
          default_services, default_duration_min,
          clients ( id, full_name )
        `)
        .eq("groomer_id", user.id)
        .order("name", { ascending: true });

      setPets(data || []);
      setLoadingPets(false);
    }
  };

  /* Pick pet → load shots → open New Appointment modal */
  const handlePickPet = async (pet) => {
    if (!pet || !modalSlot || !selectedDate) return;

    setPetModalOpen(false);

    const { data: shots } = await supabase
      .from("pet_shot_records")
      .select("*")
      .eq("pet_id", pet.id)
      .order("date_expires", { ascending: false });

    const petWithShots = { ...pet, shot_records: shots || [] };

    // Add this pet to the newPets array with its own form defaults
    setNewPets((prev) => {
      // Don't add same pet twice
      if (prev.find((p) => p.pet.id === pet.id)) return prev;
      return [
        ...prev,
        {
          pet: petWithShots,
          form: {
            duration_min: pet.default_duration_min || 30,
            services: pet.default_services || [],
            amount: pet.default_services?.length
              ? calcAmount(pet.default_services, pet.slot_weight || 1, pricing)
              : null,
          },
        },
      ];
    });

    // Set shared form fields only on first pet pick
    setNewForm((prev) => ({
      ...prev,
      date: selectedDate,
      time: modalSlot,
    }));

    setNewModalOpen(true);
  };

  /* Save new appointment(s) — supports multiple pets with shared group_id */
  const handleSaveNew = async () => {
    if (!user || !newPets.length) return;
    if (!newForm.date || !newForm.time) {
      setConfirmConfig({
        title: "Missing info",
        message: "Date and time are required before saving.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      return;
    }

    setSavingNew(true);

    // ── Free tier appointment limit check ──────────────────
    if (planTier === "free") {
      const { data: countData } = await supabase
        .rpc("get_monthly_appointment_count", { p_groomer_id: user.id });

      if (countData >= FREE_LIMIT) {
        setSavingNew(false);
        setConfirmConfig({
          title: "Monthly limit reached",
          message: `You've reached the ${FREE_LIMIT} appointment limit for the free plan this month. Upgrade to Basic or higher for unlimited appointments.`,
          confirmLabel: "Upgrade",
          cancelLabel: "Not now",
          onConfirm: () => { window.location.href = "/upgrade"; },
        });
        return;
      }
    }

    // Generate a shared group_id for multi-pet appointments
    const groupId = newPets.length > 1
      ? crypto.randomUUID()
      : null;

    const insertRows = newPets.map(({ pet, form }) => ({
      groomer_id:           user.id,
      pet_id:               pet.id,
      date:                 newForm.date,
      time:                 newForm.time,
      duration_min:         form.duration_min || 30,
      services:             form.services,
      notes:                newForm.notes,
      slot_weight:          pet.slot_weight || 1,
      reminder_enabled:     newForm.reminder_enabled,
      reminder_sent:        false,
      amount:               form.amount ?? null,
      appointment_group_id: groupId,
    }));

    const { data: savedAppts, error } = await supabase
      .from("appointments")
      .insert(insertRows)
      .select(`
        id, pet_id, groomer_id, date, time, duration_min, slot_weight,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled,
        appointment_group_id,
        pets (
          id, name, tags, client_id,
          clients ( id, full_name, phone, email )
        )
      `);

    setSavingNew(false);

    if (error) {
      setConfirmConfig({
        title: "Could not save",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      return;
    }

    // Fire confirmation email for first pet if reminder enabled
    if (newForm.reminder_enabled && savedAppts?.[0]) {
      sendConfirmationEmail({ appointment: savedAppts[0], groomerId: user.id });
    }

    // Attach shot records to each saved appointment
    const withShots = await attachShotRecords(savedAppts || []);

    setAppointments((prev) =>
      [...prev, ...withShots].sort((a, b) =>
        (a.time || "").localeCompare(b.time || "")
      )
    );

    setNewModalOpen(false);
    setNewPets([]);
    setModalSlot(null);
  };

  /* Edit appt → load shots → open edit modal */
  const handleOpenEditModal = async (appt) => {
    const servicesArray = Array.isArray(appt.services)
      ? appt.services
      : appt.services
      ? String(appt.services)
          .split(",")
          .map((s) => s.trim())
      : [];

    const { data: shots } = await supabase
      .from("pet_shot_records")
      .select("*")
      .eq("pet_id", appt.pet_id)
      .order("date_expires", { ascending: false });

    const apptWithShots = {
      ...appt,
      shot_records: shots || [],
    };

    setEditAppt(apptWithShots);

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

  /* Save Edit */
  const handleSaveEdit = async () => {
    if (!user || !editAppt) return;
    if (!editForm.date || !editForm.time) {
      setConfirmConfig({
        title: "Missing info",
        message: "Date and time are required before saving.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
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
        reminder_sent: false,
        slot_weight: editAppt.slot_weight || 1,
      })
      .eq("id", editAppt.id)
      .eq("groomer_id", user.id)
      .select(`
        id, pet_id, groomer_id, date, time, duration_min, slot_weight,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled, appointment_group_id,
        pets ( id, name, tags, client_id, clients ( id, full_name, phone, email ) )
      `)
      .single();

    setSavingEdit(false);

    if (error) {
      setConfirmConfig({
        title: "Could not save",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      return;
    }

    // fire-and-forget confirmation email if toggle on
    if (editForm.reminder_enabled) {
      sendConfirmationEmail({ appointment: data, groomerId: user.id });
    }

    const { data: shots } = await supabase
      .from("pet_shot_records")
      .select("*")
      .eq("pet_id", data.pet_id)
      .order("date_expires", { ascending: false });

    const withShots = { ...data, shot_records: shots || [] };

    setAppointments((prev) =>
      prev
        .map((a) => (a.id === editAppt.id ? withShots : a))
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    );

    setEditModalOpen(false);
    setEditAppt(null);
  };

  /* Send manual SMS reminder */
  const [sendingReminder, setSendingReminder] = useState(null); // appointmentId | null

  const handleRequestPayment = async (appt) => {
    if (!user) return;
    setRequestingPayment(appt.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/sendPaymentRequest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ appointmentId: appt.id }),
      });
      const json = await res.json();
      if (res.ok) {
        setPaymentSentFor((prev) => new Set([...prev, appt.id]));
        // If no SMS/email, copy link to clipboard
        if (!json.smsSent && !json.emailSent && json.paymentUrl) {
          navigator.clipboard.writeText(json.paymentUrl).catch(() => {});
        }
      } else {
        setConfirmConfig({
          title: "Payment Request Failed",
          message: json.error || "Could not send payment request. Please try again.",
          confirmLabel: "OK",
          onConfirm: () => {},
        });
      }
    } catch {
      setConfirmConfig({
        title: "Network Error",
        message: "Could not send payment request. Please check your connection.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    } finally {
      setRequestingPayment(null);
    }
  };

  const handleSendReminder = async (appt) => {
    const client = appt.pets?.clients;

    // Guard: no phone
    if (!client?.phone) {
      setConfirmConfig({
        title: "No phone number",
        message: `${client?.full_name || "This client"} doesn't have a phone number on file. Add one from the Clients page.`,
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      return;
    }

    // Guard: not opted in
    if (!client?.sms_opt_in) {
      setConfirmConfig({
        title: "Client not opted in",
        message: `${client?.full_name || "This client"} hasn't opted in to SMS reminders. Update their SMS settings from the Clients page.`,
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      return;
    }

    setSendingReminder(appt.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/sendManualSmsReminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ appointmentId: appt.id }),
      });

      const json = await res.json();

      if (!res.ok) {
        setConfirmConfig({
          title: "Reminder failed",
          message: json.error || "Something went wrong. Please try again.",
          confirmLabel: "OK",
          onConfirm: () => {},
        });
      } else {
        // Optimistically stamp sms_reminder_sent_at locally
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === appt.id
              ? { ...a, sms_reminder_sent_at: new Date().toISOString() }
              : a
          )
        );
        setConfirmConfig({
          title: "Reminder sent ✓",
          message: `SMS reminder sent to ${client.full_name}.`,
          confirmLabel: "OK",
          onConfirm: () => {},
        });
      }
    } catch (err) {
      setConfirmConfig({
        title: "Reminder failed",
        message: "Network error. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    } finally {
      setSendingReminder(null);
    }
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

  const filteredAppointments = appointments.filter((appt) =>
    matchesSearch(appt, search)
  );

  // Group appointments by appointment_group_id for display
  // Returns array of "display groups" — each is either a single appt or an array of linked appts
  const groupedAppointments = (() => {
    const seen = new Set();
    const groups = [];
    for (const appt of filteredAppointments) {
      if (seen.has(appt.id)) continue;
      seen.add(appt.id);
      if (appt.appointment_group_id) {
        const siblings = filteredAppointments.filter(
          (a) => a.appointment_group_id === appt.appointment_group_id
        );
        siblings.forEach((s) => seen.add(s.id));
        groups.push(siblings); // array = multi-pet group
      } else {
        groups.push([appt]); // single-element array = solo appt
      }
    }
    return groups;
  })();

  // Helper: get display name for a group
  const groupPetNames = (group) => {
    const names = group.map((a) => a.pets?.name).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(" & ");
    return `${names[0]} +${names.length - 1}`;
  };

  // Helper: get total amount for a group
  const groupTotal = (group) =>
    group.reduce((sum, a) => sum + (a.amount || 0), 0);

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
    <main className="px-2 sm:px-4 py-4 space-y-4 max-w-6xl mx-auto">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to Home
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <DarkModeToggle />
      </div>

      {user && <ScheduleTrialBanner userId={user.id} />}

      {/* ── DAY-AT-A-GLANCE SUMMARY BAR ── */}
      {appointments.length > 0 && (() => {
        const totalAppts    = appointments.length;
        const confirmed     = appointments.filter(a => a.confirmed).length;
        const totalRevenue  = appointments.reduce((s, a) => s + (a.amount || 0), 0);
        const hasWarnings   = appointments.some(a => {
          const r = getRabiesRecord(a.shot_records || []);
          return !r || isExpired(r.date_expires) || isExpiringSoon(r.date_expires);
        });

        return (
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {/* Total appointments */}
            <div className="bg-white border border-gray-200 rounded-xl px-2 py-2 text-center shadow-sm">
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide leading-none mb-1">Appts</div>
              <div className="text-lg font-bold text-gray-800 leading-none">{totalAppts}</div>
            </div>

            {/* Confirmed */}
            <div className="bg-white border border-gray-200 rounded-xl px-2 py-2 text-center shadow-sm">
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide leading-none mb-1">Conf.</div>
              <div className={`text-lg font-bold leading-none ${confirmed < totalAppts ? "text-amber-600" : "text-emerald-600"}`}>
                {confirmed}/{totalAppts}
              </div>
            </div>

            {/* Revenue */}
            <div className="bg-white border border-gray-200 rounded-xl px-2 py-2 text-center shadow-sm">
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide leading-none mb-1">Rev.</div>
              <div className="text-sm font-bold text-emerald-700 leading-none">${totalRevenue.toFixed(0)}</div>
            </div>

            {/* Unpaid / Warnings */}
            <div className={`rounded-xl px-2 py-2 text-center shadow-sm border
              ${totalUnpaidToday > 0 ? "bg-red-50 border-red-200" : hasWarnings ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide leading-none mb-1">
                {totalUnpaidToday > 0 ? "Unpaid" : "Alerts"}
              </div>
              <div className={`text-sm font-bold leading-none ${totalUnpaidToday > 0 ? "text-red-600" : hasWarnings ? "text-amber-600" : "text-emerald-600"}`}>
                {totalUnpaidToday > 0
                  ? `${totalUnpaidToday} / $${totalUnpaidAmount.toFixed(0)}`
                  : hasWarnings ? "⚠️" : "✓"}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="mb-4 flex flex-col gap-3" style={{position:"relative", zIndex:10}}>
          {/* Date navigation — arrow buttons on mobile, date picker on desktop */}
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={() => {
                const d = parseYMD(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(toYMD(d));
              }}
              className="flex-shrink-0 w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50 text-lg font-bold active:bg-gray-100"
              aria-label="Previous day"
            >‹</button>

            <div className="relative overflow-visible flex-1" style={{zIndex:50}}>
              <DatePicker
                selected={parseYMD(selectedDate)}
                onChange={(d) => d && setSelectedDate(toYMD(d))}
                dateFormat="EEE, MMM d"
                className="border p-2 rounded w-full text-sm text-center font-semibold cursor-pointer bg-white"
                id="schedule-date-input"
                popperPlacement="bottom"
              />
            </div>

            <button
              onClick={() => {
                const d = parseYMD(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(toYMD(d));
              }}
              className="flex-shrink-0 w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50 text-lg font-bold active:bg-gray-100"
              aria-label="Next day"
            >›</button>

            <button
              onClick={() => setSelectedDate(toYMD(new Date()))}
              className="flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-full border border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 whitespace-nowrap"
            >Today</button>
          </div>

          {/* View toggle — List/Grid */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode("list")}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: "999px 0 0 999px",
                border: "1px solid",
                borderColor: viewMode === "list" ? "#059669" : "#d1d5db",
                backgroundColor: viewMode === "list" ? "#059669" : "#ffffff",
                color: viewMode === "list" ? "#ffffff" : "#6b7280",
                cursor: "pointer",
              }}
            >☰ List</button>
            <button
              onClick={() => setViewMode("grid")}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: "0 999px 999px 0",
                border: "1px solid",
                borderLeft: "none",
                borderColor: viewMode === "grid" ? "#059669" : "#d1d5db",
                backgroundColor: viewMode === "grid" ? "#059669" : "#ffffff",
                color: viewMode === "grid" ? "#ffffff" : "#6b7280",
                cursor: "pointer",
              }}
            >⊞ Grid</button>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Search pet, client, tag, or service"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
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


            <div className="schedule-legend hidden sm:flex flex-wrap gap-3 text-xs text-gray-600">
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

      {viewMode === "grid" && workingRange.length > 0 && (
        <div className="card mb-6" style={{position:"relative", zIndex:1}}>
          <div className="card-body">
            <div className="overflow-x-auto">
              <div
                className="grid border rounded text-xs"
                style={{
                  gridTemplateColumns: `60px repeat(${capacity}, minmax(0, 1fr))`,
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

                {/* MAIN GRID BODY */}
                {slotsWithInfo.map(({ slot, usedWeight }) => {
                  const isBreak = breakSlots.includes(slot);
                  const expanded = expandedSlotAppointments(slot);

                  return (
                    <React.Fragment key={slot}>
                      {/* TIME COLUMN */}
                      <div className="border-t px-1 py-1 text-gray-700 font-medium text-[10px] leading-tight">
                        {slot.replace(/:00$/, "").replace(/^0/, "")}
                      </div>

                      {/* CAPACITY COLUMNS */}
                      {Array.from({ length: capacity }).map((_, idx) => {
                        const appt = expanded[idx] || null;
                        const clickable = !isBreak && !appt;

                        let vaccineIcon = null;
                        if (appt && appt.pets?.id) {
                          const rabies = getRabiesRecord(
                            appt.shot_records || []
                          );

                          if (!rabies) {
                            vaccineIcon = "⚠️";
                          } else if (isExpired(rabies.date_expires)) {
                            vaccineIcon = "⛔";
                          } else if (isExpiringSoon(rabies.date_expires)) {
                            vaccineIcon = "⚠️";
                          }
                        }

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
                              if (!appt) return openSlot(slot);
                              handleOpenEditModal(appt);
                            }}
                          >
                            {isBreak ? (
                              idx === 0 && (
                                <span className="text-[10px] text-gray-500">
                                  Break
                                </span>
                              )
                            ) : !appt ? (
                              <span className="inline-block w-5 h-5 rounded border border-dashed border-blue-300" />
                            ) : (
                              /* ── MINI APPOINTMENT CARD ── */
                              <div
                                className={`
                                  w-full rounded-xl px-2 py-1.5 text-left transition-all
                                  border-l-4
                                  ${appt.no_show
                                    ? "bg-gray-100 border-gray-400"
                                    : appt.confirmed
                                    ? "bg-emerald-50 border-emerald-400"
                                    : "bg-amber-50 border-amber-400"}
                                  ${search.trim().length > 0 && matchesSearch(appt, search)
                                    ? "search-match"
                                    : search.trim().length > 0
                                    ? "search-dim"
                                    : ""}
                                `}
                              >
                                {/* Pet name + vaccine icon */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-[11px] text-gray-900 truncate leading-tight">
                                    {(() => {
                                      if (!appt.appointment_group_id) return appt.pets?.name || "Pet";
                                      const siblings = appointments.filter(a => a.appointment_group_id === appt.appointment_group_id);
                                      if (siblings.length <= 1) return appt.pets?.name || "Pet";
                                      const idx = siblings.findIndex(a => a.id === appt.id);
                                      return idx === 0
                                        ? `${appt.pets?.name} +${siblings.length - 1}`
                                        : appt.pets?.name || "Pet";
                                    })()}
                                  </span>
                                  {vaccineIcon && (
                                    <span className="text-[11px] flex-shrink-0">{vaccineIcon}</span>
                                  )}
                                </div>

                                {/* Client name — tappable, stops propagation */}
                                <Link
                                  to={`/clients/${appt.pets?.clients?.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="block text-[10px] text-emerald-700 hover:underline truncate leading-tight mt-0.5"
                                >
                                  {appt.pets?.clients?.full_name || "Client"}
                                </Link>

                                {/* Time range + size dot */}
                                <div className="flex items-center gap-1 mt-1">
                                  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                    appt.slot_weight === 3 ? "bg-red-400"
                                    : appt.slot_weight === 2 ? "bg-orange-400"
                                    : "bg-green-400"
                                  }`} />
                                  <span className="text-[9px] text-gray-500 leading-none">
                                    {(appt.time || "").slice(0,5)}–{getEndTime((appt.time||"").slice(0,5), appt.duration_min||15)}
                                  </span>
                                </div>

                                {/* Status badge */}
                                <div className="mt-1">
                                  {appt.no_show ? (
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">No-show</span>
                                  ) : appt.confirmed ? (
                                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide">✓ Confirmed</span>
                                  ) : (
                                    <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">Unconfirmed</span>
                                  )}
                                </div>

                                {/* SMS bot badge */}
                                {appt.source === "sms_bot" && (
                                  <div className="mt-0.5">
                                    <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-none">
                                      📱 SMS
                                    </span>
                                  </div>
                                )}

                                {/* Quick Paid toggle — tap without opening modal */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const { data, error } = await supabase
                                      .from("appointments")
                                      .update({ paid: !appt.paid })
                                      .eq("id", appt.id)
                                      .eq("groomer_id", user.id)
                                      .select(`id, pet_id, groomer_id, date, time, duration_min, slot_weight,
                                        services, notes, confirmed, no_show, paid, amount, reminder_enabled, source, appointment_group_id,
                                        pets ( *, clients ( id, full_name, phone, email, street, city, state, zip ) )`)
                                      .single();
                                    if (!error && data) {
                                      setAppointments((prev) =>
                                        prev.map((a) => a.id === data.id ? { ...a, paid: data.paid } : a)
                                      );
                                    }
                                  }}
                                  className={`mt-1 w-full text-[9px] font-bold rounded px-1 py-0.5 leading-none border transition-colors
                                    ${appt.paid
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                      : "bg-white text-gray-400 border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300"
                                    }`}
                                >
                                  {appt.paid ? "✓ Paid" : "$ Unpaid"}
                                </button>
                              </div>
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

      {/* LIST VIEW */}
      {viewMode === "list" && (filteredAppointments.length === 0 ? (
        <p className="text-gray-600 italic">
          No appointments for this day (or search filter).
        </p>
      ) : (
        <div className="grid gap-4">
          {groupedAppointments.map((group) => {
            const appt = group[0]; // primary appointment for shared fields
            const isMulti = group.length > 1;
            const start = (appt.time || "00:00").slice(0, 5);
            const end = getEndTime(start, Math.max(...group.map(a => a.duration_min || 15)));
            const size = sizeBadge(appt.slot_weight || 1);
            const displayName = groupPetNames(group);
            const totalAmount = groupTotal(group);

            const rabies = getRabiesRecord(appt.shot_records || []);
            let vaccineIcon = null;
            if (!rabies) vaccineIcon = "⚠️";
            else if (isExpired(rabies.date_expires)) vaccineIcon = "⛔";
            else if (isExpiringSoon(rabies.date_expires)) vaccineIcon = "⚠️";

            const [y, m, d] = appt.date.split("-").map(Number);
            const [H, M] = start.split(":").map(Number);
            const localStart = new Date(y, m - 1, d, H, M);
            const isPast = localStart < new Date();

            const servicesText = isMulti
              ? group.map(a => `${a.pets?.name}: ${(Array.isArray(a.services) ? a.services : [a.services || ""]).join(", ")}`).join(" | ")
              : Array.isArray(appt.services) ? appt.services.join(", ") : appt.services || "";

            return (
              <div
                key={isMulti ? appt.appointment_group_id : appt.id}
                className={`card relative pt-2 transition-all ${
                  search.trim().length > 0 && matchesSearch(appt, search)
                    ? "search-match"
                    : search.trim().length > 0
                    ? "search-dim"
                    : ""
                } ${isPast ? "opacity-60" : ""}`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-2 ${size.bar} rounded-l`}
                />

                <div className="card-body space-y-3">
                  {/* Top row: time + size + vaccine */}
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <div className="text-sm text-gray-500">{appt.date}</div>
                      <div className="text-lg font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        {start} – {end}
                        <span>{size.icon}</span>
                        {vaccineIcon && (
                          <span className="text-xl">{vaccineIcon}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-sm text-gray-500 text-right">
                      {appt.duration_min} min
                      {totalAmount > 0 && (
                        <div className="font-semibold text-gray-800">
                          ${totalAmount.toFixed(2)}
                          {isMulti && <span className="text-xs text-gray-400 ml-1">total</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pet + Client + Tags */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {displayName}{" "}
                        {isMulti && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Multi</span>}
                        {!isMulti && <span className="text-xs text-gray-500">{size.label}</span>}
                      </div>
                      <div className="text-sm text-gray-700">
                        {appt.pets?.clients?.full_name || "Client"}
                      </div>

                      {appt.pets?.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {appt.pets.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 text-[11px] rounded bg-gray-100 text-gray-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Contact buttons */}
                    <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                      {appt.pets?.clients?.phone && (
                        <>
                          <a
                            href={`tel:${appt.pets.clients.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 border rounded hover:bg-gray-50 flex items-center gap-1"
                          >
                            📞 Call
                          </a>

                          <a
                            href={`sms:${appt.pets.clients.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 border rounded hover:bg-gray-50 flex items-center gap-1"
                          >
                            💬 Text
                          </a>
                        </>
                      )}

                      {appt.pets?.clients?.street &&
                        appt.pets?.clients?.city &&
                        appt.pets?.clients?.state &&
                        appt.pets?.clients?.zip && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              `${appt.pets.clients.street}, ${appt.pets.clients.city}, ${appt.pets.clients.state} ${appt.pets.clients.zip}`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 border rounded hover:bg-gray-50 flex items-center gap-1"
                          >
                            📍 Navigate
                          </a>
                        )}
                    </div>

                  </div>

                  {/* Services & Notes */}
                  {(servicesText || appt.notes) && (
                    <div className="text-xs sm:text-sm text-gray-700 space-y-1">
                      {servicesText && (
                        <div>
                          <span className="font-semibold">Services: </span>
                          <span>{servicesText}</span>
                        </div>
                      )}
                      {appt.notes && (
                        <div>
                          <span className="font-semibold">Notes: </span>
                          <span>{appt.notes}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 mt-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        onClick={() => handleOpenEditModal(appt)}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 flex-1 sm:flex-none"
                      >
                        ✏️ Edit
                      </button>

                      <button
                        onClick={() => openRebookModal(appt)}
                        className="px-3 py-1.5 text-sm rounded border border-blue-500 text-blue-600 hover:bg-blue-50 flex-1 sm:flex-none"
                      >
                        🔁 Rebook 6 weeks
                      </button>

                      {/* SMS reminder — basic+ only, only if client has phone */}
                      {(planTier === "basic" || planTier === "starter" || planTier === "pro") && appt.pets?.clients?.phone && (
                        <button
                          onClick={() => handleSendReminder(appt)}
                          disabled={sendingReminder === appt.id}
                          className={`px-3 py-1.5 text-sm rounded border flex-1 sm:flex-none transition-colors
                            ${appt.pets.clients.sms_opt_in
                              ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                              : "border-gray-300 text-gray-400 cursor-not-allowed"
                            } disabled:opacity-50`}
                          title={appt.pets.clients.sms_opt_in ? "Send SMS reminder" : "Client not opted in to SMS"}
                        >
                          {sendingReminder === appt.id ? "Sending…" : "💬 Remind"}
                        </button>
                      )}

                      {/* Request Payment button */}
                      {!appt.paid && appt.amount > 0 && (
                        <button
                          onClick={() => handleRequestPayment(appt)}
                          disabled={requestingPayment === appt.id}
                          className={`px-3 py-1.5 text-sm rounded border flex-1 sm:flex-none transition-colors disabled:opacity-50
                            ${paymentSentFor.has(appt.id)
                              ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                              : "border-blue-500 text-blue-700 hover:bg-blue-50"
                            }`}
                          title="Send payment request to client"
                        >
                          {requestingPayment === appt.id
                            ? "Sending…"
                            : paymentSentFor.has(appt.id)
                            ? "✓ Payment Sent"
                            : "💳 Request Payment"}
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(appt.id)}
                        className="px-3 py-1.5 text-sm rounded border border-red-500 text-red-600 hover:bg-red-50 flex-1 sm:flex-none"
                      >
                        🗑 Delete
                      </button>
                    </div>

                    <div className="flex gap-4 items-center pt-1">
                      <ToggleCheckbox
                        label="Confirmed"
                        field="confirmed"
                        appt={appt}
                        user={user}
                        setAppointments={setAppointments}
                      />
                      <ToggleCheckbox
                        label="No-show"
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
              </div>
            );
          })}
        </div>
      ))}

      {/* Modals */}
      <PetSelectModal
        open={petModalOpen}
        onClose={() => setPetModalOpen(false)}
        slot={modalSlot}
        date={selectedDate}
        pets={pets}
        loading={loadingPets}
        onPickPet={handlePickPet}
      />

      <MultiPetAppointmentModal
        open={newModalOpen}
        onClose={() => { setNewModalOpen(false); setNewPets([]); setModalSlot(null); }}
        newPets={newPets}
        setNewPets={setNewPets}
        form={newForm}
        setForm={setNewForm}
        onSave={handleSaveNew}
        saving={savingNew}
        onAddPet={() => { setNewModalOpen(false); setPetModalOpen(true); }}
        pricing={pricing}
        workingRange={workingRange}
        breakSlots={breakSlots}
        planTier={planTier}
      />

      <AppointmentModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        isEdit={true}
        appt={editAppt}
        planTier={planTier}
        form={editForm}
        setForm={setEditForm}
        onSave={handleSaveEdit}
        onDelete={() => {
          if (editAppt) handleDelete(editAppt.id);
          setEditModalOpen(false);
        }}
        saving={savingEdit}
        pricing={pricing}
        workingRange={workingRange}
        breakSlots={breakSlots}
      />

      <RebookWeekModal
        open={rebookModalOpen}
        appt={rebookAppt}
        onClose={() => setRebookModalOpen(false)}
        onPickDate={handleRebookDatePicked}
      />

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </main>
  );
}