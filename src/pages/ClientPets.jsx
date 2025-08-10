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
  "Other"
];

export default function ClientPets() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", breed: "", notes: "", tags: [] });
  const [otherTag, setOtherTag] = useState("");
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const { data: clientData } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      const { data: petData } = await supabase
        .from("pets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      setClient(clientData);
      setPets(petData || []);
      setLoading(false);
    };

    loadData();
  }, [clientId]);

  const handleFormChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleTag = (tag) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  };

  const resetForm = () => {
    setForm({ name: "", breed: "", tags: [], notes: "" });
    setOtherTag("");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalTags = otherTag ? [...form.tags.filter((t) => t !== "Other"), otherTag] : form.tags;

    if (editingId) {
      const { data, error } = await supabase
        .from("pets")
        .update({ name: form.name, breed: form.breed, notes: form.notes, tags: finalTags })
        .eq("id", editingId)
        .select()
        .single();
      if (!error) {
        setPets((prev) => prev.map((p) => (p.id === editingId ? data : p)));
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from("pets")
        .insert([{ client_id: clientId, name: form.name, breed: form.breed, notes: form.notes, tags: finalTags }])
        .select()
        .single();
      if (!error && data) {
        setPets((prev) => [data, ...prev]);
        resetForm();
      }
    }
  };

  const handleEdit = (pet) => {
    setForm({
      name: pet.name || "",
      breed: pet.breed || "",
      notes: pet.notes || "",
      tags: pet.tags?.includes("Other") ? [...pet.tags, "Other"] : pet.tags || [],
    });
    if (pet.tags?.some((t) => !TAG_OPTIONS.includes(t))) {
      setOtherTag(pet.tags.find((t) => !TAG_OPTIONS.includes(t)) || "");
    } else {
      setOtherTag("");
    }
    setEditingId(pet.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("Delete this pet?");
    if (!confirmDelete) return;
    const { error } = await supabase.from("pets").delete().eq("id", id);
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

      <form onSubmit={handleSubmit} className="card mb-6">
        <div className="card-body space-y-3">
          <input name="name" value={form.name} onChange={handleFormChange} placeholder="Pet name" required />
          <input name="breed" value={form.breed} onChange={handleFormChange} placeholder="Breed" />

          <div>
            <label className="font-medium block mb-1">Tags (behavior, medical, etc.)</label>
            <div className="grid grid-cols-2 gap-2">
              {TAG_OPTIONS.map((tag) => (
                <label key={tag} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.tags.includes(tag)} onChange={() => toggleTag(tag)} />
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

          <textarea name="notes" value={form.notes} onChange={handleFormChange} placeholder="Notes" />

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary">
              {editingId ? "Update Pet" : "Add Pet"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </form>

      <ul className="space-y-3">
        {pets.length === 0 ? (
          <p className="text-gray-600">No pets added yet.</p>
        ) : (
          pets.map((pet) => (
            <li key={pet.id} className="card">
              <div className="card-body">
                <div className="font-semibold text-lg">{pet.name}</div>
                <div className="text-gray-600">{pet.breed}</div>

                {pet.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pet.tags.map((tag, i) => (
                      <span key={`${pet.id}-${tag}-${i}`} className={`chip ${["Bites","Anxious","Aggressive","Matting"].includes(tag) ? "chip-danger" : ""}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {pet.notes && <div className="text-sm text-gray-700 mt-2">{pet.notes}</div>}

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link to={`/pets/${pet.id}/appointments`} className="btn-secondary">View Appointments</Link>
                  <button className="btn-primary" onClick={() => handleEdit(pet)}>✏️ Edit</button>
                  <button className="btn-danger" onClick={() => handleDelete(pet.id)}>🗑 Delete</button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
