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
   SERVICE OPTIONS
-------------------------------------------- */
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

  const [clientForm, setClientForm] = useState({ name: "", last4: "" });
  const [client, setClient] = useState(null);

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
        .select("id, full_name, slug, logo_url, max_parallel")
        .eq("slug", slug)
        .single();

      if (!gErr && data && mounted) {
        setGroomer(data);
        setGroomerId(data.id);
        setMaxParallel(data.max_parallel ?? 1);
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

    if (s.length === 1 && s.includes("Nails"))
      return setForm((f) => ({ ...f, duration_min: "15" }));

    if (
      s.includes("Deshedding") ||
      s.includes("Tick Treatment") ||
      s.length >= 5
    ) {
      return setForm((f) => ({ ...f, duration_min: "60" }));
    }

    if (s.includes("Wash") && s.includes("Cut"))
      return setForm((f) => ({ ...f, duration_min: "45" }));

    if (s.includes("Wash") || s.includes("Cut") || s.length >= 2)
      return setForm((f) => ({ ...f, duration_min: "30" }));

    return setForm((f) => ({ ...f, duration_min: "45" }));
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
      return setForm((p) => ({
        ...p,
        services: checked ? [...p.services, value] : p.services.filter((s) => s !== value),
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
        amount: null,
        paid: false,
        notes: form.notes || "",
        slot_weight: slotWeight,
      },
    ]);

    if (error) alert(error.message);
    else {
      setSubmitted({
        pet: pets.find((p) => p.id === selectedPetId)?.name || "",
        date: form.date,
        time: form.time,
        services: form.services,
        duration: form.duration_min,
      });
    }

    setSubmitting(false);
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

  return (
    <main className="max-w-xl p-4">

      {/* HEADER */}
      {groomer && (
        <div className="text-center mb-4">
          {groomer.logo_url && (
            <img
              src={groomer.logo_url}
              alt="Logo"
              className="w-20 h-20 rounded-full object-cover mx-auto mb-2"
            />
          )}
          <div className="text-lg font-bold">{groomer.full_name}</div>
        </div>
      )}

      {/* SUCCESS */}
      {submitted && (
        <div className="bg-green-100 border border-green-300 text-green-800 p-4 rounded-md mb-6">
          <h2 className="text-lg font-semibold mb-1">Appointment Confirmed!</h2>

          <p className="text-sm mb-3">Your appointment has been successfully booked.</p>

          <div className="text-sm space-y-1">
            <div><strong>Pet:</strong> {submitted.pet}</div>
            <div><strong>Date:</strong> {submitted.date}</div>
            <div><strong>Time:</strong> {submitted.time}</div>
            <div><strong>Services:</strong> {submitted.services.join(", ")}</div>
            <div><strong>Duration:</strong> {submitted.duration} minutes</div>
          </div>

          <button
            onClick={() => setSubmitted(null)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md"
          >
            Book Another Appointment
          </button>
        </div>
      )}

      {/* LOGIN */}
      {!submitted && !client ? (
        <form onSubmit={handleClientLogin} className="space-y-2 text-center">
          <input
            name="name"
            placeholder="First name"
            value={clientForm.name}
            onChange={handleChange}
            className="border rounded px-2 py-1 w-full"
          />
          <input
            name="last4"
            placeholder="Last 4 of phone"
            value={clientForm.last4}
            onChange={handleChange}
            className="border rounded px-2 py-1 w-full"
          />
          <button
            type="submit"
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
          >
            Continue
          </button>
        </form>
      ) : null}

      {/* BOOKING FORM */}
      {!submitted && client && (
        <form onSubmit={handleSubmit} className="space-y-3 mt-4">

          {/* PET SELECT */}
          {pets.length > 1 && (
            <select
              value={selectedPetId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedPetId(id);

                const p = pets.find((pet) => pet.id === id);

                setSelectedPetWeight(p?.slot_weight ?? 1);
                setForm((prev) => ({ ...prev, time: "" }));
              }}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Select a pet</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* SERVICES */}
          <div>
            {SERVICE_OPTIONS.map((s) => (
              <label key={s} className="block">
                <input
                  type="checkbox"
                  name="services"
                  value={s}
                  checked={form.services.includes(s)}
                  onChange={handleChange}
                />{" "}
                {s}
              </label>
            ))}
          </div>

          {form.duration_min && <div>Estimated time: {form.duration_min} minutes</div>}

          {/* DATE PICKER — FIXED */}
          <DatePicker
            selected={form.date ? parseDBDate(form.date) : null}
            onChange={(d) => {
              const clean = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
              const value = formatDate(clean);
              setForm((p) => ({ ...p, date: value, time: "" }));
            }}
            dateFormat="yyyy-MM-dd"
            className="border rounded px-2 py-1 w-full"
            placeholderText="Select date"
            filterDate={(d) => {
              if (!workingWeekdays.length) return true;
              const utcEquivalent = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
              return workingWeekdays.includes(utcEquivalent.getUTCDay());
            }}
            dayClassName={(d) => {
              const clean = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
              const f = formatDate(clean);

              if (vacationDates.includes(f)) return "bg-red-300 text-white";
              const weekday = clean.getUTCDay();
              if (!workingWeekdays.includes(weekday))
                return "bg-gray-200 text-gray-400";

              return "";
            }}
          />

          {/* TIME SELECT */}
          <select
            name="time"
            value={form.time}
            onChange={handleChange}
            disabled={!form.date || !workingRange.length || isFullVacation}
            className={`border rounded px-2 py-1 w-full ${
              isFullVacation ? "bg-red-100" : ""
            }`}
          >
            <option value="">
              {isFullVacation
                ? "Day Off — Vacation"
                : workingRange.length
                ? "Select time"
                : "Groomer not working this day"}
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
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
          </select>

          {/* NOTES */}
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Notes"
            className="border rounded px-2 py-1 w-full"
          />

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600 text-white rounded"
          >
            {submitting ? "Submitting..." : "Confirm"}
          </button>
        </form>
      )}
    </main>
  );
}
