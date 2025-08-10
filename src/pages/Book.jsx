import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";

const TIME_SLOTS = [];
for (let hour = 6; hour <= 20; hour++) {
  for (let min of [0, 15, 30, 45]) {
    TIME_SLOTS.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
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
  const [submitting, setSubmitting] = useState(false);
  const [, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [takenTimes, setTakenTimes] = useState([]);
  const [, setUpcomingAppts] = useState([]);


  // Load groomer
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: gErr } = await supabase
        .from("groomers")
        .select("id,business_name,slug")
        .eq("slug", slug)
        .single();
      if (!gErr && data && mounted) {
        setGroomer(data);
        setGroomerId(data.id);
      } else if (gErr) {
        setError("Booking page not found.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const compareDateTimeDesc = (a, b) => {
    const da = new Date(`${a.date}T${(a.time || "00:00").slice(0, 5)}`);
    const db = new Date(`${b.date}T${(b.time || "00:00").slice(0, 5)}`);
    return db - da;
  };

  // ✅ useCallback so ESLint is happy
  const fetchTakenTimes = useCallback(async () => {
    if (!form.date || !groomerId) return;
    const { data, error: tErr } = await supabase
      .from("appointments")
      .select("time,duration_min")
      .eq("date", form.date)
      .eq("groomer_id", groomerId);
    if (tErr) return;

    const blocked = new Set();
    (data || []).forEach(({ time, duration_min }) => {
      const idx = TIME_SLOTS.indexOf(time.slice(0, 5));
      const blocks = Math.ceil((duration_min || 30) / 15);
      for (let i = 0; i < blocks; i++) blocked.add(TIME_SLOTS[idx + i]);
    });
    setTakenTimes(Array.from(blocked));
  }, [form.date, groomerId]);

  useEffect(() => {
    fetchTakenTimes();
  }, [fetchTakenTimes]);

  useEffect(() => {
    const s = form.services;
    if (s.length === 1 && s.includes("Nails")) {
      setForm((f) => ({ ...f, duration_min: "15" }));
    } else if (s.includes("Deshedding") || s.includes("Tick Treatment") || s.length >= 5) {
      setForm((f) => ({ ...f, duration_min: "60" }));
    } else if (s.includes("Wash") && s.includes("Cut")) {
      setForm((f) => ({ ...f, duration_min: "45" }));
    } else if (s.includes("Wash") || s.includes("Cut") || s.length >= 2) {
      setForm((f) => ({ ...f, duration_min: "30" }));
    }
  }, [form.services]);

  const handleClientLogin = async (e) => {
    e.preventDefault();
    setError("");
    setClient(null);
    setPets([]);
    if (!groomerId) return setError("Booking page not ready.");

    const firstName = clientForm.name.trim().toLowerCase();
    const last4 = clientForm.last4.trim();
    const { data: matches, error: cErr } = await supabase
      .from("clients")
      .select("*")
      .eq("groomer_id", groomerId)
      .ilike("full_name", `${firstName}%`)
      .like("phone", `%${last4}`);
    if (cErr || !matches?.length) return setError("Client not found.");

    const matchedClient = matches[0];
    setClient(matchedClient);
    const { data: petList } = await supabase
      .from("pets")
      .select("id,name")
      .eq("client_id", matchedClient.id)
      .eq("groomer_id", groomerId);
    setPets(petList || []);
    if (petList?.length === 1) setSelectedPetId(petList[0].id);

    const { data: petAppointments } = await supabase
      .from("appointments")
      .select("pet_id,date,time,services")
      .in("pet_id", (petList || []).map((p) => p.id))
      .gte("date", new Date().toISOString().split("T")[0])
      .eq("groomer_id", groomerId);
    setUpcomingAppts((petAppointments || []).sort(compareDateTimeDesc));
  };

  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    if (name === "name" || name === "last4") {
      setClientForm((prev) => ({ ...prev, [name]: value }));
    } else if (name === "services") {
      setForm((prev) => ({
        ...prev,
        services: checked
          ? [...prev.services, value]
          : prev.services.filter((s) => s !== value),
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    if (!selectedPetId) return alert("Please select a pet.");

    const { data: inserted, error: iErr } = await supabase
      .from("appointments")
      .insert([{
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
      }])
      .select("pet_id,date,time,services")
      .single();
    if (iErr) alert("Error: " + iErr.message);
    else {
      setSuccess(true);
      setUpcomingAppts((prev) => [inserted, ...(prev || [])].sort(compareDateTimeDesc));
      const sameDate = form.date;
      setForm({ services: [], date: "", time: "", duration_min: "", notes: "" });
      await fetchTakenTimes(sameDate);
    }
    setSubmitting(false);
  };

  if (!groomerId && !error) return <main>Loading booking page…</main>;

  return (
    <main className="max-w-xl">
      {groomer && <div className="mb-2">Booking for <strong>{groomer.business_name}</strong></div>}
      {error && !client ? (
        <div>{error}</div>
      ) : !client ? (
        <form onSubmit={handleClientLogin}>
          <input name="name" placeholder="First name" value={clientForm.name} onChange={handleChange} />
          <input name="last4" placeholder="Last 4 of phone" value={clientForm.last4} onChange={handleChange} />
          <button type="submit">Continue</button>
        </form>
      ) : (
        <form onSubmit={handleSubmit}>
          {pets.length > 1 && (
            <select value={selectedPetId} onChange={(e) => setSelectedPetId(e.target.value)}>
              <option value="">Select a pet</option>
              {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div>
            {SERVICE_OPTIONS.map((s) => (
              <label key={s}>
                <input type="checkbox" name="services" value={s} checked={form.services.includes(s)} onChange={handleChange} /> {s}
              </label>
            ))}
          </div>
          {form.duration_min && <div>Estimated time: {form.duration_min} minutes</div>}
          <input type="date" name="date" value={form.date} onChange={handleChange} />
          <select name="time" value={form.time} onChange={handleChange}>
            <option value="">Select time</option>
            {TIME_SLOTS.filter((slot, idx) => {
              const blocks = Math.ceil(Number(form.duration_min || 0) / 15);
              return (
                TIME_SLOTS.slice(idx, idx + blocks).length === blocks &&
                TIME_SLOTS.slice(idx, idx + blocks).every((s) => !takenTimes.includes(s))
              );
            }).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
          </select>
          <textarea name="notes" value={form.notes} onChange={handleChange} />
          <button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Confirm"}</button>
        </form>
      )}
    </main>
  );
}
