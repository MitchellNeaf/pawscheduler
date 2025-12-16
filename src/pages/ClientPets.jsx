import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const TAG_OPTIONS = [
  "Bites",
  "Anxious",
  "Senior",
  "Aggressive",
  "Matting",
  "Arthritis",
  "Blind",
  "Deaf",
  "Allergies",
  "Other",
];

export default function ClientPets() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [pets, setPets] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingClient, setSavingClient] = useState(false);

  // Vaccine form state
  const [addShotPet, setAddShotPet] = useState(null);
  const [shotForm, setShotForm] = useState({
    shot_type: "Rabies",
    date_given: "",
    date_unknown: false,
    date_expires: "",
    notes: "",
  });

  // Pet form (includes slot_weight)
  const [form, setForm] = useState({
    name: "",
    breed: "",
    notes: "",
    tags: [],
    slot_weight: 1,
  });

  const [otherTag, setOtherTag] = useState("");
  const [editingId, setEditingId] = useState(null);

  // Load logged-in user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Load client + pets (with shot records)
  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientData } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("groomer_id", user.id)
        .single();

      const { data: petData } = await supabase
        .from("pets")
        .select("*, pet_shot_records(*)")
        .eq("client_id", clientId)
        .eq("groomer_id", user.id)
        .order("created_at", { ascending: false });

      setClient(clientData);
      setPets(petData || []);
      setLoading(false);
    };

    loadData();
  }, [clientId]);

  const reloadPets = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: petData } = await supabase
      .from("pets")
      .select("*, pet_shot_records(*)")
      .eq("client_id", clientId)
      .eq("groomer_id", user.id)
      .order("created_at", { ascending: false });

    setPets(petData || []);
  };

  const handleFormChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const toggleTag = (tag) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const resetForm = () => {
    setForm({
      name: "",
      breed: "",
      notes: "",
      tags: [],
      slot_weight: 1,
    });
    setOtherTag("");
    setEditingId(null);
  };

  // Add or update pet
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    const finalTags = otherTag
      ? [...form.tags.filter((t) => t !== "Other"), otherTag]
      : form.tags;

    if (editingId) {
      const { data, error } = await supabase
        .from("pets")
        .update({
          name: form.name,
          breed: form.breed,
          notes: form.notes,
          tags: finalTags,
          slot_weight: form.slot_weight,
        })
        .eq("id", editingId)
        .eq("groomer_id", user.id)
        .select()
        .single();

      if (!error) {
        setPets((prev) => prev.map((p) => (p.id === editingId ? data : p)));
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from("pets")
        .insert([
          {
            client_id: clientId,
            groomer_id: user.id,
            name: form.name,
            breed: form.breed,
            notes: form.notes,
            tags: finalTags,
            slot_weight: form.slot_weight,
          },
        ])
        .select()
        .single();

      if (!error && data) {
        setPets((prev) => [data, ...prev]);
        resetForm();
      }
    }
  };

  // Edit pet
  const handleEdit = (pet) => {
    setForm({
      name: pet.name || "",
      breed: pet.breed || "",
      notes: pet.notes || "",
      tags: pet.tags?.includes("Other")
        ? [...pet.tags, "Other"]
        : pet.tags || [],
      slot_weight: pet.slot_weight ?? 1,
    });

    if (pet.tags?.some((t) => !TAG_OPTIONS.includes(t))) {
      setOtherTag(pet.tags.find((t) => !TAG_OPTIONS.includes(t)) || "");
    } else {
      setOtherTag("");
    }

    setEditingId(pet.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Delete pet
  const handleDelete = async (id) => {
    if (!user) return;
    if (!window.confirm("Delete this pet?")) return;

    const { error } = await supabase
      .from("pets")
      .delete()
      .eq("id", id)
      .eq("groomer_id", user.id);

    if (!error) {
      setPets((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) resetForm();
    }
  };

  if (loading) return <main className="px-4 py-6">Loading...</main>;
  if (!client) return <main className="px-4 py-6">Client not found</main>;

  return (
    <main>
      <div className="mb-2">
        <Link to="/">&larr; Back to Clients</Link>
      </div>

      <h1 className="mt-2">{client.full_name}'s Pets</h1>

      {/* CLIENT ADDRESS */}
      <div className="card mb-6">
        <div className="card-body space-y-3">
          <h2 className="font-semibold text-lg">Client Info</h2>

          <input
            placeholder="Email"
            type="email"
            value={client.email || ""}
            onChange={(e) =>
              setClient((prev) => ({ ...prev, email: e.target.value }))
            }
          />

          <input
            placeholder="Phone"
            type="tel"
            value={client.phone || ""}
            onChange={(e) =>
              setClient((prev) => ({ ...prev, phone: e.target.value }))
            }
          />


          <input
            placeholder="Street"
            value={client.street || ""}
            onChange={(e) =>
              setClient((prev) => ({ ...prev, street: e.target.value }))
            }
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="City"
              value={client.city || ""}
              onChange={(e) =>
                setClient((prev) => ({ ...prev, city: e.target.value }))
              }
            />
            <input
              placeholder="State"
              value={client.state || ""}
              onChange={(e) =>
                setClient((prev) => ({ ...prev, state: e.target.value }))
              }
            />
          </div>

          <input
            placeholder="ZIP"
            value={client.zip || ""}
            onChange={(e) =>
              setClient((prev) => ({ ...prev, zip: e.target.value }))
            }
          />

          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary text-sm"
              disabled={savingClient}
              onClick={async () => {
                setSavingClient(true);
                await supabase
                  .from("clients")
                  .update({
                    email: client.email || null,
                    phone: client.phone || null,
                    street: client.street || null,
                    city: client.city || null,
                    state: client.state || null,
                    zip: client.zip || null,
                  })

                  .eq("id", client.id)
                  .eq("groomer_id", user.id);
                setSavingClient(false);
              }}
            >
              {savingClient ? "Saving…" : "Save Client Info"}
            </button>

            {client.street &&
              client.city &&
              client.state &&
              client.zip && (
                <a
                  className="btn-secondary text-sm"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${client.street}, ${client.city}, ${client.state} ${client.zip}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  📍 Open in Maps
                </a>
              )}
          </div>
        </div>
      </div>

      {/* PET FORM */}
      {/* EVERYTHING BELOW IS YOUR ORIGINAL CODE, UNCHANGED */}

      {/* PET FORM */}
      <form onSubmit={handleSubmit} className="card mb-6">
        <div className="card-body space-y-3">
          <input
            name="name"
            value={form.name}
            onChange={handleFormChange}
            placeholder="Pet name"
            required
          />
          <input
            name="breed"
            value={form.breed}
            onChange={handleFormChange}
            placeholder="Breed"
          />

          {/* TAGS */}
          <div>
            <label className="font-medium block mb-1">
              Tags (behavior, medical, etc.)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TAG_OPTIONS.map((tag) => (
                <label key={tag} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.tags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                  />
                  {tag}
                </label>
              ))}
            </div>

            {form.tags.includes("Other") && (
              <input
                type="text"
                value={otherTag}
                onChange={(e) => setOtherTag(e.target.value)}
                placeholder="Enter custom tag..."
                className="mt-2"
              />
            )}
          </div>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleFormChange}
            placeholder="Notes"
          />

          {/* SIZE */}
          <label className="font-medium block mt-4">Size / Difficulty</label>
          <select
            name="slot_weight"
            value={form.slot_weight}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                slot_weight: Number(e.target.value),
              }))
            }
            className="border rounded w-full p-2"
          >
            <option value={1}>Small / Easy (1)</option>
            <option value={1}>Medium (1)</option>
            <option value={2}>Large (2)</option>
            <option value={3}>XL / Special Care (3)</option>
          </select>

          <div className="flex flex-wrap gap-3 mt-3">
            <button type="submit" className="btn-primary">
              {editingId ? "Update Pet" : "Add Pet"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </form>

      {/* PET LIST */}
      <ul className="space-y-3">
        {pets.length === 0 ? (
          <p className="text-gray-600">No pets added yet.</p>
        ) : (
          pets.map((pet) => (
            <li key={pet.id} className="card">
              <div className="card-body">
                <div className="font-semibold text-lg">{pet.name}</div>
                <div className="text-gray-600">{pet.breed}</div>

                {/* TAGS */}
                {pet.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pet.tags.map((tag, i) => (
                      <span
                        key={`${pet.id}-${tag}-${i}`}
                        className={`chip ${
                          ["Bites", "Anxious", "Aggressive", "Matting"].includes(
                            tag
                          )
                            ? "chip-danger"
                            : ""
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* NOTES */}
                {pet.notes && (
                  <div className="text-sm text-gray-700 mt-2">{pet.notes}</div>
                )}

                {/* SIZE */}
                <div className="text-sm text-gray-600 mt-2">
                  Difficulty / Size:{" "}
                  <strong>
                    {pet.slot_weight === 1
                      ? "Small / Medium (1)"
                      : pet.slot_weight === 2
                      ? "Large (2)"
                      : "XL / Special Care (3)"}
                  </strong>
                </div>

                {/* SHOT RECORDS */}
                <div className="mt-4">
                  <div className="font-medium text-gray-800 mb-1">
                    Shot Records
                  </div>

                  {pet.pet_shot_records?.length > 0 ? (
                    <ul className="ml-3 list-disc text-sm text-gray-700">
                      {pet.pet_shot_records.map((rec) => (
                        <li key={rec.id}>
                          <strong>{rec.shot_type}</strong> — expires{" "}
                          {rec.date_expires}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      No shot records yet.
                    </div>
                  )}

                  <button
                    onClick={() => setAddShotPet(pet)}
                    className="btn-secondary text-sm mt-2"
                  >
                    + Add Shot Record
                  </button>
                </div>

                {/* BUTTONS */}
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link
                    to={`/pets/${pet.id}/appointments`}
                    className="btn-secondary"
                  >
                    View Appointments
                  </Link>

                  <button
                    className="btn-primary"
                    onClick={() => handleEdit(pet)}
                  >
                    ✏️ Edit
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(pet.id)}
                  >
                    🗑 Delete
                  </button>

                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {/* ADD SHOT RECORD FORM */}
      {addShotPet && (
        <div className="card mt-6">
          <div className="card-body">
            <h3 className="font-semibold mb-4">
              Add Shot Record for {addShotPet.name}
            </h3>

            <div className="space-y-4">
              {/* SHOT TYPE */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Shot Type
                </label>
                <select
                  value={shotForm.shot_type}
                  onChange={(e) =>
                    setShotForm({ ...shotForm, shot_type: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                >
                  <option>Rabies</option>
                  <option>Bordetella</option>
                  <option>DHPP</option>
                  <option>Other</option>
                </select>
              </div>

              {/* DATE GIVEN */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Date Given
                </label>

                <input
                  type="date"
                  value={shotForm.date_given}
                  onChange={(e) =>
                    setShotForm({ ...shotForm, date_given: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                  disabled={shotForm.date_unknown}
                />

                <label className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={shotForm.date_unknown}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setShotForm((prev) => ({
                        ...prev,
                        date_unknown: checked,
                        date_given: checked ? "" : prev.date_given,
                      }));
                    }}
                  />
                  Date given unknown
                </label>
              </div>

              {/* DATE EXPIRES */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Date Expires
                </label>
                <input
                  type="date"
                  value={shotForm.date_expires}
                  onChange={(e) =>
                    setShotForm({ ...shotForm, date_expires: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                  required
                />
              </div>

              {/* NOTES */}
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={shotForm.notes}
                  onChange={(e) =>
                    setShotForm({ ...shotForm, notes: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                  placeholder="Optional notes…"
                />
              </div>

              {/* BUTTONS */}
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    await supabase.from("pet_shot_records").insert({
                      pet_id: addShotPet.id,
                      shot_type: shotForm.shot_type,
                      date_given: shotForm.date_unknown
                        ? null
                        : shotForm.date_given || null,
                      date_expires: shotForm.date_expires,
                      notes: shotForm.notes || "",
                    });

                    setShotForm({
                      shot_type: "Rabies",
                      date_given: "",
                      date_unknown: false,
                      date_expires: "",
                      notes: "",
                    });

                    setAddShotPet(null);
                    await reloadPets();
                  }}
                >
                  Save Shot
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAddShotPet(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
