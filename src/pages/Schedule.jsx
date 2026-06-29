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

// Format a 24-hour "HH:MM" string as 12-hour with AM/PM
function fmt12Hour(slot) {
  if (!slot) return slot;
  const [h, m] = slot.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

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

// Format date for emails
function fmtEmailDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
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
  "Bath":        { 1: 25, 2: 30, 3: 40, 4: 60 },
  "Full Groom":  { 1: 45, 2: 55, 3: 65, 4: 90 },
  "Nails":       { 1: 15, 2: 15, 3: 15, 4: 20 },
  "Teeth":       { 1: 15, 2: 15, 3: 15, 4: 20 },
  "Deshed":      { 1: 35, 2: 45, 3: 55, 4: 75 },
  "Anal Glands": { 1: 15, 2: 15, 3: 15, 4: 20 },
  "Puppy Trim":  { 1: 40, 2: 45, 3: 55, 4: 75 },
  "Other":       { 1: 0,  2: 0,  3: 0,  4: 0  },
};

// Size category (pricing tier) — 1=Small, 2=Medium, 3=Large, 4=XL.
// Distinct from slot_weight, which is booking capacity (Small/Medium both = 1 slot).

// Sum prices for selected services based on pet size category (pricing tier)
const calcAmount = (services, sizeCategory, pricing, addonOptions = []) => {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) };
  const sz = sizeCategory || 1;
  const addonNames = new Set((addonOptions || []).map(a => a.name));
  return services
    .filter(s => !addonNames.has(s))
    .reduce((sum, svc) => {
      const row = p[svc];
      return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
    }, 0);
};

// Sum flat prices for selected add-ons or fees by name
const calcFlatItems = (services, items) =>
  (items || [])
    .filter(item => services.includes(item.name))
    .reduce((sum, item) => sum + (item.price || 0), 0);

/* ---------------- Trial Banner — replaced by inline progress bar ---------------- */
// (removed — single count shown in progress bar below)


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

function sizeBadge(sizeCategory) {
  switch (sizeCategory) {
    case 1:
      return {
        label: "Small",
        bg: "bg-green-200 text-green-800",
        bar: "bg-green-400",
        icon: "🟩",
      };
    case 2:
      return {
        label: "Medium",
        bg: "bg-lime-200 text-lime-800",
        bar: "bg-lime-400",
        icon: "🟨",
      };
    case 3:
      return {
        label: "Large",
        bg: "bg-orange-200 text-orange-800",
        bar: "bg-orange-400",
        icon: "🟧",
      };
    case 4:
      return {
        label: "XL",
        bg: "bg-red-200 text-red-800",
        bar: "bg-red-400",
        icon: "🟥",
      };
    default:
      return {
        label: "Small",
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
                const sz = sizeBadge(pet.size_category || 1);

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
  serviceOptions,
  addonOptions = [],
  feeOptions = [],
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
      const sizeCategory = entry.pet.size_category || 1;
      const serviceAmt = calcAmount(newServices, sizeCategory, pricing, addonOptions);
      const addonAmt   = calcFlatItems(newServices, addonOptions);
      const feeAmt     = calcFlatItems(newServices, feeOptions);

      // Auto-calculate duration from service durations
      const totalDuration = newServices.reduce((sum, name) => {
        const svcDef = (serviceOptions || []).find(s => (typeof s === "string" ? s : s.name) === name);
        return sum + (svcDef?.duration_min || 0);
      }, 0);

      return {
        ...entry,
        form: {
          ...entry.form,
          services: newServices,
          amount: serviceAmt + addonAmt + feeAmt,
          ...(totalDuration > 0 ? { duration_min: Math.min(totalDuration, 480) } : {}),
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
                      <span className="font-medium text-gray-700">
                        Duration
                        {(() => {
                          const total = petForm.services?.reduce((sum, name) => {
                            const svcDef = (serviceOptions || []).find(s => (typeof s === "string" ? s : s.name) === name);
                            return sum + (svcDef?.duration_min || 0);
                          }, 0);
                          return total > 0 ? <span className="ml-1 text-xs text-emerald-600 font-normal">⚡ auto</span> : null;
                        })()}
                      </span>
                      <select value={petForm.duration_min}
                        onChange={(e) => updatePetForm(pet.id, "duration_min", Number(e.target.value))}
                        className="border rounded px-2 py-1">
                        {[15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480].map((m) => (
                          <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m/60)}h${m%60 ? ` ${m%60}m` : ""}`}</option>
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

                  {/* Services / Add-ons / Fees */}
                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-700 mb-1">Services</div>
                      <div className="grid grid-cols-2 gap-1">
                        {serviceOptions.map((svc) => {
                          const svcName = typeof svc === "string" ? svc : svc.name;
                          return (
                            <label key={svcName} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                              <input type="checkbox"
                                checked={petForm.services.includes(svcName)}
                                onChange={() => togglePetService(pet.id, svcName)} />
                              {svcName}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {addonOptions.length > 0 && (
                      <div className="text-sm">
                        <div className="font-medium text-gray-700 mb-1">Add-ons</div>
                        <div className="space-y-1">
                          {addonOptions.map((addon) => (
                            <label key={addon.name} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors text-xs
                              ${petForm.services.includes(addon.name)
                                ? "border-violet-300 bg-violet-50 text-violet-800"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:border-violet-200"}`}>
                              <input type="checkbox"
                                checked={petForm.services.includes(addon.name)}
                                onChange={() => togglePetService(pet.id, addon.name)}
                                className="accent-violet-600" />
                              <span className="flex-1 font-medium">{addon.name}</span>
                              {addon.price > 0 && <span className="font-bold text-violet-600">+${addon.price.toFixed(2)}</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {feeOptions.length > 0 && (
                      <div className="text-sm">
                        <div className="font-medium text-gray-700 mb-1">Fees</div>
                        <div className="space-y-1">
                          {feeOptions.map((fee) => (
                            <label key={fee.name} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors text-xs
                              ${petForm.services.includes(fee.name)
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-200"}`}>
                              <input type="checkbox"
                                checked={petForm.services.includes(fee.name)}
                                onChange={() => togglePetService(pet.id, fee.name)}
                                className="accent-amber-600" />
                              <span className="flex-1 font-medium">{fee.name}</span>
                              {fee.price > 0 && <span className="font-bold text-amber-600">+${fee.price.toFixed(2)}</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add another pet button — Growth+ only */}
          {(planTier === "growth" || planTier === "pro") ? (
            <button type="button" onClick={onAddPet}
              className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-semibold hover:border-emerald-400 hover:text-emerald-600 transition-colors">
              + Add another dog
            </button>
          ) : (
            <a href="/upgrade"
              className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm font-semibold text-center block opacity-60 hover:opacity-100 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
              🔒 Multi-pet bookings — Growth+ only
            </a>
          )}

          {/* Shared: Notes + Reminder */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes (shared)</span>
            <textarea value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="border rounded px-2 py-1 min-h-[50px]" />
          </label>

          {(planTier === "basic" || planTier === "growth" || planTier === "pro") && (
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

          {/* Recurring */}
          {newPets.length === 1 && (
            <div className="rounded-xl border border-[var(--border-med)] bg-[var(--surface)] p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)] cursor-pointer">
                <input type="checkbox" checked={!!form.recurring}
                  onChange={(e) => setForm(p => ({ ...p, recurring: e.target.checked, recurringFreq: p.recurringFreq || "weekly", recurringEnd: p.recurringEnd || "" }))} />
                🔁 Make this recurring
              </label>
              {form.recurring && (
                <div className="space-y-2 pl-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-2)]">Repeats</span>
                    <select value={form.recurringFreq || "weekly"}
                      onChange={(e) => setForm(p => ({ ...p, recurringFreq: e.target.value }))}
                      className="border rounded px-2 py-1 text-sm bg-[var(--bg)] text-[var(--text-1)]">
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-2)]">Until</span>
                    <input type="date" value={form.recurringEnd || ""}
                      onChange={(e) => setForm(p => ({ ...p, recurringEnd: e.target.value }))}
                      min={form.date}
                      className="border rounded px-2 py-1 text-sm bg-[var(--bg)] text-[var(--text-1)]" />
                  </div>
                  <p className="text-[11px] text-[var(--text-3)]">Creates appointments on this schedule up to 6 months out. Full slots are skipped — you'll see a summary after saving.</p>
                </div>
              )}
            </div>
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
  planTier,
  serviceOptions,
  addonOptions = [],
  feeOptions = [],
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!open) return null;
  if (isEdit && !appt) return null;
  if (!isEdit && !pet) return null;

  const subject     = isEdit ? appt : pet;
  const petName     = isEdit ? appt.pets?.name        : pet.name;
  const clientName  = isEdit ? appt.pets?.clients?.full_name : pet.clients?.full_name;
  const sizeCategory = isEdit
    ? (appt?.size_category || appt?.pets?.size_category || 1)
    : (pet?.size_category || 1);

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
      const serviceAmt = calcAmount(newServices, sizeCategory, pricing, addonOptions);
      const addonAmt   = calcFlatItems(newServices, addonOptions);
      const feeAmt     = calcFlatItems(newServices, feeOptions);
      return {
        ...prev,
        services: newServices,
        amount: serviceAmt + addonAmt + feeAmt,
      };
    });
  };

  const rabies  = getRabiesRecord(subject.shot_records);
  const expired = isExpired(rabies?.date_expires);
  const expSoon = isExpiringSoon(rabies?.date_expires);

  const petPhotoUrl = isEdit ? appt.pets?.photo_url : pet.photo_url;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">

      {/* Photo lightbox */}
      {lightboxOpen && petPhotoUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={petPhotoUrl}
            alt={petName}
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/40 transition"
          >✕</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b relative">
          <h2 className="font-semibold text-gray-800">
            {isEdit ? "Edit Appointment" : "New Appointment"}
          </h2>
          <div className="flex items-center gap-2">
            {petPhotoUrl && (
              <img
                src={petPhotoUrl}
                alt={petName}
                onClick={() => setLightboxOpen(true)}
                className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 cursor-pointer hover:opacity-90 transition"
              />
            )}
            <button onClick={onClose} className="text-gray-500 text-sm">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">

          {/* Pet / client name */}
          <div className="text-sm text-gray-700">
            <div className="font-semibold">{petName}</div>
            <div className="text-xs text-gray-500">{clientName}</div>
          </div>

          {/* Pet notes — shown prominently if set */}
          {(isEdit ? appt.pets?.notes : pet.notes) && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
              <span className="font-bold">📋 Pet notes: </span>
              {isEdit ? appt.pets?.notes : pet.notes}
            </div>
          )}

          {/* Client notes — shown if set */}
          {(isEdit ? appt.pets?.clients?.notes : pet.clients?.notes) && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 leading-relaxed">
              <span className="font-bold">👤 Client notes: </span>
              {isEdit ? appt.pets?.clients?.notes : pet.clients?.notes}
            </div>
          )}

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
              {[15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m/60)}h${m%60 ? ` ${m%60}m` : ""}`}</option>
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

          {/* Services / Add-ons / Fees */}
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium text-gray-700 mb-1">Services</div>
              <div className="grid grid-cols-2 gap-1">
                {serviceOptions.map((svc) => {
                  const svcName = typeof svc === "string" ? svc : svc.name;
                  return (
                    <label key={svcName} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form.services.includes(svcName)}
                        onChange={() => toggleService(svcName)} />
                      {svcName}
                    </label>
                  );
                })}
              </div>
            </div>

            {addonOptions.length > 0 && (
              <div className="text-sm">
                <div className="font-medium text-gray-700 mb-1">Add-ons</div>
                <div className="space-y-1">
                  {addonOptions.map((addon) => (
                    <label key={addon.name} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors text-xs
                      ${form.services.includes(addon.name)
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-violet-200"}`}>
                      <input type="checkbox" checked={form.services.includes(addon.name)}
                        onChange={() => toggleService(addon.name)} className="accent-violet-600" />
                      <span className="flex-1 font-medium">{addon.name}</span>
                      {addon.price > 0 && <span className="font-bold text-violet-600">+${addon.price.toFixed(2)}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {feeOptions.length > 0 && (
              <div className="text-sm">
                <div className="font-medium text-gray-700 mb-1">Fees</div>
                <div className="space-y-1">
                  {feeOptions.map((fee) => (
                    <label key={fee.name} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors text-xs
                      ${form.services.includes(fee.name)
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-200"}`}>
                      <input type="checkbox" checked={form.services.includes(fee.name)}
                        onChange={() => toggleService(fee.name)} className="accent-amber-600" />
                      <span className="flex-1 font-medium">{fee.name}</span>
                      {fee.price > 0 && <span className="font-bold text-amber-600">+${fee.price.toFixed(2)}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes</span>
            <textarea value={form.notes} onChange={handleChange("notes")}
              className="border rounded px-2 py-1 min-h-[60px]" />
          </label>

          {/* Payment Method — selecting one auto-marks as paid */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Payment Method</span>
            <select
              value={form.payment_method || ""}
              onChange={(e) => {
                const method = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  payment_method: method,
                  // Auto-mark paid when a method is selected, unmark when cleared
                  paid: method ? true : prev.paid,
                }));
              }}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">Not recorded</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="cashapp">Cash App</option>
              <option value="venmo">Venmo</option>
              <option value="zelle">Zelle</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
            {form.payment_method && (
              <p className="text-xs text-emerald-600 font-medium">✓ Appointment will be marked as paid</p>
            )}
          </label>

          {/* Tip — only shows when a payment method is selected */}
          {form.payment_method && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Tip</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.tip || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, tip: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-28"
                />
                {form.tip && parseFloat(form.tip) > 0 && (
                  <span className="text-xs text-emerald-600 font-medium">✓ ${parseFloat(form.tip).toFixed(2)} tip</span>
                )}
              </div>
            </label>
          )}

          {/* Reminder toggle */}
          {(planTier === "basic" || planTier === "growth" || planTier === "pro") && (
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
// ── Check In / Check Out helper ──────────────────────────────
function fmtCheckinTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function elapsedTime(inTs, outTs) {
  if (!inTs || !outTs) return null;
  const mins = Math.round((new Date(outTs) - new Date(inTs)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

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
              id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category,
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

/* ---------------- Day Action Modal (Month View) ---------------- */
function DayActionModal({ date, onClose, onGoToDay, onAddBooking, onAddTimeBlock }) {
  const [mode, setMode] = useState(null);
  const [tbFullDay, setTbFullDay] = useState(false);
  const [tbStart, setTbStart] = useState("08:00");
  const [tbEnd, setTbEnd] = useState("09:00");
  const [tbNote, setTbNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!date) return null;

  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        style={{ isolation: "isolate" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100">{label}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {mode === null && (
          <div className="p-4 space-y-2">
            <button onClick={onGoToDay}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              <span className="text-xl">📅</span>
              <div>
                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Go to Day</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">View and manage this day's schedule</div>
              </div>
            </button>
            <button onClick={onAddBooking}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition text-left">
              <span className="text-xl">🐾</span>
              <div>
                <div className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">Add Booking</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400">Book a grooming appointment</div>
              </div>
            </button>
            <button onClick={() => setMode("timeblock")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition text-left">
              <span className="text-xl">🚫</span>
              <div>
                <div className="font-semibold text-sm text-blue-800 dark:text-blue-300">Add Time Block</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">Block time off (appointment, errand, etc.)</div>
              </div>
            </button>
          </div>
        )}

        {mode === "timeblock" && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Block time off on <strong className="text-gray-800 dark:text-gray-200">{label}</strong></p>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={tbFullDay} onChange={e => setTbFullDay(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              All day (no specific time range)
            </label>
            {!tbFullDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Start time</span>
                  <input type="time" value={tbStart} onChange={(e) => setTbStart(e.target.value)}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">End time</span>
                  <input type="time" value={tbEnd} onChange={(e) => setTbEnd(e.target.value)}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm" />
                </label>
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Note (optional)</span>
              <input type="text" value={tbNote} onChange={(e) => setTbNote(e.target.value)}
                placeholder="e.g. Vet appointment, lunch, etc."
                className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm" />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setMode(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                ← Back
              </button>
              <button onClick={() => onAddTimeBlock(date, tbFullDay ? null : tbStart, tbFullDay ? null : tbEnd, tbNote, setSaving)}
                disabled={saving || (!tbFullDay && (!tbStart || !tbEnd || tbEnd <= tbStart))}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50">
                {saving ? "Saving…" : "Save Block"}
              </button>
            </div>
            {!tbFullDay && tbEnd <= tbStart && <p className="text-xs text-red-500">End time must be after start time.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Edit Time Block Modal ---------------- */
function EditTimeBlockModal({ block, onClose, onSave }) {
  const [fullDay, setFullDay] = useState(!!block.fullDay);
  const [start, setStart] = useState((block.break_start || "").slice(0, 5));
  const [end, setEnd] = useState((block.break_end || "").slice(0, 5));
  const [note, setNote] = useState(block.label || block.reason || "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">Edit Time Block</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={fullDay} onChange={e => setFullDay(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            All day (no specific time range)
          </label>
          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Start time</span>
                <input type="time" value={start} onChange={e => setStart(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">End time</span>
                <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm" />
              </label>
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Note (optional)</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Vacation, lunch, vet appointment"
              className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm" />
          </label>
          {!fullDay && end && start && end <= start && <p className="text-xs text-red-500">End time must be after start time.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition">Cancel</button>
            <button disabled={saving || (!fullDay && (!start || !end || end <= start))}
              onClick={async () => { setSaving(true); await onSave(block.id, fullDay ? null : start, fullDay ? null : end, note); setSaving(false); }}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Month View Component ---------------- */
function MonthView({ userId, selectedDate, onDayClick, monthOffset, setMonthOffset, refreshKey }) {
  const [monthAppts, setMonthAppts] = useState([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [vacationDays, setVacationDays] = useState([]);

  const base = parseYMD(selectedDate);
  const displayMonth = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  useEffect(() => {
    if (!userId) return;
    setLoadingMonth(true);
    Promise.all([
      supabase.from("appointments")
        .select("id, date, time, pets(name, clients(full_name)), confirmed, no_show, paid")
        .eq("groomer_id", userId).gte("date", monthStart).lte("date", monthEnd)
        .order("time", { ascending: true }),
      supabase.from("vacation_days")
        .select("id, date, start_time, end_time")
        .eq("groomer_id", userId).gte("date", monthStart).lte("date", monthEnd),
    ]).then(([{ data: appts }, { data: vacs }]) => {
      setMonthAppts(appts || []);
      setVacationDays(vacs || []);
      setLoadingMonth(false);
    });
  }, [userId, monthStart, monthEnd, refreshKey]);

  const firstWeekday = new Date(year, month, 1).getDay();
  const totalCells = firstWeekday + lastDay;
  const cells = Array.from({ length: Math.ceil(totalCells / 7) * 7 }, (_, i) => {
    const dayNum = i - firstWeekday + 1;
    return dayNum >= 1 && dayNum <= lastDay ? dayNum : null;
  });

  const todayStr = toYMD(new Date());
  const apptsByDate = {};
  (monthAppts || []).forEach((a) => {
    if (!apptsByDate[a.date]) apptsByDate[a.date] = [];
    apptsByDate[a.date].push(a);
  });
  const vacsByDate = {};
  (vacationDays || []).forEach((v) => {
    if (!vacsByDate[v.date]) vacsByDate[v.date] = [];
    vacsByDate[v.date].push(v);
  });

  const monthLabel = displayMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <button onClick={() => setMonthOffset((o) => o - 1)}
          className="w-9 h-9 rounded-full border border-[var(--border-med)] bg-[var(--surface)] flex items-center justify-center text-[var(--text-2)] hover:bg-[var(--bg)] text-lg font-bold active:opacity-70"
          aria-label="Previous month">‹</button>
        <span className="font-bold text-[var(--text-1)] text-base">{monthLabel}</span>
        <button onClick={() => setMonthOffset((o) => o + 1)}
          className="w-9 h-9 rounded-full border border-[var(--border-med)] bg-[var(--surface)] flex items-center justify-center text-[var(--text-2)] hover:bg-[var(--bg)] text-lg font-bold active:opacity-70"
          aria-label="Next month">›</button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wide py-1">{d}</div>
        ))}
      </div>

      {loadingMonth ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-3)] text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-7 border-t border-l border-[var(--border)]">
          {cells.map((dayNum, idx) => {
            if (!dayNum) return (
              <div key={`empty-${idx}`} className="border-b border-r border-[var(--border)] bg-[var(--bg)] min-h-[72px] sm:min-h-[88px]" />
            );
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const dayAppts = apptsByDate[dateStr] || [];
            const dayVacs = vacsByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const isPast = dateStr < todayStr;
            const MAX_VISIBLE = 3;
            return (
              <div key={dateStr} onClick={() => onDayClick(dateStr)}
                className={`border-b border-r border-[var(--border)] min-h-[72px] sm:min-h-[88px] p-1 cursor-pointer transition-colors select-none
                  ${isToday ? "bg-emerald-50" : isPast ? "bg-[var(--bg)]" : "bg-[var(--surface)]"}
                  hover:bg-emerald-50/60 active:bg-emerald-100/60`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full leading-none
                    ${isToday ? "bg-emerald-500 text-white" : isSelected ? "bg-[var(--brand,#059669)] text-white" : "text-[var(--text-2)]"}`}>
                    {dayNum}
                  </span>
                  {dayAppts.length > 0 && <span className="text-[9px] font-bold text-[var(--text-3)]">{dayAppts.length}</span>}
                </div>
                {dayVacs.length > 0 && (
                  <div className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 mb-0.5 truncate leading-tight">
                    🚫 Blocked
                  </div>
                )}
                {dayAppts.slice(0, MAX_VISIBLE).map((a) => (
                  <div key={a.id} className={`text-[9px] font-medium rounded px-1 py-0.5 mb-0.5 truncate leading-tight
                    ${a.no_show ? "bg-gray-100 text-gray-500" : a.confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {fmt12Hour(a.time)} {a.pets?.name || "—"}
                  </div>
                ))}
                {dayAppts.length > MAX_VISIBLE && (
                  <div className="text-[9px] text-[var(--text-3)] font-semibold px-1">+{dayAppts.length - MAX_VISIBLE} more</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-3)] px-1 pt-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 inline-block" /> Confirmed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 inline-block" /> Unconfirmed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200 inline-block" /> Blocked</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Today</span>
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
  const [dayBreaks, setDayBreaks] = useState([]);
  const [capacity, setCapacity] = useState(1);
  const [editingBlock, setEditingBlock] = useState(null);
  const [monthRefreshKey, setMonthRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "grid"
  );
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayActionDate, setDayActionDate] = useState(null);

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
  const [planTier, setPlanTier] = useState("free"); // defaults to most restricted until loaded
  const FREE_LIMIT = 50;
  const [monthlyCount, setMonthlyCount] = useState(null);
  const [allPendingRequests, setAllPendingRequests] = useState([]);

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
    payment_method: "",
    tip: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [rebookModalOpen, setRebookModalOpen] = useState(false);
  const [rebookAppt, setRebookAppt] = useState(null);

  // ConfirmModal state (replaces window.confirm)
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Service pricing loaded from groomers.service_pricing
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [serviceOptions, setServiceOptions] = useState(SERVICE_OPTIONS);
  const [addonOptions, setAddonOptions] = useState([]);
  const [feeOptions, setFeeOptions] = useState([]);
  const [groomer, setGroomer] = useState(null);

  // Load ALL pending booking requests across all future dates
  useEffect(() => {
    if (!user) return;
    supabase
      .from("appointments")
      .select("id, date, time, waitlist, pets(name, clients(full_name))")
      .eq("groomer_id", user.id)
      .eq("source", "booking_page")
      .eq("confirmed", false)
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date", { ascending: true })
      .then(({ data }) => setAllPendingRequests(data || []));
  }, [user, appointments]);

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

  /* Refetch appointments when tab regains focus — picks up bookings made in other tabs */
  useEffect(() => {
    if (!user || !selectedDate) return;

    const handleVisible = async () => {
      if (document.visibilityState !== "visible") return;

      const { data: appts } = await supabase
        .from("appointments")
        .select(`
          id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category,
          services, notes, confirmed, no_show, paid, amount, tip, reminder_enabled, source, appointment_group_id,
          checked_in_at, checked_out_at, payment_method,
          pets (
            id, name, tags, client_id, photo_url, size_category,
            clients ( id, full_name, phone, email, sms_opt_in, street, city, state, zip )
          )
        `)
        .eq("groomer_id", user.id)
        .eq("date", selectedDate)
        .order("time", { ascending: true });

      if (appts) {
        const withShots = await attachShotRecords(appts);
        setAppointments(withShots);
      }
    };

    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [user, selectedDate]);

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
        { data: vacDays },
      ] = await Promise.all([
        supabase
          .from("groomers")
          .select("max_parallel, service_pricing, plan_tier, booking_requires_approval, custom_services, subscription_status")
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
            id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category,
            services, notes, confirmed, no_show, paid, amount, tip, reminder_enabled, source, appointment_group_id,
            checked_in_at, checked_out_at, payment_method,
            pets (
              id, name, tags, notes, client_id, photo_url, size_category,
              clients (
                id,
                full_name,
                phone,
                email,
                sms_opt_in,
                notes,
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
        supabase
          .from("vacation_days")
          .select("id, date, start_time, end_time, reason")
          .eq("groomer_id", user.id)
          .eq("date", selectedDate),
      ]);

      setCapacity(groomer?.max_parallel || 1);
      if (groomer?.custom_services && groomer.custom_services.length > 0) {
        // Keep full service objects so duration_min is available for auto-calc
        setServiceOptions(groomer.custom_services);
        const pricingObj = Object.fromEntries(
          groomer.custom_services.map(s => [s.name, s.pricing])
        );
        setPricing({ ...DEFAULT_PRICING, ...pricingObj });
      } else if (groomer?.service_pricing) {
        setPricing({ ...DEFAULT_PRICING, ...groomer.service_pricing });
      }
      setAddonOptions([]);
      setFeeOptions([]);
      setGroomer(groomer);

      // Fetch add-ons and fees separately — columns may not exist yet in older DBs
      try {
        const { data: extras } = await supabase
          .from("groomers")
          .select("custom_addons, custom_fees")
          .eq("id", user.id)
          .maybeSingle();
        if (extras) {
          setAddonOptions(extras.custom_addons || []);
          setFeeOptions(extras.custom_fees || []);
        }
      } catch (_) {}
      if (groomer?.plan_tier) {
        setPlanTier(groomer.plan_tier);
      }

      if (!hours) {
        const apptsWithShots = await attachShotRecords(appts || []);
        setWorkingRange([]);
        setBreakSlots([]);
        const vacationBreaks = (vacDays || []).map(v => ({
          ...v,
          break_start: v.start_time,
          break_end: v.end_time,
          label: v.reason,
          fullDay: !v.start_time || !v.end_time,
          _source: "vacation_days",
        }));
        setDayBreaks(vacationBreaks);
        setAppointments(apptsWithShots);
        setLoading(false);
        return;
      }

      let startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
      let endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
      // Clamp to valid range if start/end fall outside TIME_SLOTS
      if (startIdx === -1) startIdx = 0;
      if (endIdx === -1) endIdx = TIME_SLOTS.length - 1;
      const range = TIME_SLOTS.slice(startIdx, endIdx + 1);
      setWorkingRange(range);

      const breakSet = new Set();
      (breaks || []).forEach((b) => {
        const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
        const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
        if (bi === -1 || ei === -1) return;
        TIME_SLOTS.slice(bi, ei + 1).forEach((s) => breakSet.add(s));
      });

      // Block slots for date-specific vacation_days entries
      (vacDays || []).forEach(v => {
        if (!v.start_time || !v.end_time) {
          range.forEach(s => breakSet.add(s));
          return;
        }
        const bi = TIME_SLOTS.indexOf(v.start_time.slice(0, 5));
        const ei = TIME_SLOTS.indexOf(v.end_time.slice(0, 5));
        if (bi !== -1 && ei !== -1) TIME_SLOTS.slice(bi, ei + 1).forEach(s => breakSet.add(s));
      });

      setBreakSlots([...breakSet]);

      const workingBreaks = (breaks || []).map(b => ({ ...b, _source: "working_breaks" }));
      const vacationBreaks = (vacDays || []).map(v => ({
        ...v,
        break_start: v.start_time,
        break_end: v.end_time,
        label: v.reason,
        fullDay: !v.start_time || !v.end_time,
        _source: "vacation_days",
      }));
      setDayBreaks([...workingBreaks, ...vacationBreaks]);

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

  // Monthly appointment count for free tier banner — excludes sample appointments
  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("groomer_id", user.id)
      .gte("date", monthStart)
      .neq("source", "sample")
      .then(({ count }) => {
        if (count !== null) setMonthlyCount(count);
      });
  }, [user, appointments]);

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
          id, name, tags, notes, client_id, slot_weight, size_category,
          default_services, default_duration_min,
          clients ( id, full_name, notes )
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
              ? calcAmount(pet.default_services, pet.size_category || 1, pricing, addonOptions)
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

  /* Generate and save a recurring appointment series */
  const handleSaveRecurring = async () => {
    if (!user || !newPets.length) return;
    const { pet, form } = newPets[0];
    if (!newForm.date || !newForm.time || !newForm.recurringEnd) return;
    setSavingNew(true);
    if (planTier === "free") {
      setSavingNew(false);
      setConfirmConfig({ title: "Recurring appointments require Basic or higher", message: "Upgrade to Basic or higher to set up recurring appointments.", confirmLabel: "Upgrade", cancelLabel: "Not now", onConfirm: () => { window.location.href = "/upgrade"; } });
      return;
    }
    const freq = newForm.recurringFreq || "weekly";
    const [sy, sm, sd] = newForm.date.split("-").map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const [ey, em, ed] = newForm.recurringEnd.split("-").map(Number);
    const endDate = new Date(ey, em - 1, ed);
    const maxDate = new Date(startDate);
    maxDate.setMonth(maxDate.getMonth() + 6);
    const effectiveEnd = endDate > maxDate ? maxDate : endDate;
    const dates = [];
    let cursor = new Date(startDate);
    let safety = 0;
    while (cursor <= effectiveEnd && safety < 200) {
      dates.push(toYMD(cursor));
      if (freq === "weekly") cursor.setDate(cursor.getDate() + 7);
      else if (freq === "biweekly") cursor.setDate(cursor.getDate() + 14);
      else cursor.setMonth(cursor.getMonth() + 1);
      safety++;
    }
    if (!dates.length) { setSavingNew(false); return; }
    const groupId = crypto.randomUUID();
    const slotWeight = pet.slot_weight || 1;
    const sizeCategory = pet.size_category || 1;
    const [th, tm] = newForm.time.split(":").map(Number);
    const startMin = th * 60 + tm;
    const durMin = form.duration_min || 30;
    const endMin = startMin + durMin;
    const { data: existingAppts } = await supabase
      .from("appointments").select("date, time, duration_min, slot_weight")
      .eq("groomer_id", user.id).in("date", dates).or("no_show.is.null,no_show.eq.false");
    const created = [];
    const skipped = [];
    for (const date of dates) {
      const sameDay = (existingAppts || []).filter(a => a.date === date);
      let overlapWeight = 0;
      for (const a of sameDay) {
        const [ah, am] = (a.time || "00:00").slice(0, 5).split(":").map(Number);
        const aStart = ah * 60 + am;
        const aEnd = aStart + (a.duration_min || 30);
        if (aStart < endMin && aEnd > startMin) overlapWeight += (a.slot_weight || 1);
      }
      if (overlapWeight + slotWeight > capacity) { skipped.push(date); continue; }
      created.push({ groomer_id: user.id, pet_id: pet.id, date, time: newForm.time, duration_min: durMin, services: form.services, notes: newForm.notes, slot_weight: slotWeight, size_category: sizeCategory, reminder_enabled: planTier !== "free" && newForm.reminder_enabled, reminder_sent: false, amount: form.amount ?? null, recurring_group_id: groupId });
    }
    if (!created.length) {
      setSavingNew(false);
      setConfirmConfig({ title: "No appointments created", message: "Every date in this series already has a full slot at that time.", confirmLabel: "OK", onConfirm: () => {} });
      return;
    }
    const { data: savedAppts, error } = await supabase.from("appointments").insert(created)
      .select(`id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category, services, notes, confirmed, no_show, paid, amount, reminder_enabled, recurring_group_id, pets ( id, name, tags, client_id, photo_url, size_category, clients ( id, full_name, phone, email ) )`);
    setSavingNew(false);
    if (error) { setConfirmConfig({ title: "Could not save", message: error.message, confirmLabel: "OK", onConfirm: () => {} }); return; }
    const todaysAppt = (savedAppts || []).find(a => a.date === selectedDate);
    if (todaysAppt) {
      const withShots = await attachShotRecords([todaysAppt]);
      setAppointments(prev => [...prev, ...withShots].sort((a, b) => (a.time || "").localeCompare(b.time || "")));
    }
    setNewModalOpen(false); setNewPets([]); setModalSlot(null);
    setMonthRefreshKey(k => k + 1);
    const fmt = d => { const [y,m,dd] = d.split("-").map(Number); return new Date(y,m-1,dd).toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
    const msg = `Created ${created.length} appointment${created.length===1?"":"s"}.${skipped.length>0?` Skipped ${skipped.length} (slot full): ${skipped.map(fmt).join(", ")}.`:""}`;
    setConfirmConfig({ title: "Recurring appointments created", message: msg, confirmLabel: "OK", onConfirm: () => {} });
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

    // ── Multi-pet plan check ────────────────────────────────
    if (newPets.length > 1 && (planTier === "free" || planTier === "basic")) {
      setSavingNew(false);
      setConfirmConfig({
        title: "Multi-pet bookings require Growth",
        message: "Upgrade to Growth or Pro to book multiple dogs in one appointment.",
        confirmLabel: "Upgrade",
        cancelLabel: "Not now",
        onConfirm: () => { window.location.href = "/upgrade"; },
      });
      return;
    }

    // ── Free tier appointment limit check ──────────────────
    if (planTier === "free") {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("groomer_id", user.id)
        .gte("date", monthStart)
        .neq("source", "sample");

      if ((count ?? 0) >= FREE_LIMIT) {
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
    // Route to recurring handler if checkbox is checked
    if (newForm.recurring && newForm.recurringEnd && newPets.length === 1) {
      await handleSaveRecurring();
      return;
    }

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
      size_category:        pet.size_category || 1,
      reminder_enabled:     planTier !== "free" && newForm.reminder_enabled,
      reminder_sent:        false,
      amount:               form.amount ?? null,
      appointment_group_id: groupId,
    }));

    const { data: savedAppts, error } = await supabase
      .from("appointments")
      .insert(insertRows)
      .select(`
        id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled,
        appointment_group_id,
        pets (
          id, name, tags, client_id, photo_url, size_category,
          clients ( id, full_name, phone, email )
        )
      `);

    if (error) {
      setSavingNew(false);
      setConfirmConfig({
        title: "Could not save",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      return;
    }

    // Fire confirmation email for first pet if reminder enabled
    if (planTier !== "free" && newForm.reminder_enabled && savedAppts?.[0]) {
      sendConfirmationEmail({ appointment: savedAppts[0], groomerId: user.id });
    }

    // Attach shot records to each saved appointment
    const withShots = await attachShotRecords(savedAppts || []);

    setAppointments((prev) =>
      [...prev, ...withShots].sort((a, b) =>
        (a.time || "").localeCompare(b.time || "")
      )
    );

    setSavingNew(false);
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
      payment_method: appt.payment_method || "",
      tip: appt.tip != null ? String(appt.tip) : "",
      paid: appt.paid ?? false,
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
        payment_method: editForm.payment_method || null,
        tip: editForm.tip ? parseFloat(editForm.tip) || null : null,
        paid: editForm.paid ?? false,
        reminder_sent: false,
        slot_weight: editAppt.slot_weight || 1,
        size_category: editAppt.size_category || editAppt.pets?.size_category || 1,
      })
      .eq("id", editAppt.id)
      .eq("groomer_id", user.id)
      .select(`
        id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled, appointment_group_id,
        payment_method, checked_in_at, checked_out_at, source,
        pets ( id, name, tags, client_id, photo_url, size_category, clients ( id, full_name, phone, email ) )
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
    if (planTier !== "free" && editForm.reminder_enabled) {
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

      {/* Past due warning */}
      {planTier !== "free" && groomer?.subscription_status === "past_due" && (
        <div className="bg-red-100 text-red-700 p-3 rounded-md font-semibold mb-2">
          ⚠️ Your payment failed —{" "}
          <Link to="/upgrade" className="underline font-bold">update your billing info</Link>{" "}
          to keep your account active.
        </div>
      )}

      {/* Free tier appointment counter — single source of truth */}
      {planTier === "free" && monthlyCount !== null && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-3 text-sm gap-2
          ${monthlyCount >= 50
            ? "bg-red-50 border border-red-200 text-red-800"
            : monthlyCount >= 40
            ? "bg-amber-50 border border-amber-200 text-amber-800"
            : "bg-blue-50 border border-blue-200 text-blue-800"
          }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="font-semibold whitespace-nowrap">
                {monthlyCount >= 50
                  ? "⛔ Monthly limit reached"
                  : `📅 ${50 - monthlyCount} appointments left this month`}
              </span>
              {/* Progress bar */}
              <div className="flex-1 h-2 rounded-full bg-current opacity-20 overflow-hidden min-w-0">
                <div
                  className="h-full rounded-full bg-current opacity-100"
                  style={{width: `${Math.min((monthlyCount / 50) * 100, 100)}%`}}
                />
              </div>
              <span className="text-xs opacity-70 whitespace-nowrap">{monthlyCount}/50</span>
            </div>
            <a href="/upgrade"
              className="ml-1 text-xs font-bold px-3 py-1.5 rounded-full bg-white border border-current hover:opacity-80 transition whitespace-nowrap flex-shrink-0">
              Upgrade →
            </a>
          </div>
          <p className="text-xs opacity-70 mt-1.5">
            {monthlyCount >= 50
              ? "You've used all 50 free appointments for this month. Resets on the 1st. Upgrade to Basic for unlimited appointments."
              : "Free plan includes 50 appointments per month. Resets on the 1st of each month. Upgrade to Basic for unlimited."}
          </p>
        </div>
      )}

      {/* Pending booking requests banner — shows ALL pending across all dates */}
      {groomer?.booking_requires_approval && allPendingRequests.length > 0 && (() => {
        const pending    = allPendingRequests.filter(r => !r.waitlist);
        const waitlisted = allPendingRequests.filter(r => r.waitlist);
        return (
          <div className="mx-4 mt-3 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                📋 {pending.length > 0 && `${pending.length} request${pending.length !== 1 ? "s" : ""} need${pending.length === 1 ? "s" : ""} approval`}
                {pending.length > 0 && waitlisted.length > 0 && " · "}
                {waitlisted.length > 0 && `${waitlisted.length} on waitlist`}
              </span>
            </div>
            <div className="space-y-1">
              {allPendingRequests.map(req => {
                const [y, m, d] = req.date.split("-").map(Number);
                const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div key={req.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${req.waitlist ? "bg-blue-50 border border-blue-200" : "bg-amber-100"}`}>
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      {req.waitlist && <span className="text-blue-600">⏸</span>}
                      {req.pets?.name} ({req.pets?.clients?.full_name}) — {dateStr} at {fmt12Hour(req.time)}
                      {req.waitlist && <span className="text-blue-600 font-semibold">· Waitlist</span>}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedDate(req.date);
                        setTimeout(() => {
                          const el = document.getElementById(`appt-${req.id}`);
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 300);
                      }}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg text-white transition ml-2 whitespace-nowrap ${req.waitlist ? "bg-blue-500 hover:bg-blue-600" : "bg-amber-500 hover:bg-amber-600"}`}
                    >
                      Review →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
          <div className="flex items-center gap-2 w-full" data-tour="tour-schedule-date">
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

          {/* View toggle — List / Grid / Month */}
          <div className="flex items-center gap-1" data-tour="tour-view-toggle">
            <button
              onClick={() => setViewMode("list")}
              style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 700,
                borderRadius: "999px 0 0 999px", border: "1px solid",
                borderColor: viewMode === "list" ? "#059669" : "#d1d5db",
                backgroundColor: viewMode === "list" ? "#059669" : "#ffffff",
                color: viewMode === "list" ? "#ffffff" : "#6b7280", cursor: "pointer",
              }}
            >☰ List</button>
            <button
              onClick={() => setViewMode("grid")}
              style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 700,
                borderRadius: "0", border: "1px solid", borderLeft: "none",
                borderColor: viewMode === "grid" ? "#059669" : "#d1d5db",
                backgroundColor: viewMode === "grid" ? "#059669" : "#ffffff",
                color: viewMode === "grid" ? "#ffffff" : "#6b7280", cursor: "pointer",
              }}
            >⊞ Grid</button>
            <button
              onClick={() => { setViewMode("month"); setMonthOffset(0); }}
              style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 700,
                borderRadius: "0 999px 999px 0", border: "1px solid", borderLeft: "none",
                borderColor: viewMode === "month" ? "#059669" : "#d1d5db",
                backgroundColor: viewMode === "month" ? "#059669" : "#ffffff",
                color: viewMode === "month" ? "#ffffff" : "#6b7280", cursor: "pointer",
              }}
            >📅 Month</button>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Search pet, client, tag, or service"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              data-tour="tour-add-appointment"
            />

            <div className="text-sm text-gray-600">
              {workingRange.length ? (
                <>
                  Working hours:{" "}
                  <strong>
                    {fmt12Hour(workingRange[0])} – {fmt12Hour(workingRange[workingRange.length - 1])}
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
                      <div className="border-t px-1 py-1 text-gray-700 font-medium text-[10px] leading-tight whitespace-nowrap">
                        {fmt12Hour(slot)}
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
                                {/* Pet photo — only in the first slot of this appointment */}
                                {appt.pets?.photo_url && slot === (appt.time || "").slice(0, 5) && (
                                  <img
                                    src={appt.pets.photo_url}
                                    alt={appt.pets.name}
                                    loading="lazy"
                                    className="w-8 h-8 rounded-full object-cover border border-gray-200 mb-1"
                                  />
                                )}

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
                                      .select(`id, pet_id, groomer_id, date, time, duration_min, slot_weight, size_category,
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

      {/* MONTH VIEW */}
      {viewMode === "month" && user && (
        <div className="card mb-6" style={{ position: "relative", zIndex: 1 }}>
          <div className="card-body">
            <MonthView
              userId={user.id}
              selectedDate={selectedDate}
              monthOffset={monthOffset}
              setMonthOffset={setMonthOffset}
              onDayClick={(dateStr) => setDayActionDate(dateStr)}
              refreshKey={monthRefreshKey}
            />
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div className="grid gap-4">
          {/* Time block cards */}
          {dayBreaks.map((b) => {
            const fmt = (t) => {
              if (!t) return "";
              const [h, m] = t.slice(0, 5).split(":").map(Number);
              const ampm = h >= 12 ? "PM" : "AM";
              return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
            };
            return (
              <div key={b.id} className="card border-l-4 border-l-gray-400 bg-gray-50">
                <div className="card-body py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-600">
                      🚫 {b.label || b.reason || "Time Block"}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {b.fullDay ? "All Day" : (b.break_start ? `${fmt(b.break_start)} – ${fmt(b.break_end)}` : "All Day")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b._source === "vacation_days" ? (
                      <>
                        <button onClick={() => setEditingBlock(b)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition">
                          Edit
                        </button>
                        <button onClick={async () => {
                          if (!window.confirm("Delete this time block?")) return;
                          await supabase.from("vacation_days").delete().eq("id", b.id);
                          const remaining = dayBreaks.filter(x => x.id !== b.id);
                          setDayBreaks(remaining);
                          const bs = new Set();
                          remaining.forEach(br => {
                            if (br._source === "working_breaks") {
                              const bi = TIME_SLOTS.indexOf((br.break_start||"").slice(0,5));
                              const ei = TIME_SLOTS.indexOf((br.break_end||"").slice(0,5));
                              if (bi!==-1&&ei!==-1) TIME_SLOTS.slice(bi,ei+1).forEach(s=>bs.add(s));
                            } else if (!br.fullDay && br.break_start) {
                              const bi = TIME_SLOTS.indexOf((br.break_start||"").slice(0,5));
                              const ei = TIME_SLOTS.indexOf((br.break_end||"").slice(0,5));
                              if (bi!==-1&&ei!==-1) TIME_SLOTS.slice(bi,ei+1).forEach(s=>bs.add(s));
                            }
                          });
                          setBreakSlots([...bs]);
                          setMonthRefreshKey(k => k + 1);
                        }}
                          className="text-xs px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition">
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 text-gray-500 font-medium">Recurring</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredAppointments.length === 0 && dayBreaks.length === 0 && (
            <p className="text-gray-600 italic">No appointments for this day (or search filter).</p>
          )}
          {filteredAppointments.length === 0 && dayBreaks.length > 0 && (
            <p className="text-gray-600 italic">No appointments — only time blocks.</p>
          )}

          {groupedAppointments.map((group) => {
            const appt = group[0]; // primary appointment for shared fields
            const isMulti = group.length > 1;
            const start = (appt.time || "00:00").slice(0, 5);
            const end = getEndTime(start, Math.max(...group.map(a => a.duration_min || 15)));
            const size = sizeBadge(appt.size_category || appt.pets?.size_category || 1);
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
                  {/* Pending approval banner */}
                  {!appt.confirmed && appt.source === "booking_page" && groomer?.booking_requires_approval && (
                    <div className={`border rounded-xl px-3 py-2.5 mb-1 space-y-2 ${appt.waitlist ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
                      <div>
                        <span className={`text-xs font-bold ${appt.waitlist ? "text-blue-800" : "text-amber-800"}`}>
                          {appt.waitlist ? "⏸ On Waitlist" : "⏳ Booking Request"}
                        </span>
                        <p className={`text-xs mt-0.5 ${appt.waitlist ? "text-blue-700" : "text-amber-700"}`}>
                          {appt.waitlist
                            ? "Client has been notified they're on the waitlist. Approve when a slot opens."
                            : "Client requested this appointment — approve, waitlist, or decline below"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {/* Approve */}
                        <button
                          onClick={async () => {
                            await supabase.from("appointments").update({ confirmed: true, waitlist: false }).eq("id", appt.id);
                            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, confirmed: true, waitlist: false } : a));
                            const clientEmail = appt.pets?.clients?.email;
                            if (clientEmail) {
                              fetch("/.netlify/functions/sendEmail", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  to: clientEmail,
                                  subject: `Your appointment is confirmed — ${appt.pets?.name}`,
                                  template: "booking_approved",
                                  data: {
                                    groomer_id: appt.groomer_id,
                                    client_name: appt.pets?.clients?.full_name || "there",
                                    pet_name: appt.pets?.name || "your pet",
                                    date: fmtEmailDate(appt.date),
                                    time: appt.time?.slice(0,5),
                                    services: (appt.services || []).join(", "),
                                    groomer_phone: "",
                                  }
                                })
                              }).catch(() => {});
                            }
                          }}
                          className="flex-1 text-sm py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition text-center"
                        >
                          ✓ {appt.waitlist ? "Approve" : "Approve"}
                        </button>

                        {/* Waitlist — only show if not already waitlisted */}
                        {!appt.waitlist && (
                          <button
                            onClick={async () => {
                              await supabase.from("appointments").update({ waitlist: true }).eq("id", appt.id);
                              setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, waitlist: true } : a));
                              const clientEmail = appt.pets?.clients?.email;
                              if (clientEmail) {
                                fetch("/.netlify/functions/sendEmail", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    to: clientEmail,
                                    subject: `You're on the waitlist — ${appt.pets?.name}`,
                                    template: "booking_waitlisted",
                                    data: {
                                      groomer_id: appt.groomer_id,
                                      client_name: appt.pets?.clients?.full_name || "there",
                                      pet_name: appt.pets?.name || "your pet",
                                      date: fmtEmailDate(appt.date),
                                      time: appt.time?.slice(0,5),
                                      groomer_phone: "",
                                    }
                                  })
                                }).catch(() => {});
                              }
                            }}
                            className="flex-1 text-sm py-2 rounded-lg bg-blue-100 text-blue-700 font-bold hover:bg-blue-200 transition text-center"
                          >
                            ⏸ Waitlist
                          </button>
                        )}

                        {/* Decline */}
                        <button
                          onClick={async () => {
                            if (window.confirm("Decline this booking request? The appointment will be deleted and the client notified.")) {
                              const clientEmail = appt.pets?.clients?.email;
                              if (clientEmail) {
                                await fetch("/.netlify/functions/sendEmail", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    to: clientEmail,
                                    subject: `Booking request update — ${appt.pets?.name}`,
                                    template: "booking_declined",
                                    data: {
                                      groomer_id: appt.groomer_id,
                                      client_name: appt.pets?.clients?.full_name || "there",
                                      pet_name: appt.pets?.name || "your pet",
                                      date: fmtEmailDate(appt.date),
                                      time: appt.time?.slice(0,5),
                                      groomer_phone: "",
                                    }
                                  })
                                }).catch(() => {});
                              }
                              await supabase.from("appointments").delete().eq("id", appt.id);
                              setAppointments(prev => prev.filter(a => a.id !== appt.id));
                            }
                          }}
                          className="flex-1 text-sm py-2 rounded-lg bg-red-100 text-red-700 font-bold hover:bg-red-200 transition text-center"
                        >
                          ✕ Decline
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Top row: time + size + vaccine */}
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <div className="text-sm text-gray-500">
                        {(() => {
                          const [y, mo, d] = appt.date.split("-").map(Number);
                          return new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                        })()}
                      </div>
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
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Pet photo — lazy, only single-pet appointments */}
                      {!isMulti && appt.pets?.photo_url && (
                        <img
                          src={appt.pets.photo_url}
                          alt={appt.pets.name}
                          loading="lazy"
                          className="w-12 h-12 rounded-full object-cover border border-gray-200 flex-shrink-0 mt-0.5"
                        />
                      )}
                      <div className="min-w-0">
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
                    </div>

                    {/* Contact buttons */}
                    <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                      {appt.pets?.clients?.phone ? (
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

                          {/* Inbox button — Growth+ only, navigates to inbox with client pre-selected */}
                          {(planTier === "growth" || planTier === "pro") && (
                            <a
                              href={`/inbox?phone=${encodeURIComponent(appt.pets.clients.phone)}&name=${encodeURIComponent(appt.pets.clients.full_name || "")}`}
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-1 border border-emerald-300 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center gap-1 font-semibold transition"
                            >
                              📥 Inbox
                            </a>
                          )}
                        </>
                      ) : (
                        /* No phone saved */
                        <span className="px-2 py-1 text-xs text-[var(--text-3)] border border-dashed border-gray-200 rounded">
                          No phone on file
                        </span>
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
                  {appt.payment_method && appt.paid && (
                    <div className="text-xs text-emerald-700 font-medium">
                      💰 Paid via {appt.payment_method === "cashapp" ? "Cash App" : appt.payment_method.charAt(0).toUpperCase() + appt.payment_method.slice(1)}
                      {appt.tip > 0 && ` · $${parseFloat(appt.tip).toFixed(2)} tip`}
                    </div>
                  )}
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

                  {/* ── Actions ── */}
                  <div className="pt-2 border-t border-gray-100 space-y-2">

                    {/* Row 1: Edit + Rebook + Delete */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleOpenEditModal(appt)}
                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold transition"
                      >
                        <span className="text-base">✏️</span>
                        Edit
                      </button>

                      <button
                        onClick={() => openRebookModal(appt)}
                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition"
                      >
                        <span className="text-base">🔁</span>
                        Rebook
                      </button>

                      <button
                        onClick={() => handleDelete(appt.id)}
                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition"
                      >
                        <span className="text-base">🗑</span>
                        Delete
                      </button>
                    </div>

                    {/* Row 2: Remind */}
                    {planTier !== "free" && (
                      <div>
                        {appt.pets?.clients?.phone ? (
                          <button
                            onClick={() => handleSendReminder(appt)}
                            disabled={sendingReminder === appt.id}
                            className={`w-full flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-xs font-semibold transition disabled:opacity-50
                              ${appt.pets.clients.sms_opt_in
                                ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                                : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                              }`}
                            title={appt.pets.clients.sms_opt_in ? "Send SMS reminder" : "Client not opted in to SMS"}
                          >
                            <span className="text-base">💬</span>
                            {sendingReminder === appt.id ? "Sending…" : "Remind"}
                          </button>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-gray-100 text-gray-300 text-xs">
                            <span className="text-base">💬</span>
                            No phone
                          </div>
                        )}
                      </div>
                    )}

                    {/* Row 3: Status toggles */}
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

                    {/* Row 4: Check in / Check out */}
                    <div className="flex gap-2 items-center pt-1">
                      {/* Check In */}
                      <button
                        onClick={async () => {
                          const value = appt.checked_in_at ? null : new Date().toISOString();
                          await supabase.from("appointments").update({ checked_in_at: value }).eq("id", appt.id);
                          setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, checked_in_at: value } : a));
                        }}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition
                          ${appt.checked_in_at
                            ? "bg-blue-50 border-blue-300 text-blue-700"
                            : "bg-[var(--surface)] border-[var(--border-med)] text-[var(--text-2)] hover:border-blue-300 hover:text-blue-600"
                          }`}
                      >
                        {appt.checked_in_at
                          ? `✓ In ${fmtCheckinTime(appt.checked_in_at)}`
                          : "Check In"}
                      </button>
                      {appt.checked_in_at && (
                        <input
                          type="time"
                          defaultValue={(() => {
                            const d = new Date(appt.checked_in_at);
                            return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                          })()}
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            const [h, m] = e.target.value.split(":").map(Number);
                            const base = new Date(appt.checked_in_at);
                            base.setHours(h, m, 0, 0);
                            await supabase.from("appointments").update({ checked_in_at: base.toISOString() }).eq("id", appt.id);
                            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, checked_in_at: base.toISOString() } : a));
                          }}
                          className="border rounded-lg px-1 py-1 text-xs w-20 text-center"
                          title="Edit check-in time"
                        />
                      )}

                      {/* Check Out — only show after check in */}
                      {appt.checked_in_at && (
                        <button
                          onClick={async () => {
                            const value = appt.checked_out_at ? null : new Date().toISOString();
                            await supabase.from("appointments").update({ checked_out_at: value }).eq("id", appt.id);
                            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, checked_out_at: value } : a));
                          }}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition
                            ${appt.checked_out_at
                              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                              : "bg-[var(--surface)] border-[var(--border-med)] text-[var(--text-2)] hover:border-emerald-300 hover:text-emerald-600"
                            }`}
                        >
                          {appt.checked_out_at
                            ? `✓ Out ${fmtCheckinTime(appt.checked_out_at)}`
                            : "Check Out"}
                        </button>
                      )}
                      {appt.checked_out_at && (
                        <input
                          type="time"
                          defaultValue={(() => {
                            const d = new Date(appt.checked_out_at);
                            return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                          })()}
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            const [h, m] = e.target.value.split(":").map(Number);
                            const base = new Date(appt.checked_out_at);
                            base.setHours(h, m, 0, 0);
                            await supabase.from("appointments").update({ checked_out_at: base.toISOString() }).eq("id", appt.id);
                            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, checked_out_at: base.toISOString() } : a));
                          }}
                          className="border rounded-lg px-1 py-1 text-xs w-20 text-center"
                          title="Edit check-out time"
                        />
                      )}

                      {/* Elapsed time */}
                      {appt.checked_in_at && appt.checked_out_at && (
                        <span className="text-xs text-[var(--text-3)] flex-shrink-0">
                          {elapsedTime(appt.checked_in_at, appt.checked_out_at)}
                        </span>
                      )}
                    </div>

                    {/* Quick payment row — shows after checkout if not yet paid */}
                    {appt.checked_out_at && !appt.paid && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {["cash", "card", "venmo", "cashapp", "zelle", "check"].map(method => (
                          <button
                            key={method}
                            onClick={async () => {
                              await supabase.from("appointments").update({
                                paid: true,
                                payment_method: method,
                              }).eq("id", appt.id);
                              setAppointments(prev => prev.map(a =>
                                a.id === appt.id ? { ...a, paid: true, payment_method: method } : a
                              ));
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--border-med)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition capitalize"
                          >
                            💵 {method === "cashapp" ? "Cash App" : method.charAt(0).toUpperCase() + method.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                    {appt.checked_out_at && appt.paid && (
                      <div className="mt-2 text-xs text-emerald-700 font-semibold">
                        ✅ Paid{appt.payment_method ? ` via ${appt.payment_method === "cashapp" ? "Cash App" : appt.payment_method.charAt(0).toUpperCase() + appt.payment_method.slice(1)}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Month view — Day Action Modal */}
      {dayActionDate && (
        <DayActionModal
          date={dayActionDate}
          onClose={() => setDayActionDate(null)}
          onGoToDay={() => {
            setSelectedDate(dayActionDate);
            setViewMode("list");
            setDayActionDate(null);
          }}
          onAddBooking={() => {
            setSelectedDate(dayActionDate);
            setViewMode("list");
            setDayActionDate(null);
            setTimeout(() => openSlot("09:00"), 300);
          }}
          onAddTimeBlock={async (date, start, end, note, setSaving) => {
            if (!user) return;
            setSaving(true);
            const { error } = await supabase.from("vacation_days").insert([{
              groomer_id: user.id,
              date,
              start_time: start || null,
              end_time: end || null,
            }]);
            setSaving(false);
            if (error) {
              alert("Could not save time block: " + error.message);
            } else {
              setDayActionDate(null);
            }
          }}
        />
      )}

      {/* Edit Time Block Modal */}
      {editingBlock && (
        <EditTimeBlockModal
          block={editingBlock}
          onClose={() => setEditingBlock(null)}
          onSave={async (id, start, end, note) => {
            const { error } = await supabase.from("vacation_days")
              .update({ start_time: start, end_time: end, reason: note || null })
              .eq("id", id);
            if (error) { alert("Could not update time block: " + error.message); return; }
            const fullDay = !start || !end;
            const updated = dayBreaks.map(b => b.id === id
              ? { ...b, start_time: start, end_time: end, break_start: start, break_end: end, reason: note, label: note, fullDay }
              : b);
            setDayBreaks(updated);
            const bs = new Set();
            updated.forEach(br => {
              if (br._source === "working_breaks") {
                const bi = TIME_SLOTS.indexOf((br.break_start||"").slice(0,5));
                const ei = TIME_SLOTS.indexOf((br.break_end||"").slice(0,5));
                if (bi!==-1&&ei!==-1) TIME_SLOTS.slice(bi,ei+1).forEach(s=>bs.add(s));
              } else if (!br.fullDay && br.break_start) {
                const bi = TIME_SLOTS.indexOf((br.break_start||"").slice(0,5));
                const ei = TIME_SLOTS.indexOf((br.break_end||"").slice(0,5));
                if (bi!==-1&&ei!==-1) TIME_SLOTS.slice(bi,ei+1).forEach(s=>bs.add(s));
              }
            });
            setBreakSlots([...bs]);
            setEditingBlock(null);
            setMonthRefreshKey(k => k + 1);
          }}
        />
      )}

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
        onClose={() => { setNewModalOpen(false); setNewPets([]); setModalSlot(null); setSavingNew(false); }}
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
        serviceOptions={serviceOptions}
        addonOptions={addonOptions}
        feeOptions={feeOptions}
      />

      <AppointmentModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        isEdit={true}
        appt={editAppt}
        planTier={planTier}
        serviceOptions={serviceOptions}
        addonOptions={addonOptions}
        feeOptions={feeOptions}
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