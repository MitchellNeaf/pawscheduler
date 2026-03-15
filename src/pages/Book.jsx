import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

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
   SERVICE OPTIONS — matches Schedule + PetAppointments
-------------------------------------------- */
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
      alert("Please select a pet.");
      setSubmitting(false);
      return;
    }

    const slotWeight = selectedPetWeight ?? 1;
    const autoAmount = calcAmount(form.services, slotWeight, pricing);

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

    if (error) alert(error.message);
    else {
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
    if (!window.confirm("Are you sure you want to cancel this appointment?")) return;
    setCancelling(apptId);

    // Grab the appt details before deleting so we can email the groomer
    const appt = upcomingAppts.find((a) => a.id === apptId);

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", apptId)
      .eq("groomer_id", groomerId);

    if (error) {
      alert("Could not cancel — please call us directly.");
    } else {
      setUpcomingAppts((prev) => prev.filter((a) => a.id !== apptId));

      // Notify the groomer (fire-and-forget)
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
  };

  /* --------------------------------------------
     RENDER
-------------------------------------------- */

  if (error)
    return <main className="p-4 text-center text-red-600">{error}</main>;

  if (!groomerId)
    return <main className="p-4 text-center">Loading booking page…</main>;

  const isFullVacation =
    vacationBlocks.some((v) => v.type === "full") && form.date;

  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>

      {/* HEADER */}
      {groomer && (
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {groomer.logo_url && (
            <img src={groomer.logo_url} alt="Logo"
              style={{ width: 72, height: 72, borderRadius: "50%",
                objectFit: "cover", margin: "0 auto 10px" }} />
          )}
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{groomer.full_name}</div>
        </div>
      )}

      {/* ── LOGIN VIEW ── */}
      {view === "login" && (
        <div>
          <h2 style={{ textAlign: "center", marginBottom: 16, fontSize: "1.1rem", fontWeight: 700 }}>
            Enter your info to continue
          </h2>
          <form onSubmit={handleClientLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              name="name" placeholder="First name"
              value={clientForm.name} onChange={handleChange}
              className="border rounded px-2 py-1 w-full" required
            />
            <input
              name="last4" placeholder="Last 4 digits of phone"
              value={clientForm.last4} onChange={handleChange}
              className="border rounded px-2 py-1 w-full"
              maxLength={4} inputMode="numeric" required
            />
            {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", textAlign: "center" }}>{error}</p>}
            <button type="submit"
              style={{ marginTop: 4, padding: "10px", borderRadius: 8,
                background: "#10b981", color: "white", fontWeight: 700,
                border: "none", cursor: "pointer", fontSize: "0.95rem" }}>
              Continue
            </button>
          </form>
        </div>
      )}

      {/* ── HOME VIEW ── */}
      {view === "home" && client && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "0.9rem", marginBottom: 4 }}>
            Hi <strong>{client.full_name.split(" ")[0]}</strong>, what would you like to do?
          </p>

          {/* Success banner after booking */}
          {submitted && (
            <div style={{ padding: "14px 16px", borderRadius: 12,
              background: "#ecfdf5", border: "1px solid #6ee7b7", marginBottom: 4 }}>
              <div style={{ fontWeight: 700, color: "#065f46", marginBottom: 6 }}>
                ✅ Appointment booked!
              </div>
              <div style={{ fontSize: "0.83rem", color: "#064e3b", lineHeight: 1.6 }}>
                <div><strong>Pet:</strong> {submitted.pet}</div>
                <div><strong>Date:</strong> {submitted.date} at {fmtTime(submitted.time)}</div>
                <div><strong>Services:</strong> {submitted.services.join(", ")}</div>
                {submitted.amount > 0 && (
                  <div><strong>Estimated total:</strong> ${submitted.amount.toFixed(2)}</div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => { setSubmitted(null); setView("book"); }}
            style={{ padding: "14px 16px", borderRadius: 12, border: "2px solid #10b981",
              background: "#10b981", color: "white", fontWeight: 700,
              fontSize: "1rem", cursor: "pointer", textAlign: "left" }}>
            📅 Book an Appointment
          </button>

          <button
            onClick={() => setView("cancel")}
            style={{ padding: "14px 16px", borderRadius: 12, border: "2px solid #e5e7eb",
              background: "white", color: "#374151", fontWeight: 700,
              fontSize: "1rem", cursor: "pointer", textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>🗓 View / Cancel Appointments</span>
            {upcomingAppts.length > 0 && (
              <span style={{ background: "#10b981", color: "white", borderRadius: 99,
                fontSize: "0.72rem", fontWeight: 800, padding: "2px 8px" }}>
                {upcomingAppts.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── BOOK VIEW ── */}
      {view === "book" && client && (
        <div>
          <button onClick={() => setView("home")}
            style={{ marginBottom: 16, fontSize: "0.82rem", color: "#10b981",
              fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            ← Back
          </button>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* PET SELECT */}
            {pets.length > 1 && (
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151",
                  display: "block", marginBottom: 4 }}>Select pet</label>
                <select value={selectedPetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedPetId(id);
                    const p = pets.find((pet) => pet.id === id);
                    const weight = p?.slot_weight ?? 1;
                    setSelectedPetWeight(weight);
                    setForm((prev) => ({ ...prev, time: "" }));
                  }}
                  className="border rounded px-2 py-1 w-full">
                  <option value="">Choose a pet</option>
                  {pets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* SERVICES */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Services
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {SERVICE_OPTIONS.map((s) => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 6,
                    fontSize: "0.88rem", color: "#374151", cursor: "pointer" }}>
                    <input type="checkbox" name="services" value={s}
                      checked={form.services.includes(s)} onChange={handleChange} />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {/* PRICE + DURATION ESTIMATE */}
            {form.services.filter(s => s !== "Other").length > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: 10,
                background: "#ecfdf5", border: "1px solid #6ee7b7",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#065f46" }}>
                  ⏱ {form.duration_min} min &nbsp;·&nbsp; Estimated total
                </span>
                <span style={{ fontWeight: 800, color: "#065f46", fontSize: "1rem" }}>
                  ${calcAmount(form.services, selectedPetWeight, pricing).toFixed(2)}
                </span>
              </div>
            )}

            {/* DATE PICKER */}
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>Date</label>
              <DatePicker
                selected={form.date ? parseDBDate(form.date) : null}
                onChange={(d) => {
                  const clean = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                  const value = formatDate(clean);
                  setForm((p) => ({ ...p, date: value, time: "" }));
                }}
                dateFormat="MMM d, yyyy"
                className="border rounded px-2 py-1 w-full"
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

            {/* TIME SELECT */}
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>Time</label>
              <select name="time" value={form.time} onChange={handleChange}
                disabled={!form.date || !workingRange.length || isFullVacation}
                className={`border rounded px-2 py-1 w-full ${isFullVacation ? "bg-red-100" : ""}`}>
                <option value="">
                  {isFullVacation ? "Day Off — Vacation"
                    : workingRange.length ? "Select a time"
                    : "Not working this day"}
                </option>
                {!isFullVacation && workingRange
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

            {/* NOTES */}
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>Notes (optional)</label>
              <textarea name="notes" value={form.notes} onChange={handleChange}
                placeholder="Any special requests…"
                className="border rounded px-2 py-1 w-full" rows={2} />
            </div>

            <button type="submit" disabled={submitting || !form.date || !form.time}
              style={{ padding: "12px", borderRadius: 10,
                background: submitting || !form.date || !form.time ? "#d1fae5" : "#10b981",
                color: "white", fontWeight: 700, border: "none",
                cursor: submitting || !form.date || !form.time ? "not-allowed" : "pointer",
                fontSize: "0.95rem" }}>
              {submitting ? "Booking…" : "Confirm Appointment"}
            </button>
          </form>
        </div>
      )}

      {/* ── CANCEL VIEW ── */}
      {view === "cancel" && client && (
        <div>
          <button onClick={() => setView("home")}
            style={{ marginBottom: 16, fontSize: "0.82rem", color: "#10b981",
              fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            ← Back
          </button>

          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 14, color: "#111827" }}>
            Upcoming Appointments
          </h2>

          {upcomingAppts.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af",
              borderRadius: 12, border: "1px dashed #e5e7eb", fontSize: "0.88rem" }}>
              No upcoming appointments found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {upcomingAppts.map((appt) => {
                // Check if within 24 hours
                const [y, m, d] = appt.date.split("-").map(Number);
                const [h = 0, min = 0] = (appt.time || "00:00").slice(0, 5).split(":").map(Number);
                const apptMs = new Date(y, m - 1, d, h, min).getTime();
                const withinCutoff = apptMs - Date.now() < 24 * 60 * 60 * 1000;

                return (
                <div key={appt.id} style={{ padding: "14px 16px", borderRadius: 12,
                  border: "1px solid #e5e7eb", background: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827" }}>
                        {appt.pets?.name}
                      </div>
                      <div style={{ fontSize: "0.83rem", color: "#6b7280", marginTop: 2 }}>
                        {appt.date} &nbsp;·&nbsp; {fmtTime(appt.time)}
                      </div>
                      {appt.duration_min && (
                        <div style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                          {appt.duration_min} min
                        </div>
                      )}
                      {appt.services?.length > 0 && (
                        <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 4 }}>
                          {Array.isArray(appt.services) ? appt.services.join(", ") : appt.services}
                        </div>
                      )}
                    </div>

                    {withinCutoff ? (
                      <div style={{ fontSize: "0.72rem", color: "#92400e", background: "#fef3c7",
                        border: "1px solid #fcd34d", borderRadius: 8, padding: "6px 10px",
                        flexShrink: 0, textAlign: "center", maxWidth: 100, lineHeight: 1.4 }}>
                        Call to cancel
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCancel(appt.id)}
                        disabled={cancelling === appt.id}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fca5a5",
                          background: "#fef2f2", color: "#dc2626", fontWeight: 600,
                          fontSize: "0.78rem", cursor: "pointer", flexShrink: 0,
                          opacity: cancelling === appt.id ? 0.5 : 1 }}>
                        {cancelling === appt.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: "0.75rem", color: "#9ca3af", textAlign: "center" }}>
            Cancellations must be made at least 24 hours in advance.
            To reschedule, cancel here and book a new time.
          </p>
        </div>
      )}

    </main>
  );
}