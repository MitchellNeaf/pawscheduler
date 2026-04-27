import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { SERVICE_OPTIONS, DEFAULT_PRICING, calcAmount } from "../utils/grooming";
import ConfirmModal from "../components/ConfirmModal";

/* --------------------------------------------
   TIME SLOTS
-------------------------------------------- */
const TIME_SLOTS = [];
for (let hour = 6; hour <= 20; hour++) {
  for (let min of [0, 15, 30, 45]) {
    TIME_SLOTS.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
}

/* --------------------------------------------
   FORMAT DATE — FIXED (UTC SAFE)
-------------------------------------------- */
const formatDate = (d) => {
  if (!d) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/* --------------------------------------------
   PARSE YYYY-MM-DD TO LOCAL DATE (NO OFFSET)
-------------------------------------------- */
const parseDBDate = (str) => {
  if (!str) return null;
  const y = Number(str.substring(0, 4));
  const m = Number(str.substring(5, 7)) - 1;
  const d = Number(str.substring(8, 10));
  return new Date(y, m, d);
};

/* --------------------------------------------
   MAIN COMPONENT
-------------------------------------------- */
export default function BookPage() {
  const { slug } = useParams();

  const [groomer, setGroomer] = useState(null);
  const [groomerId, setGroomerId] = useState(null);
  const [maxParallel, setMaxParallel] = useState(1);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);

  const [clientForm, setClientForm] = useState({ name: "", last4: "" });
  const [client, setClient] = useState(null);

  // "login" | "home" | "book" | "cancel"
  const [view, setView] = useState("login");
  const [upcomingAppts, setUpcomingAppts] = useState([]);
  const [cancelling, setCancelling] = useState(null);

  const [pets, setPets] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState("");

  const [selectedPetWeight, setSelectedPetWeight] = useState(1);

  const [form, setForm] = useState({
    services: [],
    date: "",
    time: "",
    duration_min: "",
    notes: "",
  });

  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ConfirmModal state
  const [confirmConfig, setConfirmConfig] = useState(null);

  const [unavailable, setUnavailable] = useState([]);
  const [workingRange, setWorkingRange] = useState([]);
  const [vacationBlocks, setVacationBlocks] = useState([]);


  const [vacationDates, setVacationDates] = useState([]);
  const [workingWeekdays, setWorkingWeekdays] = useState([]);

  /* --------------------------------------------
     LOAD GROOMER
  -------------------------------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: gErr } = await supabase
        .from("groomers")
        .select("id, full_name, slug, logo_url, max_parallel, service_pricing")
        .eq("slug", slug)
        .single();

      if (!gErr && data && mounted) {
        setGroomer(data);
        setGroomerId(data.id);
        setMaxParallel(data.max_parallel ?? 1);
        if (data.service_pricing) {
          setPricing({ ...DEFAULT_PRICING, ...data.service_pricing });
        }
      } else {
        setError("Booking page not found.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [slug]);

  /* --------------------------------------------
     LOAD VACATION DATES
  -------------------------------------------- */
  useEffect(() => {
    if (!groomerId) return;

    (async () => {
      const { data } = await supabase
        .from("vacation_days")
        .select("date")
        .eq("groomer_id", groomerId);

      if (data) setVacationDates(data.map((v) => v.date));
    })();
  }, [groomerId]);

  /* --------------------------------------------
     LOAD WORKING WEEKDAYS
  -------------------------------------------- */
  useEffect(() => {
    if (!groomerId) return;

    (async () => {
      const { data } = await supabase
        .from("working_hours")
        .select("weekday")
        .eq("groomer_id", groomerId);

      if (data) {
        const days = [...new Set(data.map((h) => h.weekday))];
        setWorkingWeekdays(days);
      }
    })();
  }, [groomerId]);

  /* --------------------------------------------
     FETCH TAKEN TIMES — FIXED WEEKDAY
  -------------------------------------------- */
  const fetchTakenTimes = useCallback(async () => {
    if (!form.date || !groomerId) return;

    const [y, m, d] = form.date.split("-").map(Number);

    // FIX: Use UTC-safe weekday
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    // Vacation
    const { data: vacs } = await supabase
      .from("vacation_days")
      .select("*")
      .eq("groomer_id", groomerId)
      .eq("date", form.date);

    let vacationInfo = [];
    if (vacs?.length) {
      vacationInfo = vacs.map((v) => {
        const fullDay = !v.start_time && !v.end_time;
        if (fullDay) return { type: "full" };
        return {
          type: "partial",
          start: v.start_time.slice(0, 5),
          end: v.end_time.slice(0, 5),
        };
      });
    }
    setVacationBlocks(vacationInfo);

    if (vacationInfo.some((v) => v.type === "full")) {
      setWorkingRange([]);
      setUnavailable([...TIME_SLOTS]);
      return;
    }

    // Working hours
    const { data: hours } = await supabase
      .from("working_hours")
      .select("*")
      .eq("groomer_id", groomerId)
      .eq("weekday", weekday)
      .maybeSingle();

    if (!hours) {
      setWorkingRange([]);
      setUnavailable([...TIME_SLOTS]);
      return;
    }

    const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
    const endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
    const activeSlots = TIME_SLOTS.slice(startIdx, endIdx + 1);
    setWorkingRange(activeSlots);

    // Breaks
    const { data: breaks } = await supabase
      .from("working_breaks")
      .select("*")
      .eq("groomer_id", groomerId)
      .eq("weekday", weekday);

    const breakBlocked = new Set();
    (breaks || []).forEach((b) => {
      const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
      const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
      TIME_SLOTS.slice(bi, ei + 1).forEach((slot) => breakBlocked.add(slot));
    });

    // Existing appts
    const { data: appts } = await supabase
      .from("appointments")
      .select("time, duration_min, slot_weight")
      .eq("date", form.date)
      .eq("groomer_id", groomerId);

    const loadForSlot = (slot) => {
      let total = 0;
      (appts || []).forEach((a) => {
        const start = a.time?.slice(0, 5);
        const idx = TIME_SLOTS.indexOf(start);
        if (idx < 0) return;

        const blocks = Math.ceil((a.duration_min || 15) / 15);
        const slots = TIME_SLOTS.slice(idx, idx + blocks);

        if (slots.includes(slot)) total += a.slot_weight ?? 1;
      });
      return total;
    };

    const weightedBlocked = new Set();
    activeSlots.forEach((slot) => {
      if (loadForSlot(slot) >= maxParallel) {
        weightedBlocked.add(slot);
      }
    });

    const vacationPartial = new Set();
    vacationInfo.forEach((vac) => {
      if (vac.type === "partial") {
        const bi = TIME_SLOTS.indexOf(vac.start);
        const ei = TIME_SLOTS.indexOf(vac.end);
        TIME_SLOTS.slice(bi, ei + 1).forEach((s) => vacationPartial.add(s));
      }
    });

    const allUnavailable = new Set([
      ...breakBlocked,
      ...weightedBlocked,
      ...vacationPartial,
    ]);

    setUnavailable([...allUnavailable]);
  }, [form.date, groomerId, maxParallel]);

  useEffect(() => {
    fetchTakenTimes();
  }, [fetchTakenTimes]);

  /* --------------------------------------------
     AUTO-DURATION
  -------------------------------------------- */
  useEffect(() => {
    const s = form.services;

    if (s.length === 0)
      return setForm((f) => ({ ...f, duration_min: "" }));

    if (s.length === 1 && s.includes("Nails"))
      return setForm((f) => ({ ...f, duration_min: "15" }));

    if (s.length === 1 && (s.includes("Anal Glands") || s.includes("Teeth")))
      return setForm((f) => ({ ...f, duration_min: "15" }));

    if (s.includes("Deshed") || s.length >= 5)
      return setForm((f) => ({ ...f, duration_min: "60" }));

    if (s.includes("Full Groom"))
      return setForm((f) => ({ ...f, duration_min: "60" }));

    if (s.includes("Bath") && s.includes("Puppy Trim"))
      return setForm((f) => ({ ...f, duration_min: "60" }));

    if (s.includes("Bath") || s.includes("Puppy Trim") || s.length >= 2)
      return setForm((f) => ({ ...f, duration_min: "30" }));

    return setForm((f) => ({ ...f, duration_min: "30" }));
  }, [form.services]);

  /* --------------------------------------------
     AUTO-SELECT EARLIEST TIME
  -------------------------------------------- */
  useEffect(() => {
    if (!form.date || !workingRange.length || !form.duration_min) return;
    if (form.time) return;

    const blocks = Math.ceil(Number(form.duration_min) / 15);

    const earliest = workingRange.find((slot, idx) => {
      const windowSlots = workingRange.slice(idx, idx + blocks);
      if (windowSlots.length < blocks) return false;
      if (windowSlots.some((s) => unavailable.includes(s))) return false;
      return true;
    });

    if (earliest) {
      setForm((prev) => ({ ...prev, time: earliest }));
    }
  }, [form.date, form.duration_min, workingRange, unavailable, form.time]);

  /* --------------------------------------------
     LOGIN
  -------------------------------------------- */
  const handleClientLogin = async (e) => {
    e.preventDefault();
    setError("");

    const firstName = clientForm.name.trim().toLowerCase();
    const last4 = clientForm.last4.trim();

    const { data: matches } = await supabase
      .from("clients")
      .select("*")
      .eq("groomer_id", groomerId)
      .ilike("full_name", `${firstName}%`)
      .like("phone", `%${last4}`);

    if (!matches?.length) return setError("Client not found.");

    const matchedClient = matches[0];
    setClient(matchedClient);

    const { data: petList } = await supabase
      .from("pets")
      .select("id, name, slot_weight")
      .eq("client_id", matchedClient.id)
      .eq("groomer_id", groomerId);

    setPets(petList || []);

    if (petList?.length === 1) {
      setSelectedPetId(petList[0].id);
      setSelectedPetWeight(petList[0].slot_weight ?? 1);
    }

    // Load upcoming appointments for this client
    const today = new Date().toISOString().slice(0, 10);
    const petIds = (petList || []).map((p) => p.id);

    let appts = [];
    if (petIds.length > 0) {
      const { data, error: apptErr } = await supabase
        .from("appointments")
        .select("id, date, time, duration_min, services, pets(name)")
        .eq("groomer_id", groomerId)
        .in("pet_id", petIds)
        .gte("date", today)
        .or("no_show.is.null,no_show.eq.false")
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (apptErr) console.error("Upcoming appts error:", apptErr);
      appts = data || [];
    }

    setUpcomingAppts(appts || []);
    setView("home");
  };

  /* --------------------------------------------
     FORM CHANGE
  -------------------------------------------- */
  const handleChange = (e) => {
    const { name, value, checked } = e.target;

    if (name === "name" || name === "last4") {
      return setClientForm((p) => ({ ...p, [name]: value }));
    }

    if (name === "services") {
      const newServices = checked
        ? [...form.services, value]
        : form.services.filter((s) => s !== value);
      const autoAmount = calcAmount(newServices, selectedPetWeight, pricing);
      return setForm((p) => ({
        ...p,
        services: newServices,
        estimatedAmount: autoAmount,
      }));
    }

    if (name === "date") {
      setForm((p) => ({ ...p, date: value, time: "" }));
      return;
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  /* --------------------------------------------
     SUBMIT
  -------------------------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    if (!selectedPetId) {
      setConfirmConfig({
        title: "No pet selected",
        message: "Please select a pet before booking.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
      setSubmitting(false);
      return;
    }

    const slotWeight = selectedPetWeight ?? 1;
    const autoAmount = calcAmount(form.services, slotWeight, pricing);

    // ── Server-side free tier limit check ──────────────────
    const { data: planData } = await supabase
      .from("groomers")
      .select("plan_tier")
      .eq("id", groomerId)
      .single();

    if (planData?.plan_tier === "free") {
      const { data: countData } = await supabase
        .rpc("get_monthly_appointment_count", { p_groomer_id: groomerId });

      if (countData >= 50) {
        setConfirmConfig({
          title: "Booking unavailable",
          message: "This groomer's calendar is fully booked for this month. Please contact them directly to schedule.",
          confirmLabel: "OK",
          onConfirm: () => {},
        });
        setSubmitting(false);
        return;
      }
    }

    const { error } = await supabase.from("appointments").insert([
      {
        groomer_id: groomerId,
        pet_id: selectedPetId,
        date: form.date,
        time: form.time,
        duration_min: Number(form.duration_min),
        services: form.services,
        confirmed: false,
        no_show: false,
        amount: autoAmount > 0 ? autoAmount : null,
        paid: false,
        notes: form.notes || "",
        slot_weight: slotWeight,
      },
    ]);

    if (error) {
      setConfirmConfig({
        title: "Booking failed",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    } else {
      // Fire groomer notification email (fire-and-forget)
      if (groomer?.email) {
        fetch("/.netlify/functions/sendEmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: groomer.email,
            subject: `New booking — ${pets.find((p) => p.id === selectedPetId)?.name || "a pet"} on ${form.date}`,
            template: "groomer_notification",
            data: {
              pet_name: pets.find((p) => p.id === selectedPetId)?.name || "—",
              client_name: client?.full_name || "—",
              date: form.date,
              time: form.time,
              duration_min: form.duration_min,
              services: form.services.join(", "),
              amount: autoAmount > 0 ? `$${autoAmount.toFixed(2)}` : "—",
              notes: form.notes || "",
            },
          }),
        }).catch(() => {}); // don't block on email failure
      }

      setSubmitted({
        pet: pets.find((p) => p.id === selectedPetId)?.name || "",
        date: form.date,
        time: form.time,
        services: form.services,
        duration: form.duration_min,
        amount: autoAmount,
      });
      setView("home");
    }

    setSubmitting(false);
  };

  /* --------------------------------------------
     CANCEL APPOINTMENT
  -------------------------------------------- */
  const handleCancel = async (apptId) => {
    setConfirmConfig({
      title: "Cancel appointment?",
      message: "This cannot be undone. You will need to rebook if you change your mind.",
      confirmLabel: "Yes, cancel it",
      cancelLabel: "Keep it",
      danger: true,
      onConfirm: async () => {
        setCancelling(apptId);

        const appt = upcomingAppts.find((a) => a.id === apptId);

        const { error } = await supabase
          .from("appointments")
          .delete()
          .eq("id", apptId)
          .eq("groomer_id", groomerId);

        if (error) {
          setConfirmConfig({
            title: "Could not cancel",
            message: "Please call us directly to cancel this appointment.",
            confirmLabel: "OK",
            onConfirm: () => {},
          });
        } else {
          setUpcomingAppts((prev) => prev.filter((a) => a.id !== apptId));

          if (groomer?.email && appt) {
            fetch("/.netlify/functions/sendEmail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: groomer.email,
                subject: `Appointment cancelled — ${appt.pets?.name || "a pet"} on ${appt.date}`,
                template: "groomer_cancellation",
                data: {
                  pet_name: appt.pets?.name || "—",
                  client_name: client?.full_name || "—",
                  date: appt.date,
                  time: appt.time || "",
                  duration_min: appt.duration_min || "",
                  services: Array.isArray(appt.services)
                    ? appt.services.join(", ")
                    : appt.services || "—",
                  notes: "",
                },
              }),
            }).catch(() => {});
          }
        }

        setCancelling(null);
      },
    });
  };

  /* --------------------------------------------
     RENDER
-------------------------------------------- */

  if (error)
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600 font-semibold text-center">{error}</p>
      </main>
    );

  if (!groomerId)
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-[var(--text-3)] text-center">Loading booking page…</p>
      </main>
    );

  const isFullVacation = vacationBlocks.some((v) => v.type === "full") && form.date;

  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  // Shared label style
  const labelCls = "block text-sm font-semibold text-[var(--text-2)] mb-1.5";
  // Shared input style
  const inputCls = "w-full border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition";

  return (
    <main className="min-h-screen bg-[var(--bg)] py-8 px-4">
      <div className="max-w-md mx-auto space-y-5">

        {/* ── HEADER ── */}
        {groomer && (
          <div className="text-center pb-2">
            {groomer.logo_url && (
              <img
                src={groomer.logo_url}
                alt="Logo"
                className="w-20 h-20 rounded-full object-cover mx-auto mb-3 shadow-md ring-2 ring-[var(--border)]"
              />
            )}
            <h1 className="text-xl font-bold text-[var(--text-1)]">{groomer.full_name}</h1>
            <p className="text-xs text-[var(--text-3)] mt-1">Online Booking</p>
          </div>
        )}

        {/* ── LOGIN VIEW ── */}
        {view === "login" && (
          <div className="card">
            <div className="card-body space-y-4">
              <div className="text-center">
                <h2 className="text-base font-bold text-[var(--text-1)]">Enter your info to continue</h2>
                <p className="text-xs text-[var(--text-3)] mt-1">We'll match you with your client record</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={labelCls}>First name</label>
                  <input
                    name="name"
                    placeholder="e.g. Sarah"
                    value={clientForm.name}
                    onChange={handleChange}
                    className={inputCls}
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label className={labelCls}>Last 4 digits of phone</label>
                  <input
                    name="last4"
                    placeholder="e.g. 4321"
                    value={clientForm.last4}
                    onChange={handleChange}
                    className={inputCls}
                    maxLength={4}
                    inputMode="numeric"
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 font-medium text-center bg-red-50 rounded-lg py-2 px-3">
                    {error}
                  </p>
                )}

                <button
                  onClick={handleClientLogin}
                  className="w-full py-3 rounded-xl bg-[var(--brand)] text-white font-bold text-sm hover:opacity-90 active:opacity-80 transition"
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── HOME VIEW ── */}
        {view === "home" && client && (
          <div className="space-y-3">
            <p className="text-center text-[var(--text-2)] text-sm">
              Hi <strong className="text-[var(--text-1)]">{client.full_name.split(" ")[0]}</strong>, what would you like to do?
            </p>

            {/* Success banner */}
            {submitted && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-2">
                <p className="font-bold text-emerald-800 text-sm">✅ Appointment booked!</p>
                <div className="text-xs text-emerald-700 space-y-0.5 leading-relaxed">
                  <div><span className="font-semibold">Pet:</span> {submitted.pet}</div>
                  <div><span className="font-semibold">Date:</span> {submitted.date} at {fmtTime(submitted.time)}</div>
                  <div><span className="font-semibold">Services:</span> {submitted.services.join(", ")}</div>
                  {submitted.amount > 0 && (
                    <div><span className="font-semibold">Estimated total:</span> ${submitted.amount.toFixed(2)}</div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => { setSubmitted(null); setView("book"); }}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-[var(--brand)] text-white font-bold text-sm text-left hover:opacity-90 active:opacity-80 transition shadow-sm"
            >
              <span className="text-xl">📅</span>
              <span>Book an Appointment</span>
            </button>

            <button
              onClick={() => setView("cancel")}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border-med)] text-[var(--text-1)] font-bold text-sm text-left hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🗓</span>
                <span>View / Cancel Appointments</span>
              </div>
              {upcomingAppts.length > 0 && (
                <span className="bg-[var(--brand)] text-white text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
                  {upcomingAppts.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── BOOK VIEW ── */}
        {view === "book" && client && (
          <div className="space-y-4">
            <button
              onClick={() => setView("home")}
              className="text-sm font-semibold text-[var(--brand)] hover:underline flex items-center gap-1"
            >
              ← Back
            </button>

            <div className="card">
              <div className="card-body space-y-5">

                {/* Pet select */}
                {pets.length > 1 && (
                  <div>
                    <label className={labelCls}>Select pet</label>
                    <select
                      value={selectedPetId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedPetId(id);
                        const p = pets.find((pet) => pet.id === id);
                        setSelectedPetWeight(p?.slot_weight ?? 1);
                        setForm((prev) => ({ ...prev, time: "" }));
                      }}
                      className={inputCls}
                    >
                      <option value="">Choose a pet</option>
                      {pets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Services */}
                <div>
                  <label className={labelCls}>Services</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SERVICE_OPTIONS.map((s) => {
                      const checked = form.services.includes(s);
                      return (
                        <label
                          key={s}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer text-sm font-medium transition
                            ${checked
                              ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                              : "bg-[var(--surface)] border-[var(--border-med)] text-[var(--text-2)] hover:border-[var(--brand)]"
                            }`}
                        >
                          <input
                            type="checkbox"
                            name="services"
                            value={s}
                            checked={checked}
                            onChange={handleChange}
                            className="accent-emerald-600 w-4 h-4 shrink-0"
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Price + duration estimate */}
                {form.services.filter((s) => s !== "Other").length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-sm text-emerald-700">
                      ⏱ {form.duration_min} min &nbsp;·&nbsp; Estimated total
                    </span>
                    <span className="font-bold text-emerald-800 text-base">
                      ${calcAmount(form.services, selectedPetWeight, pricing).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Date picker */}
                <div>
                  <label className={labelCls}>Date</label>
                  <DatePicker
                    selected={form.date ? parseDBDate(form.date) : null}
                    onChange={(d) => {
                      const clean = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                      setForm((p) => ({ ...p, date: formatDate(clean), time: "" }));
                    }}
                    dateFormat="MMM d, yyyy"
                    className={inputCls}
                    placeholderText="Pick a date"
                    filterDate={(d) => {
                      if (!workingWeekdays.length) return true;
                      const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                      return workingWeekdays.includes(utc.getUTCDay());
                    }}
                    dayClassName={(d) => {
                      const clean = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                      const f = formatDate(clean);
                      if (vacationDates.includes(f)) return "bg-red-300 text-white";
                      if (!workingWeekdays.includes(clean.getUTCDay())) return "bg-gray-200 text-gray-400";
                      return "";
                    }}
                    minDate={new Date()}
                  />
                </div>

                {/* Time select */}
                <div>
                  <label className={labelCls}>Time</label>
                  <select
                    name="time"
                    value={form.time}
                    onChange={handleChange}
                    disabled={!form.date || !workingRange.length || isFullVacation}
                    className={`${inputCls} ${isFullVacation ? "bg-red-50 border-red-300" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">
                      {isFullVacation
                        ? "Day Off — Vacation"
                        : workingRange.length
                        ? "Select a time"
                        : "Not working this day"}
                    </option>
                    {!isFullVacation &&
                      workingRange
                        .filter((slot, idx) => {
                          const blocks = Math.ceil(Number(form.duration_min || 0) / 15);
                          const windowSlots = workingRange.slice(idx, idx + blocks);
                          if (windowSlots.length < blocks) return false;
                          if (windowSlots.some((s) => unavailable.includes(s))) return false;
                          return true;
                        })
                        .map((slot) => (
                          <option key={slot} value={slot}>{fmtTime(slot)}</option>
                        ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className={labelCls}>Notes <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    placeholder="Any special requests…"
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !form.date || !form.time}
                  className="w-full py-3 rounded-xl bg-[var(--brand)] text-white font-bold text-sm hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {submitting ? "Booking…" : "Confirm Appointment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CANCEL VIEW ── */}
        {view === "cancel" && client && (
          <div className="space-y-4">
            <button
              onClick={() => setView("home")}
              className="text-sm font-semibold text-[var(--brand)] hover:underline flex items-center gap-1"
            >
              ← Back
            </button>

            <h2 className="font-bold text-[var(--text-1)] text-base">Upcoming Appointments</h2>

            {upcomingAppts.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-[var(--border-med)] rounded-xl text-[var(--text-3)] text-sm">
                No upcoming appointments found.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppts.map((appt) => {
                  const [y, m, d] = appt.date.split("-").map(Number);
                  const [h = 0, min = 0] = (appt.time || "00:00").slice(0, 5).split(":").map(Number);
                  const apptMs = new Date(y, m - 1, d, h, min).getTime();
                  const withinCutoff = apptMs - Date.now() < 24 * 60 * 60 * 1000;

                  return (
                    <div key={appt.id} className="card">
                      <div className="card-body flex items-start justify-between gap-4">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-bold text-[var(--text-1)] text-sm">{appt.pets?.name}</p>
                          <p className="text-xs text-[var(--text-2)]">
                            {appt.date} · {fmtTime(appt.time)}
                          </p>
                          {appt.duration_min && (
                            <p className="text-xs text-[var(--text-3)]">{appt.duration_min} min</p>
                          )}
                          {appt.services?.length > 0 && (
                            <p className="text-xs text-[var(--text-3)]">
                              {Array.isArray(appt.services) ? appt.services.join(", ") : appt.services}
                            </p>
                          )}
                        </div>

                        {withinCutoff ? (
                          <div className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center leading-tight">
                            Call to<br />cancel
                          </div>
                        ) : (
                          <button
                            onClick={() => handleCancel(appt.id)}
                            disabled={cancelling === appt.id}
                            className="shrink-0 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-100 disabled:opacity-50 transition"
                          >
                            {cancelling === appt.id ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-[var(--text-3)] text-center pt-2">
              Cancellations must be made at least 24 hours in advance.<br />
              To reschedule, cancel here and book a new time.
            </p>
          </div>
        )}

      </div>

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </main>
  );
}