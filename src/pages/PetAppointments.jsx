// src/pages/PetAppointments.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { Link, useParams, useNavigate } from "react-router-dom";
import Loader from "../components/Loader";
import ConfirmModal from "../components/ConfirmModal";
import { sendEmail } from "../utils/sendEmail";
import { SERVICE_OPTIONS, DEFAULT_PRICING, calcAmount } from "../utils/grooming";

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getEndTime(start, durationMin) {
  if (!start) return "—";
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + (durationMin || 15);
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  const ampm = eh >= 12 ? "PM" : "AM";
  return `${eh % 12 || 12}:${String(em).padStart(2, "0")} ${ampm}`;
}

/* =========================
   Working-hours helpers
   Uses Profile tables: working_hours (weekday, start_time, end_time)
========================= */
const toMinutes = (t) => {
  const [h, m] = String(t || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return h * 60 + m;
};

const fromMinutes = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/* Builds the same kind of time list the Schedule page uses: 15-minute
   slots inside the groomer's working hours for that date, skipping breaks
   and time blocks, and only offering start times where an appointment of
   this length still ends by closing time. Returns null if closed that day. */
async function loadTimeSlots({ groomerId, date, durationMin }) {
  if (!groomerId || !date) return null;
  const [y, m, d] = String(date).split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();

  const [{ data: hours }, { data: breaks }, { data: blocks }] = await Promise.all([
    supabase.from("working_hours").select("start_time, end_time")
      .eq("groomer_id", groomerId).eq("weekday", weekday).maybeSingle(),
    supabase.from("working_breaks").select("break_start, break_end")
      .eq("groomer_id", groomerId).eq("weekday", weekday),
    supabase.from("vacation_days").select("start_time, end_time")
      .eq("groomer_id", groomerId).eq("date", date),
  ]);

  if (!hours) return null;
  if ((blocks || []).some((b) => !b.start_time || !b.end_time)) return null; // full day off

  const blocked = [
    ...(breaks || []).map((b) => [toMinutes(b.break_start), toMinutes(b.break_end)]),
    ...(blocks || []).map((b) => [toMinutes(b.start_time), toMinutes(b.end_time)]),
  ];

  const open = toMinutes(hours.start_time);
  const close = toMinutes(hours.end_time);
  const len = durationMin || 60;
  const slots = [];
  for (let t = open; t + len <= close; t += 15) {
    const overlaps = blocked.some(([bs, be]) => t < be && t + len > bs);
    if (!overlaps) slots.push(fromMinutes(t));
  }
  return slots;
}

const FREE_MONTHLY_LIMIT = 50; // keep in sync with FREE_LIMIT in Schedule.jsx

async function isWithinWorkingHours({ groomerId, date, time, durationMin }) {
  // Bug fix: `new Date("YYYY-MM-DD")` parses as midnight UTC, which in any
  // US timezone is the PREVIOUS evening — so getDay() returned the wrong
  // weekday and every booking was checked against the prior day's hours.
  // Parse the parts as a local date instead.
  const [y, m, d] = String(date).split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();

  const { data: hours, error } = await supabase
    .from("working_hours")
    .select("start_time, end_time")
    .eq("groomer_id", groomerId)
    .eq("weekday", weekday)
    .maybeSingle();

  // No row = closed day (or not configured)
  if (error || !hours) return false;

  const openMin = toMinutes(hours.start_time);
  const closeMin = toMinutes(hours.end_time);

  const startMin = toMinutes(time);
  const endMin = startMin + (durationMin || 60);

  return startMin >= openMin && endMin <= closeMin;
}

// Edit allowed only for future appointments
function isFutureAppointment(appt) {
  const date = appt?.date;
  // A flexible (no-time) appointment counts as future for the whole day
  const time = appt?.is_flexible || !appt?.time ? "23:59" : String(appt.time).slice(0, 5);
  if (!date) return false;
  const ms = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

/* ---------------- New/Edit Appointment Modal ---------------- */
function NewAppointmentModal({
  open,
  onClose,
  pet,
  form,
  setForm,
  onSave,
  saving,
  editing, // appointment object or null
  initialOtherService,
  pricing,
  groomerId,
}) {
  const [otherService, setOtherService] = useState("");
  const [timeSlots, setTimeSlots] = useState([]); // [] = loading/none, null = closed
  const [slotsLoading, setSlotsLoading] = useState(true);

  // Reload the time list whenever the date or duration changes
  useEffect(() => {
    if (!open || !groomerId || !form.date) return;
    let cancelled = false;
    setSlotsLoading(true);
    loadTimeSlots({ groomerId, date: form.date, durationMin: form.duration_min })
      .then((slots) => { if (!cancelled) setTimeSlots(slots); })
      .catch(() => { if (!cancelled) setTimeSlots([]); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [open, groomerId, form.date, form.duration_min]);

  // When modal opens (or edit target changes), seed Other service input
  useEffect(() => {
    if (!open) return;
    setOtherService(initialOtherService || "");
  }, [open, initialOtherService]);

  if (!open) return null;

  if (!pet) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] p-6 text-center">
          <div className="text-gray-600 text-sm">Loading pet info...</div>
        </div>
      </div>
    );
  }

  // Bug fix: pricing tier is size_category (1=S, 2=M, 3=L, 4=XL), NOT
  // slot_weight (booking capacity). Passing slot_weight priced Medium as
  // Small, Large as Medium, and XL as Large.
  const sizeCategory = pet?.size_category || 1;

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const value =
      field === "duration_min"
        ? Number(raw || 0)
        : raw;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleService = (svc) => {
    if (svc === "Other") {
      setForm((prev) => {
        const exists = prev.services.includes("Other");
        return {
          ...prev,
          services: exists
            ? prev.services.filter((s) => s !== "Other")
            : [...prev.services, "Other"],
        };
      });
      if (form.services.includes("Other")) setOtherService("");
      return;
    }

    setForm((prev) => {
      const exists = prev.services.includes(svc);
      const newServices = exists
        ? prev.services.filter((s) => s !== svc)
        : [...prev.services, svc];
      const autoAmount = calcAmount(newServices, sizeCategory, pricing);
      return {
        ...prev,
        services: newServices,
        amount: autoAmount,
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">
            {editing ? "Edit Appointment" : "New Appointment"}
          </h2>
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
              {/* Same dropdown as the Schedule page — only real open times,
                  instead of the fiddly hour/minute time picker. */}
              <select
                value={form.time}
                onChange={handleChange("time")}
                disabled={slotsLoading || timeSlots === null}
                className="border rounded px-2 py-1"
              >
                {slotsLoading ? (
                  <option value="">Loading…</option>
                ) : timeSlots === null ? (
                  <option value="">Closed this day</option>
                ) : (
                  <>
                    <option value="">
                      {timeSlots.length ? "Select a time" : "No open times"}
                    </option>
                    {/* Keep an existing appointment's time selectable even if
                        it no longer fits the current hours */}
                    {form.time && !timeSlots.includes(form.time) && (
                      <option value={form.time}>{fmtTime(form.time)}</option>
                    )}
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>{fmtTime(slot)}</option>
                    ))}
                  </>
                )}
              </select>
              {!slotsLoading && timeSlots === null && (
                <span className="text-[11px] text-amber-600">
                  You're not working this day — pick another date or update your hours in Profile.
                </span>
              )}
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Duration (min)</span>
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
            <span className="font-medium text-gray-700">
              Amount ($)
              {form.services.filter(s => s !== "Other").length > 0 && (
                <span className="ml-2 text-xs text-emerald-600 font-normal">
                  auto-calculated · override anytime
                </span>
              )}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  amount: e.target.value,
                }))
              }
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

            {form.services.includes("Other") && (
              <input
                type="text"
                value={otherService}
                onChange={(e) => setOtherService(e.target.value)}
                placeholder="Enter other service…"
                className="mt-2 border rounded px-2 py-1 w-full text-sm"
              />
            )}
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
          <button onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onSave(otherService)}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Main PetAppointments ---------------- */
export default function PetAppointments() {
  const { petId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [pet, setPet] = useState(null);
  const [appointments, setAppointments] = useState([]);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    date: toYMD(new Date()),
    time: "",
    duration_min: 60,
    services: [],
    notes: "",
    amount: "",
    reminder_enabled: true,
  });
  const [savingNew, setSavingNew] = useState(false);

  // NEW: edit state
  const [editingAppt, setEditingAppt] = useState(null);
  const [editOtherService, setEditOtherService] = useState("");

  // ConfirmModal state
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Service pricing
  const [pricing, setPricing] = useState(DEFAULT_PRICING);

  // Auth user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Load pet + appointments for THIS petId
  useEffect(() => {
    if (!user?.id || !petId) return;

    const load = async () => {
      setLoading(true);

      const [
        { data: petRow, error: petErr },
        { data: appts, error: apptErr },
        { data: groomerData },
      ] = await Promise.all([
          supabase
            .from("pets")
            .select(
              `
              id, name, breed, tags, notes, slot_weight, size_category, client_id,
              clients ( id, full_name, phone, email )
            `
            )
            .eq("id", petId)
            .eq("groomer_id", user.id)
            .single(),
          supabase
            .from("appointments")
            .select(
              `
              id, pet_id, groomer_id, date, time, duration_min, slot_weight,
              services, notes, confirmed, no_show, paid, amount, reminder_enabled, is_flexible,
              pets ( id, name, tags, client_id, clients ( id, full_name, phone, email ) )
            `
            )
            .eq("groomer_id", user.id)
            .eq("pet_id", petId)
            .order("date", { ascending: false })
            .order("time", { ascending: false }),
          supabase
            .from("groomers")
            .select("service_pricing, custom_services")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

      if (petErr) console.error(petErr);
      if (apptErr) console.error(apptErr);

      // Prefer the groomer's edited services (custom_services) — same as the
      // public booking page — and fall back to legacy service_pricing.
      if (groomerData?.custom_services?.length > 0) {
        const pricingObj = Object.fromEntries(
          groomerData.custom_services.map((s) => [s.name, s.pricing])
        );
        setPricing({ ...DEFAULT_PRICING, ...pricingObj });
      } else if (groomerData?.service_pricing) {
        setPricing({ ...DEFAULT_PRICING, ...groomerData.service_pricing });
      }

      setPet(petRow || null);
      setAppointments(appts || []);
      setLoading(false);
    };

    load();
  }, [user?.id, petId]);

  const futureAndPast = useMemo(() => appointments, [appointments]);

  const resetFormToNew = () => {
    setNewForm({
      date: toYMD(new Date()),
      time: "",
      duration_min: 60,
      services: [],
      notes: "",
      amount: "",
      reminder_enabled: true,
    });
    setEditingAppt(null);
    setEditOtherService("");
  };

  const closeModal = () => {
    if (savingNew) return;
    setNewModalOpen(false);
    resetFormToNew();
  };

  const handleDeleteAppointment = (appt) => {
    if (!user?.id || !appt?.id) return;

    setConfirmConfig({
      title: "Delete this appointment?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase
          .from("appointments")
          .delete()
          .eq("id", appt.id)
          .eq("groomer_id", user.id);

        if (error) {
          console.error("Delete error:", error.message);
          return;
        }

        setAppointments((prev) => prev.filter((a) => a.id !== appt.id));
      },
    });
  };

  const handleSaveNew = async (otherService) => {
    if (!user?.id || !pet?.id) return;

    if (!newForm.date || !newForm.time) {
      setConfirmConfig({
        title: "Missing info",
        message: "Date and time are required before saving.",
        confirmLabel: "OK",
        danger: false,
        onConfirm: () => {},
      });
      return;
    }

    // Edit is only allowed for future appointments
    if (editingAppt && !isFutureAppointment(editingAppt)) {
      setConfirmConfig({
        title: "Cannot edit",
        message: "Only future appointments can be edited.",
        confirmLabel: "OK",
        danger: false,
        onConfirm: () => {},
      });
      return;
    }

    // Enforce Profile working hours (working_hours table) for both create + edit
    const allowed = await isWithinWorkingHours({
      groomerId: user.id,
      date: newForm.date,
      time: newForm.time,
      durationMin: newForm.duration_min || 60,
    });

    if (!allowed) {
      setConfirmConfig({
        title: "Outside working hours",
        message: "That time is outside your working hours. Please choose a time within your schedule.",
        confirmLabel: "OK",
        danger: false,
        onConfirm: () => {},
      });
      return;
    }

    // Free plan: 50 appointments per month, same rule as the Schedule page —
    // counted in the month the new appointment falls in, sample data excluded.
    if (!editingAppt) {
      const { data: g } = await supabase
        .from("groomers")
        .select("plan_tier")
        .eq("id", user.id)
        .single();

      if ((g?.plan_tier || "free") === "free") {
        const [y, m] = newForm.date.split("-").map(Number);
        const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        const { count } = await supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("groomer_id", user.id)
          .gte("date", monthStart)
          .lte("date", monthEnd)
          .or("source.is.null,source.neq.sample");

        if ((count ?? 0) >= FREE_MONTHLY_LIMIT) {
          setConfirmConfig({
            title: "Monthly limit reached",
            message: `You've reached the ${FREE_MONTHLY_LIMIT} appointment limit for the free plan in that month. Upgrade to Basic or higher for unlimited appointments.`,
            confirmLabel: "Upgrade",
            cancelLabel: "Not now",
            danger: false,
            onConfirm: () => { window.location.href = "/upgrade"; },
          });
          return;
        }
      }
    }

    const baseServices = newForm.services.filter((s) => s !== "Other");
    const finalServices = otherService
      ? [...baseServices, otherService]
      : baseServices;

    setSavingNew(true);

    const isEdit = Boolean(editingAppt?.id);

    // If an edit moves the appointment to a new date/time, clear the reminder
    // stamp so sendSmsReminders sends fresh reminders for the new slot.
    const rescheduled = isEdit && (
      newForm.date !== editingAppt.date ||
      newForm.time !== (editingAppt.time ? editingAppt.time.slice(0, 5) : "")
    );

    const query = isEdit
      ? supabase
          .from("appointments")
          .update({
            date: newForm.date,
            time: newForm.time,
            duration_min: newForm.duration_min || 60,
            services: finalServices,
            notes: newForm.notes,
            amount: newForm.amount ? Number(newForm.amount) : null,
            reminder_enabled: newForm.reminder_enabled,
            // This page always saves a real time, so a flexible appointment
            // edited here becomes a normal fixed-time one.
            is_flexible: false,
            ...(rescheduled ? { sms_reminder_sent_at: null } : {}),
          })
          .eq("id", editingAppt.id)
          .eq("groomer_id", user.id)
      : supabase.from("appointments").insert({
          groomer_id: user.id,
          pet_id: pet.id,
          date: newForm.date,
          time: newForm.time,
          duration_min: newForm.duration_min || 60,
          services: finalServices,
          notes: newForm.notes,
          slot_weight: pet.slot_weight || 1,
          size_category: pet.size_category || 1,
          amount: newForm.amount ? Number(newForm.amount) : null,
          reminder_enabled: newForm.reminder_enabled,
        });

    const { data, error } = await query
      .select(
        `
        id, pet_id, groomer_id, date, time, duration_min, slot_weight,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled, is_flexible,
        pets ( id, name, tags, client_id, clients ( id, full_name, phone, email ) )
      `
      )
      .single();

    setSavingNew(false);

    if (error) {
      setConfirmConfig({
        title: "Could not save",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        danger: false,
        onConfirm: () => {},
      });
      return;
    }

    setAppointments((prev) =>
      isEdit
        ? prev.map((a) => (a.id === data.id ? data : a))
        : [data, ...prev]
    );

    // Send confirmation email ONLY on create (preserves original behavior)
    if (
      !isEdit &&
      newForm.reminder_enabled &&
      data?.date &&
      data?.time &&
      pet?.clients?.email
    ) {
      await sendEmail({
        to: pet.clients.email,
        subject: "Your Grooming Appointment is Confirmed",
        template: "confirmation",
        data: {
          groomer_id: user.id,
          confirm_url: data.confirm_token
            ? `https://app.pawscheduler.app/confirm/${data.confirm_token}`
            : `https://app.pawscheduler.app/confirm/${data.id}`,
          logo_url: user?.logo_url ?? "",
          business_name: user?.business_name ?? "",
          business_address: user?.business_address ?? "",
          business_phone: user?.business_phone ?? "",
          groomer_email: user?.email ?? "",
          pet_name: pet.name,
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

    setNewModalOpen(false);
    resetFormToNew();
  };

  const openEditModal = (appt) => {
    // Map old service names → new standardized names
    const LEGACY_MAP = {
      "Bath Only":      "Bath",
      "Nail Trim":      "Nails",
      "Teeth Cleaning": "Teeth",
    };

    const rawServices = Array.isArray(appt.services)
      ? appt.services
      : String(appt.services || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const normalized = rawServices.map((s) => LEGACY_MAP[s] || s);
    const known = normalized.filter((s) => SERVICE_OPTIONS.includes(s));
    const other = normalized.find((s) => !SERVICE_OPTIONS.includes(s)) || "";

    setEditingAppt(appt);
    setEditOtherService(other);

    setNewForm({
      date: appt.date,
      time: appt.time && !appt.is_flexible ? appt.time.slice(0, 5) : "",
      duration_min: appt.duration_min || 60,
      services: other ? [...known, "Other"] : known,
      notes: appt.notes || "",
      amount: appt.amount ?? "",
      reminder_enabled: appt.reminder_enabled ?? true,
    });

    setNewModalOpen(true);
  };

  if (loading) {
    return (
      <main className="px-4 py-6 space-y-4 max-w-2xl mx-auto">
        {/* Back button skeleton */}
        <div className="h-4 w-28 bg-gray-200 animate-pulse rounded" />

        {/* Header card skeleton */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-2">
              <div className="h-6 w-56 bg-gray-200 animate-pulse rounded" />
              <div className="h-4 w-36 bg-gray-100 animate-pulse rounded" />
            </div>
            <div className="h-10 w-36 bg-gray-200 animate-pulse rounded-xl" />
          </div>
        </div>

        {/* Appointment card skeletons */}
        <Loader />
        <Loader />
        <Loader />
      </main>
    );
  }

  if (!pet) {
    return (
      <main className="px-4 py-6 space-y-4">
        <Link to="/" className="text-sm">
          ← Back to Clients
        </Link>

        <div className="card">
          <div className="text-gray-700 font-semibold">Pet not found</div>
          <div className="text-sm text-gray-600">
            This pet may have been deleted or doesn’t belong to this groomer.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 space-y-4">
      {/* ✅ FIX: history-aware back button (prevents empty Clients) */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/");
        }}
        className="text-sm"
      >
        ← Back to Client
      </button>

      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Appointments — {pet.name}
            </h1>
            <div className="text-sm text-gray-600">
              Client:{" "}
              <span className="font-medium">{pet.clients?.full_name}</span>
              {pet.clients?.phone ? (
                <span className="ml-2 text-xs text-gray-500">
                  • {pet.clients.phone}
                </span>
              ) : null}
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => {
              resetFormToNew();
              setNewModalOpen(true);
            }}
          >
            ➕ Add Appointment
          </button>
        </div>
      </div>

      {futureAndPast.length === 0 ? (
        <p className="text-gray-600 italic">No appointments for this pet yet.</p>
      ) : (
        <div className="grid gap-4">
          {futureAndPast.map((appt) => {
            const start = fmtTime(appt.time);
            const end = getEndTime((appt.time || "00:00").slice(0, 5), appt.duration_min || 15);
            const canEdit = isFutureAppointment(appt);

            return (
              <div key={appt.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-500">{appt.date}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {appt.is_flexible || !appt.time ? "🔄 Flexible time" : `${start} – ${end}`}
                    </div>
                    <div className="text-sm text-gray-600">
                      {appt.duration_min} min
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
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

                    <div className="flex gap-2">
                      {canEdit && (
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => openEditModal(appt)}
                          type="button"
                        >
                          ✏️ Edit
                        </button>
                      )}

                      <button
                        className="btn-danger text-xs"
                        onClick={() => handleDeleteAppointment(appt)}
                        type="button"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                </div>

                {appt.services?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
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

                {appt.notes && (
                  <div className="text-sm italic text-gray-500 mt-2">
                    {appt.notes}
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-3">
                  <span className="chip chip-warning">
                    Confirmed: {appt.confirmed ? "Yes" : "No"}
                  </span>
                  <span className="chip chip-warning">
                    No-show: {appt.no_show ? "Yes" : "No"}
                  </span>
                  <span className="chip chip-warning">
                    Paid: {appt.paid ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewAppointmentModal
        open={newModalOpen}
        onClose={closeModal}
        pet={pet}
        form={newForm}
        setForm={setNewForm}
        onSave={handleSaveNew}
        saving={savingNew}
        editing={editingAppt}
        initialOtherService={editOtherService}
        pricing={pricing}
        groomerId={user?.id}
      />

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </main>
  );
}