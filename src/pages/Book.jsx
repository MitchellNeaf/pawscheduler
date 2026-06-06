import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Separate anon client — no auth session so groomer login doesn't interfere
const anonSupabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/* --------------------------------------------
   BOOKING PAGE THEMES
-------------------------------------------- */
const BOOKING_THEMES = {
  forest:   { grad: "linear-gradient(135deg, #059669 0%, #10b981 100%)", text: "#ffffff", accent: "#059669", addonBg: "#f0fdf4", addonBorder: "#86efac", addonText: "#166534" },
  ocean:    { grad: "linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)", text: "#ffffff", accent: "#0369a1", addonBg: "#eff6ff", addonBorder: "#bfdbfe", addonText: "#1e40af" },
  lavender: { grad: "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)", text: "#ffffff", accent: "#6d28d9", addonBg: "#f5f3ff", addonBorder: "#ddd6fe", addonText: "#5b21b6" },
  rose:     { grad: "linear-gradient(135deg, #be185d 0%, #f472b6 100%)", text: "#ffffff", accent: "#be185d", addonBg: "#fdf2f8", addonBorder: "#fbcfe8", addonText: "#9d174d" },
  sunrise:  { grad: "linear-gradient(135deg, #ea580c 0%, #fbbf24 100%)", text: "#ffffff", accent: "#ea580c", addonBg: "#fff7ed", addonBorder: "#fed7aa", addonText: "#c2410c" },
  slate:    { grad: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", text: "#ffffff", accent: "#334155", addonBg: "#f1f5f9", addonBorder: "#cbd5e1", addonText: "#334155" },
  blush:    { grad: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)", text: "#9d174d", accent: "#db2777", addonBg: "#fdf2f8", addonBorder: "#fbcfe8", addonText: "#9d174d" },
  mint:     { grad: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)", text: "#166534", accent: "#16a34a", addonBg: "#f0fdf4", addonBorder: "#86efac", addonText: "#166534" },
};
function getTheme(key) { return BOOKING_THEMES[key] || BOOKING_THEMES.forest; }

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

const calcAmount = (services, slotWeight, pricing, addonOptions = []) => {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) };
  const sz = slotWeight || 1;
  const addonNames = new Set((addonOptions || []).map(a => a.name));
  return services
    .filter((s) => s !== "Other" && !addonNames.has(s))
    .reduce((sum, svc) => {
      const row = p[svc];
      return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
    }, 0);
};

// Sum flat prices for selected add-ons
const calcAddons = (services, addonOptions) =>
  (addonOptions || [])
    .filter(a => services.includes(a.name))
    .reduce((sum, a) => sum + (a.price || 0), 0);

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
  const [serviceOptions, setServiceOptions] = useState(SERVICE_OPTIONS); // array of { name, description? } or string
  const [addonOptions, setAddonOptions] = useState([]); // array of { name, price, description? }

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
      const { data, error: gErr } = await anonSupabase
        .from("groomers")
        .select("id, full_name, slug, logo_url, max_parallel, service_pricing, custom_services, booking_requires_approval, bio, business_address, business_phone, brand_color")
        .eq("slug", slug)
        .single();

      if (!gErr && data && mounted) {
        setGroomer(data);
        setGroomerId(data.id);
        setMaxParallel(data.max_parallel ?? 1);
        if (data.custom_services && data.custom_services.length > 0) {
          setServiceOptions(data.custom_services);
          const pricingObj = Object.fromEntries(
            data.custom_services.map(s => [s.name, s.pricing])
          );
          setPricing({ ...DEFAULT_PRICING, ...pricingObj });
        } else if (data.service_pricing) {
          setPricing({ ...DEFAULT_PRICING, ...data.service_pricing });
        }

        // Fetch add-ons separately — column may not exist yet, non-blocking
        anonSupabase
          .from("groomers")
          .select("custom_addons")
          .eq("slug", slug)
          .single()
          .then(({ data: extras }) => {
            if (extras?.custom_addons?.length > 0 && mounted) {
              setAddonOptions(extras.custom_addons);
            }
          })
          .catch(() => {});
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
      const { data } = await anonSupabase
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
      const { data } = await anonSupabase
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
    const { data: vacs } = await anonSupabase
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
    const { data: hours } = await anonSupabase
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
    const { data: breaks } = await anonSupabase
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
    const { data: appts } = await anonSupabase
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

    const { data: matches } = await anonSupabase
      .from("clients")
      .select("*")
      .eq("groomer_id", groomerId)
      .ilike("full_name", `${firstName}%`)
      .like("phone", `%${last4}`);

    if (!matches?.length) return setError("Client not found.");

    const matchedClient = matches[0];
    setClient(matchedClient);

    const { data: petList } = await anonSupabase
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
      const { data, error: apptErr } = await anonSupabase
        .from("appointments")
        .select("id, date, time, duration_min, services, confirmed, waitlist, pets(name)")
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
      const autoAmount = calcAmount(newServices, selectedPetWeight, pricing, addonOptions);
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
    const autoAmount = calcAmount(form.services, slotWeight, pricing, addonOptions) + calcAddons(form.services, addonOptions);

    const { data: inserted, error } = await anonSupabase.from("appointments").insert([
      {
        groomer_id: groomerId,
        pet_id: selectedPetId,
        date: form.date,
        time: form.time,
        duration_min: Number(form.duration_min),
        services: form.services,
        confirmed: groomer?.booking_requires_approval ? false : false,
        no_show: false,
        amount: autoAmount > 0 ? autoAmount : null,
        paid: false,
        notes: form.notes || "",
        slot_weight: slotWeight,
        source: "booking_page",
      },
    ]).select("id");

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

      // SMS alert to groomer (fire-and-forget)
      fetch("/.netlify/functions/notifyGroomerSms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groomerId,
          petName: pets.find((p) => p.id === selectedPetId)?.name || "a pet",
          clientName: client?.full_name || "a client",
          date: form.date,
          time: form.time,
          requiresApproval: groomer?.booking_requires_approval || false,
        }),
      }).catch(() => {});

      // Push notification to groomer via backend (fire-and-forget)
      fetch("/.netlify/functions/sendPushNotification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groomerId,
          title: groomer?.booking_requires_approval ? "New Booking Request" : "New Booking",
          message: `${client?.full_name || "A client"} booked ${pets.find((p) => p.id === selectedPetId)?.name || "a pet"} on ${form.date}`,
          url: "https://app.pawscheduler.app/schedule",
        }),
      }).catch(() => {});

      const bookedPet = pets.find((p) => p.id === selectedPetId);

      setSubmitted({
        pet: bookedPet?.name || "",
        date: form.date,
        time: form.time,
        services: form.services,
        duration: form.duration_min,
        amount: autoAmount,
      });

      // Add to upcoming list immediately so cancel view shows it without refresh
      setUpcomingAppts((prev) => [...prev, {
        id: inserted?.[0]?.id || Date.now(),
        date: form.date,
        time: form.time,
        duration_min: Number(form.duration_min),
        services: form.services,
        pets: { name: bookedPet?.name || "" },
      }].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || "") < (b.time || "") ? -1 : 1));

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

    const { error } = await anonSupabase
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

  if (error === "Booking page not found.")
    return <main className="p-4 text-center text-red-600">Booking page not found.</main>;

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
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "0 0 40px" }}>

      {/* ── HERO HEADER ── */}
      {groomer && (() => {
        const theme = getTheme(groomer.brand_color);
        return (
          <div style={{
            background: theme.grad,
            padding: "32px 24px 28px",
            textAlign: "center",
            marginBottom: 0,
          }}>
            {groomer.logo_url && (
              <img src={groomer.logo_url} alt="Logo"
                style={{ width: 80, height: 80, borderRadius: "50%",
                  objectFit: "cover", margin: "0 auto 12px",
                  border: `3px solid ${theme.text === "#ffffff" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.15)"}` }} />
            )}
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: theme.text, letterSpacing: "-0.3px" }}>
              {groomer.full_name}
            </div>
            {groomer.business_address && (
              <div style={{ fontSize: "0.82rem", color: theme.text === "#ffffff" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.5)", marginTop: 4 }}>
                📍 {groomer.business_address.split(",").slice(-2).join(",").trim()}
              </div>
            )}
            {groomer.bio && (
              <div style={{
                fontSize: "0.87rem",
                color: theme.text === "#ffffff" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)",
                marginTop: 12, lineHeight: 1.6,
                maxWidth: 380, margin: "12px auto 0",
              }}>
                {groomer.bio}
              </div>
            )}
            {groomer.booking_requires_approval && (
              <div style={{
                marginTop: 12, display: "inline-block",
                background: "rgba(255,255,255,0.2)", borderRadius: 20,
                padding: "4px 12px", fontSize: "0.75rem", color: theme.text, fontWeight: 600,
              }}>
                ⏳ Appointments require approval
              </div>
            )}
          </div>
        );
      })()}

      {/* ── SERVICES & PRICING ── */}
      {(serviceOptions.length > 0 || addonOptions.length > 0) && view !== "book" && view !== "cancel" && (() => {
        const theme = getTheme(groomer?.brand_color);
        return (
        <div style={{ padding: "20px 16px 4px" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "#6b7280", marginBottom: 10 }}>
            Services & Pricing
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {serviceOptions.map((svc) => {
              const p = pricing[svc.name] || pricing[svc] || {};
              const name = typeof svc === "string" ? svc : svc.name;
              const desc = typeof svc === "object" ? svc.description : null;
              return (
                <div key={name} style={{
                  background: "white", border: "1px solid #e5e7eb",
                  borderRadius: 10, padding: "10px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#111827" }}>{name}</div>
                    {desc && <div style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: 2 }}>{desc}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {p[1] != null && <div style={{ fontSize: "0.75rem", color: "#374151" }}>S/M <strong style={{ color: theme.accent }}>${p[1]}</strong></div>}
                    {p[2] != null && <div style={{ fontSize: "0.75rem", color: "#374151" }}>L <strong style={{ color: theme.accent }}>${p[2]}</strong></div>}
                    {p[3] != null && <div style={{ fontSize: "0.75rem", color: "#374151" }}>XL <strong style={{ color: theme.accent }}>${p[3]}</strong></div>}
                  </div>
                </div>
              );
            })}
          </div>

          {addonOptions.length > 0 && (
            <>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "#6b7280", margin: "16px 0 8px" }}>
                Add-ons
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {addonOptions.map((a) => (
                  <div key={a.name} style={{
                    background: theme.addonBg, border: `1px solid ${theme.addonBorder}`,
                    borderRadius: 8, padding: "5px 10px",
                    fontSize: "0.78rem", color: theme.addonText, fontWeight: 600,
                  }}>
                    {a.name} — ${a.price}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* ── BOOKING SECTION ── */}
      <div style={{ padding: "16px 16px 0" }}>

      {/* ── LOGIN VIEW ── */}
      {view === "login" && (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: "20px 16px" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#111827" }}>Book an Appointment</div>
            <div style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: 4 }}>Enter your name and last 4 digits of your phone number</div>
          </div>
          <form onSubmit={handleClientLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              name="name" placeholder="First name"
              value={clientForm.name} onChange={handleChange}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: "0.9rem" }}
              required
            />
            <input
              name="last4" placeholder="Last 4 digits of phone"
              value={clientForm.last4} onChange={handleChange}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: "0.9rem" }}
              maxLength={4} inputMode="numeric" required
            />
            {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", textAlign: "center" }}>{error}</p>}
            <button type="submit"
              style={{ padding: "12px", borderRadius: 8,
                background: getTheme(groomer?.brand_color).accent, color: getTheme(groomer?.brand_color).text === "#ffffff" ? "white" : "#fff",
                fontWeight: 700, border: "none", cursor: "pointer", fontSize: "0.95rem" }}>
              Continue →
            </button>
          </form>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9ca3af", marginTop: 12 }}>
            New client? Contact us to get set up.
          </p>
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
              background: groomer?.booking_requires_approval ? "#fffbeb" : "#ecfdf5",
              border: `1px solid ${groomer?.booking_requires_approval ? "#fcd34d" : "#6ee7b7"}`,
              marginBottom: 4 }}>
              <div style={{ fontWeight: 700, color: groomer?.booking_requires_approval ? "#92400e" : "#065f46", marginBottom: 6 }}>
                {groomer?.booking_requires_approval ? "⏳ Request submitted!" : "✅ Appointment booked!"}
              </div>
              <div style={{ fontSize: "0.83rem", color: groomer?.booking_requires_approval ? "#78350f" : "#064e3b", lineHeight: 1.6 }}>
                {groomer?.booking_requires_approval && (
                  <div style={{ marginBottom: 6 }}>Your request is pending approval. You'll hear back soon.</div>
                )}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {serviceOptions.map((svc) => {
                  const name = typeof svc === "string" ? svc : svc.name;
                  const description = typeof svc === "string" ? null : svc.description;
                  const isChecked = form.services.includes(name);
                  return (
                    <label key={name} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px", borderRadius: 12,
                      border: `1.5px solid ${isChecked ? "#059669" : "#e5e7eb"}`,
                      background: isChecked ? "#f0fdf4" : "#fff",
                      cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                    }}>
                      <input type="checkbox" name="services" value={name}
                        checked={isChecked} onChange={handleChange}
                        style={{ marginTop: 2, flexShrink: 0, accentColor: "#059669" }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#111827" }}>{name}</div>
                        {description && (
                          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>{description}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ADD-ONS */}
            {addonOptions.length > 0 && (
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Add-ons
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {addonOptions.map((addon) => {
                    const isChecked = form.services.includes(addon.name);
                    return (
                      <label key={addon.name} style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "10px 12px", borderRadius: 12,
                        border: `1.5px solid ${isChecked ? "#7c3aed" : "#e5e7eb"}`,
                        background: isChecked ? "#f5f3ff" : "#fff",
                        cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                      }}>
                        <input type="checkbox" name="services" value={addon.name}
                          checked={isChecked} onChange={handleChange}
                          style={{ marginTop: 2, flexShrink: 0, accentColor: "#7c3aed" }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#111827" }}>{addon.name}</div>
                            {addon.price > 0 && (
                              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#7c3aed", flexShrink: 0 }}>
                                +${addon.price.toFixed(2)}
                              </div>
                            )}
                          </div>
                          {addon.description && (
                            <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>{addon.description}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PRICE + DURATION ESTIMATE */}
            {form.services.filter(s => s !== "Other").length > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: 10,
                background: "#ecfdf5", border: "1px solid #6ee7b7",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#065f46" }}>
                  ⏱ {form.duration_min} min &nbsp;·&nbsp; Estimated total
                </span>
                <span style={{ fontWeight: 800, color: "#065f46", fontSize: "1rem" }}>
                  ${(calcAmount(form.services, selectedPetWeight, pricing, addonOptions) + calcAddons(form.services, addonOptions)).toFixed(2)}
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
                const [y, m, d] = appt.date.split("-").map(Number);
                const [h = 0, min = 0] = (appt.time || "00:00").slice(0, 5).split(":").map(Number);
                const apptMs = new Date(y, m - 1, d, h, min).getTime();
                const withinCutoff = apptMs - Date.now() < 24 * 60 * 60 * 1000;
                const isWaitlisted = appt.waitlist;
                const isPending = !appt.confirmed && !appt.waitlist && appt.source === "booking_page";

                return (
                <div key={appt.id} style={{ padding: "14px 16px", borderRadius: 12,
                  border: `1px solid ${isWaitlisted ? "#bfdbfe" : isPending ? "#fcd34d" : "#e5e7eb"}`,
                  background: isWaitlisted ? "#eff6ff" : isPending ? "#fffbeb" : "white" }}>

                  {/* Status badge */}
                  {(isWaitlisted || isPending) && (
                    <div style={{
                      display: "inline-block",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      marginBottom: 8,
                      background: isWaitlisted ? "#dbeafe" : "#fef3c7",
                      color: isWaitlisted ? "#1e40af" : "#92400e",
                    }}>
                      {isWaitlisted ? "⏸ On Waitlist" : "⏳ Pending Approval"}
                    </div>
                  )}

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

      </div> {/* end booking section */}
    </main>
  );
}