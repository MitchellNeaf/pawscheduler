import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const TIME_SLOTS = [];
for (let hour = 6; hour <= 20; hour++) {
  for (let min of [0, 15, 30, 45]) {
    TIME_SLOTS.push(
      `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`
    );
  }
}

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

// Format date → YYYY-MM-DD
const formatDate = (d) => {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export default function BookPage() {
  const { slug } = useParams();
  const [groomer, setGroomer] = useState(null);
  const [groomerId, setGroomerId] = useState(null);

  const [clientForm, setClientForm] = useState({ name: "", last4: "" });
  const [client, setClient] = useState(null);

  const [pets, setPets] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState("");

  const [form, setForm] = useState({
    services: [],
    date: "",
    time: "",
    duration_min: "",
    notes: "",
  });

  const [unavailable, setUnavailable] = useState([]);
  const [workingRange, setWorkingRange] = useState([]);
  const [vacationBlocks, setVacationBlocks] = useState([]);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setUpcomingAppts] = useState([]);

  const [submitted, setSubmitted] = useState(null);

  // NEW: vacation dates for calendar highlighting
  const [vacationDates, setVacationDates] = useState([]);
  // NEW: weekdays (0–6) where groomer normally works
  const [workingWeekdays, setWorkingWeekdays] = useState([]);

  // ---------------- LOAD GROOMER ----------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: gErr } = await supabase
        .from("groomers")
        .select("id, full_name, slug, logo_url")
        .eq("slug", slug)
        .single();

      if (!gErr && data && mounted) {
        setGroomer(data);
        setGroomerId(data.id);
      } else {
        setError("Booking page not found.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [slug]);

  // ---------------- LOAD ALL VACATION DAYS (for calendar) ----------------
  useEffect(() => {
    if (!groomerId) return;

    (async () => {
      const { data } = await supabase
        .from("vacation_days")
        .select("date")
        .eq("groomer_id", groomerId);

      if (data) {
        setVacationDates(data.map((v) => v.date));
      }
    })();
  }, [groomerId]);

  // ---------------- LOAD WORKING WEEKDAYS (for closed day shading) ----------------
  useEffect(() => {
    if (!groomerId) return;

    (async () => {
      const { data } = await supabase
        .from("working_hours")
        .select("weekday")
        .eq("groomer_id", groomerId);

      if (data) {
        const days = Array.from(new Set(data.map((h) => h.weekday)));
        setWorkingWeekdays(days);
      }
    })();
  }, [groomerId]);

  const compareDateTimeDesc = (a, b) => {
    const da = new Date(`${a.date}T${(a.time || "00:00").slice(0, 5)}`);
    const db = new Date(`${b.date}T${(b.time || "00:00").slice(0, 5)}`);
    return db - da;
  };

  // ---------------- VACATIONS + SCHEDULE FOR DATE ----------------
  const fetchTakenTimes = useCallback(async () => {
    if (!form.date || !groomerId) return;

    const [y, m, d] = form.date.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();

    // --- VACATIONS FOR THIS DATE ---
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
        return { type: "partial", start: v.start_time, end: v.end_time };
      });
    }
    setVacationBlocks(vacationInfo);

    if (vacationInfo.some((v) => v.type === "full")) {
      setWorkingRange([]);
      setUnavailable([...TIME_SLOTS]);
      return;
    }

    // --- Working hours ---
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

    // --- Breaks ---
    const { data: breaks } = await supabase
      .from("working_breaks")
      .select("*")
      .eq("groomer_id", groomerId)
      .eq("weekday", weekday);

    const breakBlocked = new Set();
    (breaks || []).forEach((b) => {
      const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
      const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
      if (bi === -1 || ei === -1) return;
      TIME_SLOTS.slice(bi, ei + 1).forEach((slot) => breakBlocked.add(slot));
    });

    // --- Existing appointments ---
    const { data: appts } = await supabase
      .from("appointments")
      .select("time, duration_min")
      .eq("date", form.date)
      .eq("groomer_id", groomerId);

    const apptBlocked = new Set();
    (appts || []).forEach(({ time, duration_min }) => {
      if (!time) return;
      const t = time.slice(0, 5);
      const idx = TIME_SLOTS.indexOf(t);
      if (idx === -1) return;
      const blocks = Math.ceil((duration_min || 30) / 15);
      for (let i = 0; i < blocks; i++) {
        apptBlocked.add(TIME_SLOTS[idx + i]);
      }
    });

    // --- Partial vacation ---
    const vacationPartial = new Set();
    vacationInfo.forEach((vac) => {
      if (vac.type === "partial") {
        const bi = TIME_SLOTS.indexOf(vac.start.slice(0, 5));
        const ei = TIME_SLOTS.indexOf(vac.end.slice(0, 5));
        if (bi === -1 || ei === -1) return;
        TIME_SLOTS.slice(bi, ei + 1).forEach((s) => vacationPartial.add(s));
      }
    });

    const allUnavailable = new Set([
      ...breakBlocked,
      ...apptBlocked,
      ...vacationPartial,
    ]);

    // block past same-day times
    const today = new Date().toLocaleDateString("en-CA");
    if (form.date === today) {
      const now = new Date();
      TIME_SLOTS.forEach((slot) => {
        const [h, m] = slot.split(":");
        const slotDate = new Date();
        slotDate.setHours(h, m, 0, 0);
        if (slotDate <= now) allUnavailable.add(slot);
      });
    }

    setUnavailable(Array.from(allUnavailable));
  }, [form.date, groomerId]);

  useEffect(() => {
    fetchTakenTimes();
  }, [fetchTakenTimes]);

  // ---------------- AUTO-DURATION ----------------
  useEffect(() => {
    const s = form.services;

    if (s.length === 1 && s.includes("Nails"))
      return setForm((f) => ({ ...f, duration_min: "15" }));

    if (
      s.includes("Deshedding") ||
      s.includes("Tick Treatment") ||
      s.length >= 5
    )
      return setForm((f) => ({ ...f, duration_min: "60" }));

    if (s.includes("Wash") && s.includes("Cut"))
      return setForm((f) => ({ ...f, duration_min: "45" }));

    if (s.includes("Wash") || s.includes("Cut") || s.length >= 2)
      return setForm((f) => ({ ...f, duration_min: "30" }));
  }, [form.services]);

  // ---------------- AUTO-SELECT EARLIEST AVAILABLE TIME ----------------
  useEffect(() => {
    if (!form.date || !workingRange.length || !form.duration_min) return;
    if (form.time) return; // don't override manual choice

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


  // ---------------- CLIENT MINI-LOGIN ----------------
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
      .select("id, name")
      .eq("client_id", matchedClient.id)
      .eq("groomer_id", groomerId);

    setPets(petList || []);
    if (petList?.length === 1) setSelectedPetId(petList[0].id);

    const { data: future } = await supabase
      .from("appointments")
      .select("pet_id, date, time, services")
      .in("pet_id", (petList || []).map((p) => p.id))
      .gte("date", new Date().toLocaleDateString("en-CA"))
      .eq("groomer_id", groomerId);

    setUpcomingAppts((prev) => future?.sort(compareDateTimeDesc));
  };

  // ---------------- FORM CHANGE HANDLER ----------------
  const handleChange = (e) => {
    const { name, value, checked } = e.target;

    if (name === "name" || name === "last4") {
      return setClientForm((p) => ({ ...p, [name]: value }));
    }

    if (name === "services") {
      return setForm((p) => ({
        ...p,
        services: checked
          ? [...p.services, value]
          : p.services.filter((s) => s !== value),
      }));
    }

    if (name === "date") {
      setForm((p) => ({ ...p, date: value, time: "" }));
      return;
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  // ---------------- SUBMIT BOOKING ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    if (!selectedPetId) {
      alert("Please select a pet.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .insert([
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
          notes: form.notes || `Self-booked by ${client.full_name}`,
        },
      ])
      .select("pet_id, date, time, services")
      .single();

    if (error) alert(error.message);
    else {
      setSubmitted({
        pet: pets.find((p) => p.id === selectedPetId)?.name || "",
        date: form.date,
        time: form.time,
        services: form.services,
        duration: form.duration_min,
      });

      setForm({
        services: [],
        date: "",
        time: "",
        duration_min: "",
        notes: "",
      });
    }

    setSubmitting(false);
  };

  // ---------------- RENDER ----------------
  if (error)
    return <main className="p-4 text-center text-red-600">{error}</main>;

  if (!groomerId)
    return <main className="p-4 text-center">Loading booking page…</main>;

  const isFullVacation =
    vacationBlocks.some((v) => v.type === "full") && form.date;

  return (
    <main className="max-w-xl p-4">
      {/* GROOMER HEADER */}
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

      {/* SUCCESS MESSAGE */}
      {submitted && (
        <div className="bg-green-100 border border-green-300 text-green-800 p-4 rounded-md mb-6">
          <h2 className="text-lg font-semibold mb-1">Appointment Confirmed!</h2>
          <p className="text-sm mb-3">
            Your appointment has been successfully booked.
          </p>

          <div className="text-sm space-y-1">
            <div>
              <strong>Pet:</strong> {submitted.pet}
            </div>
            <div>
              <strong>Date:</strong> {submitted.date}
            </div>
            <div>
              <strong>Time:</strong> {submitted.time}
            </div>
            <div>
              <strong>Services:</strong> {submitted.services.join(", ")}
            </div>
            <div>
              <strong>Duration:</strong> {submitted.duration} minutes
            </div>
          </div>

          <button
            onClick={() => setSubmitted(null)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md"
          >
            Book Another Appointment
          </button>
        </div>
      )}

      {/* CLIENT LOGIN */}
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
          {pets.length > 1 && (
            <select
              value={selectedPetId}
              onChange={(e) => setSelectedPetId(e.target.value)}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Select a pet</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
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

          {form.duration_min && (
            <div>Estimated time: {form.duration_min} minutes</div>
          )}

          {/* DATE PICKER WITH VACATION + CLOSED DAY STYLING */}
          <div className="w-full">
            <DatePicker
              selected={form.date ? new Date(form.date) : null}
              onChange={(d) => {
                const value = formatDate(d);
                setForm((p) => ({ ...p, date: value, time: "" }));
              }}
              dateFormat="yyyy-MM-dd"
              className="border rounded px-2 py-1 w-full"
              placeholderText="Select date"
              // Disable CLOSED days (no working_hours)
              filterDate={(d) => {
                if (!workingWeekdays.length) return true; // until loaded
                const weekday = d.getDay();
                return workingWeekdays.includes(weekday);
              }}
              // Styling for vacation + closed days
              dayClassName={(d) => {
                const f = formatDate(d);
                if (vacationDates.includes(f)) {
                  return "bg-red-300 text-white";
                }
                if (
                  workingWeekdays.length &&
                  !workingWeekdays.includes(d.getDay())
                ) {
                  return "bg-gray-200 text-gray-400";
                }
                return "";
              }}
              // Tooltips
              renderDayContents={(day, date) => {
                const f = formatDate(date);
                let title = "";
                if (vacationDates.includes(f)) {
                  title = "Groomer is on vacation or partially unavailable";
                } else if (
                  workingWeekdays.length &&
                  !workingWeekdays.includes(date.getDay())
                ) {
                  title = "Groomer does not work this day";
                }
                return (
                  <span title={title || undefined}>
                    {day}
                  </span>
                );
              }}
            />
          </div>

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
                  const blocks = Math.ceil(
                    Number(form.duration_min || 0) / 15
                  );
                  const windowSlots = workingRange.slice(idx, idx + blocks);
                  if (windowSlots.length < blocks) return false;
                  if (windowSlots.some((s) => unavailable.includes(s)))
                    return false;
                  return true;
                })
                .map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
          </select>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Notes"
            className="border rounded px-2 py-1 w-full"
          />

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
