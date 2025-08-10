
import { useState, useEffect } from "react";
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
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [takenTimes, setTakenTimes] = useState([]);
  const [upcomingAppts, setUpcomingAppts] = useState([]);

  // --- helpers ---
  const compareDateTimeDesc = (a, b) => {
    const da = new Date(`${a.date}T${(a.time || "00:00").slice(0,5)}`);
    const db = new Date(`${b.date}T${(b.time || "00:00").slice(0,5)}`);
    return db - da; // newest first
  };

  const fetchTakenTimes = async (date) => {
    if (!date) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("time, duration_min")
      .eq("date", date);

    if (error) {
      console.error("Error fetching appointments:", error);
      return;
    }

    const blocked = new Set();
    (data || []).forEach(({ time, duration_min }) => {
      const timeStr = time.slice(0, 5);
      const index = TIME_SLOTS.indexOf(timeStr);
      const blocks = Math.ceil((duration_min || 30) / 15);
      for (let i = 0; i < blocks; i++) blocked.add(TIME_SLOTS[index + i]);
    });
    setTakenTimes(Array.from(blocked));
  };

  // refresh taken times when date changes
  useEffect(() => {
    fetchTakenTimes(form.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  // auto duration based on services
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

    const firstName = clientForm.name.trim().toLowerCase();
    const last4 = clientForm.last4.trim();

    const { data: matches, error } = await supabase
      .from("clients")
      .select("*")
      .ilike("full_name", `${firstName}%`)
      .like("phone", `%${last4}`);

    if (error || !matches || matches.length === 0) {
      setError("Client not found. Please check your info or contact your groomer.");
      return;
    }

    const matchedClient = matches[0];
    setClient(matchedClient);

    const { data: petList } = await supabase
      .from("pets")
      .select("id, name")
      .eq("client_id", matchedClient.id);

    const list = petList || [];
    setPets(list);
    if (list.length === 1) setSelectedPetId(list[0].id);

    const { data: petAppointments } = await supabase
      .from("appointments")
      .select("pet_id, date, time, services")
      .in("pet_id", list.map((p) => p.id))
      .gte("date", new Date().toISOString().split("T")[0]);

    setUpcomingAppts((petAppointments || []).sort(compareDateTimeDesc));
  };

  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    if (name === "name" || name === "last4") {
      setClientForm((prev) => ({ ...prev, [name]: value }));
    } else if (name === "services") {
      setForm((prev) => ({
        ...prev,
        services: checked ? [...prev.services, value] : prev.services.filter((s) => s !== value),
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);

    if (!selectedPetId) {
      alert("Please select a pet.");
      setSubmitting(false);
      return;
    }

    // Insert and return the created row so we can push it into the list immediately
    const { data: inserted, error } = await supabase
      .from("appointments")
      .insert([
        {
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

    if (error) {
      alert("Error saving appointment: " + error.message);
    } else {
      setSuccess(true);

      // 1) Show the new appointment at the top
      if (inserted) {
        setUpcomingAppts((prev) => [inserted, ...(prev || [])].sort(compareDateTimeDesc));
      } else {
        // Fallback: optimistic object if backend didn’t return row
        const optimistic = {
          pet_id: selectedPetId,
          date: form.date,
          time: form.time,
          services: form.services,
        };
        setUpcomingAppts((prev) => [optimistic, ...(prev || [])].sort(compareDateTimeDesc));
      }

      // 2) Clear the form so they can book again (e.g., for another pet)
      setForm({ services: [], date: "", time: "", duration_min: "", notes: "" });

      // 3) Refresh the blocked times for the same date (if they pick that date again)
      await fetchTakenTimes(form.date);
    }

    setSubmitting(false);
  };

  return (
    <main className="max-w-xl">
      {!client ? (
        <form onSubmit={handleClientLogin} className="card">
          <div className="card-header">
            <h2 className="m-0">Book an Appointment</h2>
          </div>
          <div className="card-body space-y-3">
            <input
              placeholder="First name"
              name="name"
              value={clientForm.name}
              onChange={handleChange}
              required
            />
            <input
              placeholder="Last 4 digits of phone"
              name="last4"
              value={clientForm.last4}
              onChange={handleChange}
              required
            />
            <button type="submit" className="btn-primary w-full">
              Continue
            </button>
            {error && <p className="text-red-600">{error}</p>}
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="card">
            <div className="card-body">
              <h2 className="m-0">Welcome, {client.full_name}</h2>
              {success && <p className="text-green-600 mt-2">Appointment requested!</p>}
            </div>
          </div>

          {upcomingAppts.length > 0 && (
            <div className="card">
              <div className="card-body text-sm">
                <strong>Upcoming Appointments:</strong>
                <ul className="mt-2 !space-y-1">
                  {upcomingAppts.map((appt, i) => {
                    const petName = pets.find((p) => p.id === appt.pet_id)?.name || "(Unknown Pet)";
                    const time = appt.time ? appt.time.slice(0, 5) : "";
                    return (
                      <li key={i} className="!p-0 !border-0 !shadow-none !bg-transparent">
                        {petName} — {appt.date} at {time} (
                        {Array.isArray(appt.services) ? appt.services.join(", ") : appt.services})
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="card">
            <div className="card-body space-y-3">
              {pets.length > 1 && (
                <select value={selectedPetId} onChange={(e) => setSelectedPetId(e.target.value)}>
                  <option value="">Select a pet</option>
                  {pets.map((pet) => (
                    <option key={pet.id} value={pet.id}>
                      {pet.name}
                    </option>
                  ))}
                </select>
              )}

              {pets.length === 1 && (
                <div className="chip">
                  Pet: <strong className="ml-1">{pets[0].name}</strong>
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Services</label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_OPTIONS.map((service) => (
                    <label key={service} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="services"
                        value={service}
                        checked={form.services.includes(service)}
                        onChange={handleChange}
                      />
                      <span>{service}</span>
                    </label>
                  ))}
                </div>
              </div>

              {form.duration_min && (
                <div className="text-sm text-gray-600 italic">
                  Estimated time: {form.duration_min} minutes
                </div>
              )}

              <input type="date" name="date" value={form.date} onChange={handleChange} required />

              <select name="time" value={form.time} onChange={handleChange} required>
                <option value="">Select time</option>
                {TIME_SLOTS.filter((slot, idx) => {
                  const blocksNeeded = Math.ceil(Number(form.duration_min || 0) / 15);
                  if (blocksNeeded === 0) return false;
                  const slotBlock = TIME_SLOTS.slice(idx, idx + blocksNeeded);
                  return slotBlock.length === blocksNeeded && slotBlock.every((s) => !takenTimes.includes(s));
                }).map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>

              <textarea
                placeholder="Notes (optional)"
                name="notes"
                value={form.notes}
                onChange={handleChange}
              />

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? "Submitting..." : "Confirm Appointment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
