// src/pages/PetAppointments.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { Link, useParams, useNavigate } from "react-router-dom";
import Loader from "../components/Loader";
import { sendEmail } from "../utils/sendEmail";

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

// Prices match Schedule.jsx service names exactly
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

const calcAmount = (services, slotWeight, pricing) => {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) };
  const sz = slotWeight || 1;
  return services
    .filter((s) => s !== "Other")
    .reduce((sum, svc) => {
      const row = p[svc];
      return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
    }, 0);
};

function getEndTime(start, durationMin) {
  if (!start) return "—";
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + (durationMin || 15);
  return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(
    endMin % 60
  ).padStart(2, "0")}`;
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

async function isWithinWorkingHours({ groomerId, date, time, durationMin }) {
  const weekday = new Date(date).getDay();

  const { data: hours, error } = await supabase
    .from("working_hours")
    .select("start_time, end_time")
    .eq("groomer_id", groomerId)
    .eq("weekday", weekday)
    .single();

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
  const time = String(appt?.time || "00:00").slice(0, 5);
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
}) {
  const [otherService, setOtherService] = useState("");

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

  const slotWeight = pet?.slot_weight || 1;

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
      const autoAmount = calcAmount(newServices, slotWeight, pricing);
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
              id, name, breed, tags, notes, slot_weight, client_id,
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
              services, notes, confirmed, no_show, paid, amount, reminder_enabled,
              pets ( id, name, tags, client_id, clients ( id, full_name, phone, email ) )
            `
            )
            .eq("groomer_id", user.id)
            .eq("pet_id", petId)
            .order("date", { ascending: false })
            .order("time", { ascending: false }),
          supabase
            .from("groomers")
            .select("service_pricing")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

      if (petErr) console.error(petErr);
      if (apptErr) console.error(apptErr);

      if (groomerData?.service_pricing) {
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

  const handleDeleteAppointment = async (appt) => {
    if (!user?.id || !appt?.id) return;

    const ok = window.confirm(
      "Delete this appointment? This cannot be undone."
    );
    if (!ok) return;

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appt.id)
      .eq("groomer_id", user.id);

    if (error) {
      alert(error.message);
      return;
    }

    setAppointments((prev) => prev.filter((a) => a.id !== appt.id));
  };

  const handleSaveNew = async (otherService) => {
    if (!user?.id || !pet?.id) return;

    if (!newForm.date || !newForm.time) {
      alert("Date and time are required.");
      return;
    }

    // Edit is only allowed for future appointments
    if (editingAppt && !isFutureAppointment(editingAppt)) {
      alert("Only future appointments can be edited.");
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
      alert("That time is outside your working hours.");
      return;
    }

    const baseServices = newForm.services.filter((s) => s !== "Other");
    const finalServices = otherService
      ? [...baseServices, otherService]
      : baseServices;

    setSavingNew(true);

    const isEdit = Boolean(editingAppt?.id);

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
          amount: newForm.amount ? Number(newForm.amount) : null,
          reminder_enabled: newForm.reminder_enabled,
        });

    const { data, error } = await query
      .select(
        `
        id, pet_id, groomer_id, date, time, duration_min, slot_weight,
        services, notes, confirmed, no_show, paid, amount, reminder_enabled,
        pets ( id, name, tags, client_id, clients ( id, full_name, phone, email ) )
      `
      )
      .single();

    setSavingNew(false);

    if (error) {
      alert(error.message);
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
          confirm_url: `https://app.pawscheduler.app/.netlify/functions/confirmAppointment?id=${data.id}`,
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
      time: (appt.time || "00:00").slice(0, 5),
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
      <main className="px-4 py-6 space-y-4">
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
            const start = (appt.time || "00:00").slice(0, 5);
            const end = getEndTime(start, appt.duration_min || 15);
            const canEdit = isFutureAppointment(appt);

            return (
              <div key={appt.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-500">{appt.date}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {start} – {end}
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
      />
    </main>
  );
}