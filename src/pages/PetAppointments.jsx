import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";

const toYMD = (d) => d.toLocaleDateString("en-CA"); // local YYYY-MM-DD
const START_HOUR = 6;
const END_HOUR = 21;

const TIME_SLOTS = [];
for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
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

export default function PetAppointments() {
  const { petId } = useParams();
  const [user, setUser] = useState(null);
  const [pet, setPet] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState({
    date: "",
    time: "",
    duration_min: 15,
    services: [],
    notes: "",
    amount: "",
  });
  const [otherService, setOtherService] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [takenTimes, setTakenTimes] = useState([]);
  const [override, setOverride] = useState(false);
  const [searchParams] = useSearchParams();
  const editIdFromURL = searchParams.get("edit");
  const cloneIdFromURL = searchParams.get("clone");
  const autoShift = searchParams.get("autoShift") === "true";

  // ✅ Get logged-in groomer once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ✅ Load only this groomer’s pet + appointments
      const { data: petData } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .eq("groomer_id", user.id)
        .single();

      if (!petData) {
        setPet(null);
        setAppointments([]);
        setLoading(false);
        return;
      }

      const { data: apptData } = await supabase
        .from("appointments")
        .select("*")
        .eq("pet_id", petId)
        .eq("groomer_id", user.id)
        .order("created_at", { ascending: false });

      setPet(petData);
      setAppointments(apptData || []);
      setLoading(false);

      // Handle cloning/edit from URL
      if (cloneIdFromURL && apptData) {
        const toClone = apptData.find((a) => a.id === cloneIdFromURL);
        if (toClone) {
          const parsedServices = Array.isArray(toClone.services)
            ? toClone.services
            : typeof toClone.services === "string"
            ? toClone.services.split(",").map((s) => s.trim())
            : [];

          let newDate = toClone.date;
          if (autoShift) {
            const d = new Date(toClone.date);
            d.setDate(d.getDate() + 28);
            newDate = toYMD(d);
          }

          setForm({
            date: newDate,
            time: toClone.time?.slice(0, 5) || "",
            duration_min: String(toClone.duration_min || 15),
            services: parsedServices,
            notes: toClone.notes || "",
            amount: toClone.amount || "",
          });

          setOtherService("");
          setEditingId(null);
          setOverride(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }

      if (editIdFromURL && apptData) {
        const toEdit = apptData.find((a) => a.id === editIdFromURL);
        if (toEdit) handleEdit(toEdit);
      }
    };

    loadData();
  }, [petId, cloneIdFromURL, editIdFromURL, autoShift]);

  const handleEdit = (appt) => {
    const parsedServices = Array.isArray(appt.services)
      ? appt.services
      : typeof appt.services === "string"
      ? appt.services.split(",").map((s) => s.trim())
      : [];

    setForm({
      date: appt.date,
      time: appt.time?.slice(0, 5) || "",
      duration_min: String(appt.duration_min || 15),
      services: parsedServices,
      notes: appt.notes || "",
      amount: appt.amount || "",
    });

    setOtherService("");
    setEditingId(appt.id);
    setOverride(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const fetchTakenTimes = async () => {
      if (!form.date || !user) return;

      const { data, error } = await supabase
        .from("appointments")
        .select("id, time, pet_id, duration_min")
        .eq("date", form.date)
        .eq("groomer_id", user.id);

      if (error) {
        console.error("Failed to fetch booked times", error.message);
        return;
      }

      const blockedTimes = data
        .filter((a) => a.id !== editingId)
        .flatMap((a) => {
          const base = a.time?.slice(0, 5);
          const dur = a.duration_min || 15;
          const count = dur / 15;
          const [hh, mm] = base.split(":").map(Number);
          return Array.from({ length: count }, (_, i) => {
            const totalMinutes = hh * 60 + mm + i * 15;
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          });
        });

      setTakenTimes(blockedTimes);
    };

    fetchTakenTimes();
  }, [form.date, editingId, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "time" && takenTimes.includes(value)) {
      const ok = window.confirm(`${value} is already booked. Do you want to override and double-book?`);
      if (!ok) {
        setForm((prev) => ({ ...prev, time: "" }));
        setOverride(false);
        return;
      } else {
        setOverride(true);
      }
    }

    setForm({ ...form, [name]: value });
  };

  const toggleService = (service) => {
    if (service === "Other") return;
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    const finalServices = otherService
      ? [...form.services.filter((s) => s !== "Other"), otherService]
      : form.services;

    const payload = {
      groomer_id: user.id, // ✅ attach groomer
      pet_id: petId,
      date: form.date,
      time: form.time,
      services: finalServices,
      notes: form.notes,
      duration_min: Number(form.duration_min),
      amount: form.amount ? parseFloat(form.amount) : null,
    };

    let result;
    if (editingId) {
      result = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", editingId)
        .eq("groomer_id", user.id)
        .select()
        .single();
    } else {
      result = await supabase.from("appointments").insert([payload]).select().single();
    }

    const { data, error } = result;
    if (error) {
      console.error("Supabase error:", error.message);
      return;
    }

    if (editingId) {
      setAppointments((prev) => prev.map((a) => (a.id === editingId ? data : a)));
    } else {
      setAppointments((prev) => [data, ...prev]);
    }

    setForm({ date: "", time: "", services: [], notes: "", duration_min: 15, amount: "" });
    setOtherService("");
    setEditingId(null);
    setOverride(false);
  };

  const handleDelete = async (id) => {
    if (!user) return;
    const confirmDelete = window.confirm("Delete this appointment?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    if (!error) {
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleRebook = async (date, time) => {
    const original = new Date(`${date}T${time}`);
    const newDate = new Date(original);
    newDate.setDate(original.getDate() + 28);
    setForm((prev) => ({ ...prev, date: toYMD(newDate) }));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return newDate.toISOString().slice(0, 10);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <Link to={`/clients/${pet?.client_id}`} className="text-blue-600 underline">
        &larr; Back to Pets
      </Link>
      <h1 className="text-xl font-bold mt-2 mb-4">Appointments for {pet?.name}</h1>

      <form onSubmit={handleAddOrUpdate} className="space-y-3 mb-6">
        <input type="date" name="date" value={form.date} onChange={handleChange} required className="border p-2 w-full rounded" />
        <select name="time" value={form.time} onChange={handleChange} className="border p-2 w-full rounded" required>
          <option value="">Select time</option>
          {TIME_SLOTS.map((slot) => (
            <option key={slot} value={slot} disabled={!override && takenTimes.includes(slot)}>
              {takenTimes.includes(slot) && !override ? `⛔ ${slot} (Booked)` : slot}
            </option>
          ))}
        </select>

        <select name="duration_min" value={form.duration_min} onChange={handleChange} className="border p-2 w-full rounded" required>
          {[15, 30, 45, 60].map((min) => (
            <option key={min} value={min}>
              {min} minutes
            </option>
          ))}
        </select>

        <div>
          <label className="font-medium block mb-1">Services</label>
          <div className="grid grid-cols-2 gap-1">
            {SERVICE_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" checked={form.services.includes(s)} onChange={() => toggleService(s)} />
                {s}
              </label>
            ))}
          </div>
          {form.services.includes("Other") && (
            <input
              type="text"
              value={otherService}
              onChange={(e) => setOtherService(e.target.value)}
              placeholder="Enter other service..."
              className="mt-2 border p-2 w-full rounded"
            />
          )}
        </div>

        <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes" className="border p-2 w-full rounded" />
        <input type="number" name="amount" value={form.amount} onChange={handleChange} placeholder="Amount (e.g. 45.00)" step="0.01" min="0" className="border p-2 w-full rounded" />

        <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded">
          {editingId ? "Update Appointment" : "Add Appointment"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => {
              setForm({ date: "", time: "", services: [], notes: "", duration_min: 15, amount: "" });
              setEditingId(null);
              setOtherService("");
              setOverride(false);
            }}
            className="ml-4 text-gray-600 underline"
          >
            Cancel Edit
          </button>
        )}
      </form>

      <ul className="space-y-3">
        {appointments.length === 0 ? (
          <p className="text-gray-600">No appointments yet.</p>
        ) : (
          appointments.map((appt) => (
            <li key={appt.id} className="border p-3 rounded">
              <div className="font-semibold">
                {appt.date} at {appt.time?.slice(0, 5)}
              </div>
              {appt.services?.length > 0 && (
                <div className="text-sm text-gray-700 mt-1">
                  Services: {Array.isArray(appt.services) ? appt.services.join(", ") : appt.services}
                </div>
              )}
              {appt.notes && <div className="text-sm text-gray-600 mt-1">{appt.notes}</div>}
              {appt.amount && (
                <div className="text-sm text-gray-700 mt-1">💵 Amount: ${appt.amount.toFixed(2)}</div>
              )}

              <div className="mt-2 flex gap-4 text-sm">
                <button onClick={() => handleRebook(appt.date, appt.time)} className="text-emerald-600 underline">
                  🔁 Rebook 4 weeks
                </button>
                <button onClick={() => handleEdit(appt)} className="text-blue-600 underline">
                  ✏️ Edit
                </button>
                <button onClick={() => handleDelete(appt.id)} className="text-red-600 underline">
                  🗑 Delete
                </button>
              </div>

              <div className="flex items-center gap-6 mt-2 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={appt.confirmed || false}
                    onChange={async () => {
                      const { data, error } = await supabase
                        .from("appointments")
                        .update({ confirmed: !appt.confirmed })
                        .eq("id", appt.id)
                        .eq("groomer_id", user.id)
                        .select()
                        .single();
                      if (!error) {
                        setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data : a)));
                      }
                    }}
                  />
                  Confirmed
                </label>

                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={appt.no_show || false}
                    onChange={async () => {
                      const { data, error } = await supabase
                        .from("appointments")
                        .update({ no_show: !appt.no_show })
                        .eq("id", appt.id)
                        .eq("groomer_id", user.id)
                        .select()
                        .single();
                      if (!error) {
                        setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data : a)));
                      }
                    }}
                  />
                  No-Show
                </label>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
