import { useParams, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";
import ConfirmModal from "../components/ConfirmModal";
import { SERVICE_OPTIONS } from "../utils/grooming";

/* ---------------- Image compression ---------------- */
// Resize + compress before upload — targets ~800px max, JPEG 0.82
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(new File([blob], "photo.jpg", { type: "image/jpeg" })),
          "image/jpeg",
          0.82
        );
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- Lazy pet photo ---------------- */
// Only loads the image URL when the element scrolls into view
function LazyPetPhoto({ url, name }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!url) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [url]);

  if (!url) return null;

  return (
    <div ref={ref} className="flex-shrink-0">
      {visible ? (
        <img
          src={url}
          alt={name}
          className="w-16 h-16 rounded-full object-cover border-2 border-[var(--border-med)] shadow-sm"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-[var(--surface-2)] border-2 border-[var(--border-med)]" />
      )}
    </div>
  );
}

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

function PetEditModal({
  open,
  onClose,
  editingId,
  form,
  setForm,
  otherTag,
  setOtherTag,
  toggleTag,
  onSubmit,
  photoPreview,
  onPhotoChange,
  planTier,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-3">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-900 text-lg">
            {editingId ? "✏️ Edit Pet Details" : "➕ Add Pet"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 text-sm px-2 py-1 rounded hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 space-y-3 overflow-y-auto">
          <input
            name="name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Pet name"
            required
          />

          <input
            name="breed"
            value={form.breed}
            onChange={(e) => setForm((prev) => ({ ...prev, breed: e.target.value }))}
            placeholder="Breed"
          />

          {/* PHOTO UPLOAD — Basic+ */}
          {(planTier === "basic" || planTier === "growth" || planTier === "pro") ? (
          <div>
            <label className="block text-sm font-medium mb-1">Pet Photo</label>
            <div className="flex items-center gap-3">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview"
                  className="w-14 h-14 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xl">🐾</div>
              )}
              <label className="cursor-pointer">
                <span className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition font-medium text-gray-700">
                  {photoPreview ? "Change photo" : "Upload photo"}
                </span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={onPhotoChange} />
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-1">Auto-compressed to save space.</p>
          </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
              🔒 Pet photos require Basic or higher — <a href="/upgrade" className="text-emerald-600 font-semibold">Upgrade →</a>
            </div>
          )}
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
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
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

          {/* DEFAULT SERVICES */}
          <div className="mt-4">
            <label className="font-medium block mb-2">
              Default Services
              <span className="ml-2 text-xs font-normal text-gray-500">
                — pre-fill when booking this pet
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICE_OPTIONS.map((svc) => {
                const checked = (form.default_services || []).includes(svc);
                return (
                  <label
                    key={svc}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm font-medium transition
                      ${checked
                        ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                        : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setForm((prev) => {
                          const curr = prev.default_services || [];
                          return {
                            ...prev,
                            default_services: curr.includes(svc)
                              ? curr.filter((s) => s !== svc)
                              : [...curr, svc],
                          };
                        });
                      }}
                      className="accent-emerald-600 w-4 h-4 shrink-0"
                    />
                    {svc}
                  </label>
                );
              })}
            </div>
          </div>

          {/* DEFAULT DURATION */}
          <div className="mt-3">
            <label className="font-medium block mb-1">
              Default Duration
              <span className="ml-2 text-xs font-normal text-gray-500">
                — pre-fill when booking this pet
              </span>
            </label>
            <select
              value={form.default_duration_min || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  default_duration_min: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className="border rounded-xl w-full p-2 text-sm"
            >
              <option value="">No default (use auto)</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>120 min</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editingId ? "Update Pet" : "Add Pet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShotModal({
  open,
  onClose,
  pet,
  shotForm,
  setShotForm,
  onSave,
}) {
  if (!open || !pet) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-3">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900 text-lg">
            💉 Add Shot Record for {pet.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 text-sm px-2 py-1 rounded hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">Shot Type</label>
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

          <div>
            <label className="block text-sm font-medium mb-1">Date Given</label>

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

          <div>
            <label className="block text-sm font-medium mb-1">Date Expires</label>
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
        </div>

        <div className="px-4 py-3 border-t flex gap-3 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onSave}>
            Save Shot
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientPets() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [pets, setPets] = useState([]);
  const [user, setUser] = useState(null);
  const [planTier, setPlanTier] = useState("free");
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

  // Pet form
  const [form, setForm] = useState({
    name: "",
    breed: "",
    notes: "",
    tags: [],
    slot_weight: 1,
    default_services: [],
    default_duration_min: null,
  });

  const [otherTag, setOtherTag] = useState("");
  const [editingId, setEditingId] = useState(null);

  // Modal state (UI only)
  const [petEditOpen, setPetEditOpen] = useState(false);
  const [shotModalOpen, setShotModalOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // ConfirmModal state
  const [confirmConfig, setConfirmConfig] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user || null;
      setUser(u);
      if (u) {
        supabase.from("groomers").select("plan_tier").eq("id", u.id).maybeSingle()
          .then(({ data: g }) => { if (g?.plan_tier) setPlanTier(g.plan_tier); });
      }
    });
  }, []);

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
      default_services: [],
      default_duration_min: null,
    });
    setOtherTag("");
    setEditingId(null);
    setPetEditOpen(false);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPhotoFile(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
  };

  const handleAddPet = () => {
    setForm({
      name: "",
      breed: "",
      notes: "",
      tags: [],
      slot_weight: 1,
      default_services: [],
      default_duration_min: null,
    });
    setOtherTag("");
    setEditingId(null);
    setPetEditOpen(true);
  };
  // Add or update pet (same logic; just no scrolling)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    const finalTags = otherTag
      ? [...form.tags.filter((t) => t !== "Other"), otherTag]
      : form.tags;

    // Upload photo if a new one was selected
    let photoUrl = (photoPreview && !photoPreview.startsWith("blob:")) ? photoPreview : null;
    if (photoFile) {
      const path = `${user.id}/${editingId || `new-${Date.now()}`}/photo.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("pet-photos")
        .upload(path, photoFile, { upsert: true, contentType: "image/jpeg" });
      if (uploadErr) {
        console.error("Pet photo upload failed:", uploadErr.message);
        alert("Photo upload failed: " + uploadErr.message + "\nThe pet will be saved without the photo.");
      } else {
        const { data: pub } = supabase.storage.from("pet-photos").getPublicUrl(path);
        photoUrl = pub.publicUrl + "?v=" + Date.now();
      }
    }

    if (editingId) {
      const { data, error } = await supabase
        .from("pets")
        .update({
          name: form.name,
          breed: form.breed,
          notes: form.notes,
          tags: finalTags,
          slot_weight: form.slot_weight,
          default_services: form.default_services.length ? form.default_services : null,
          default_duration_min: form.default_duration_min || null,
          photo_url: photoUrl,
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
        .insert([{
          client_id: clientId,
          groomer_id: user.id,
          name: form.name,
          breed: form.breed,
          notes: form.notes,
          tags: finalTags,
          slot_weight: form.slot_weight,
          default_services: form.default_services.length ? form.default_services : null,
          default_duration_min: form.default_duration_min || null,
          photo_url: photoUrl,
        }])
        .select()
        .single();

      if (!error && data) {
        setPets((prev) => [data, ...prev]);
        resetForm();
      }
    }
  };

  // Edit pet (open modal instead of scroll)
  const handleEdit = (pet) => {
    setForm({
      name: pet.name || "",
      breed: pet.breed || "",
      notes: pet.notes || "",
      tags: pet.tags?.includes("Other")
        ? [...pet.tags, "Other"]
        : pet.tags || [],
      slot_weight: pet.slot_weight ?? 1,
      default_services: pet.default_services || [],
      default_duration_min: pet.default_duration_min || null,
    });

    if (pet.tags?.some((t) => !TAG_OPTIONS.includes(t))) {
      setOtherTag(pet.tags.find((t) => !TAG_OPTIONS.includes(t)) || "");
    } else {
      setOtherTag("");
    }

    setEditingId(pet.id);
    setPhotoFile(null);
    setPhotoPreview(pet.photo_url || null);
    setPetEditOpen(true);
  };

  const closePetEdit = () => {
    setPetEditOpen(false);
    // keep data in form until they cancel explicitly
  };

  // Delete pet
  const handleDelete = async (id) => {
    if (!user) return;

    setConfirmConfig({
      title: "Delete this pet?",
      message: "All shot records for this pet will also be deleted. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase
          .from("pets")
          .delete()
          .eq("id", id)
          .eq("groomer_id", user.id);

        if (!error) {
          setPets((prev) => prev.filter((p) => p.id !== id));
          if (editingId === id) resetForm();
        }
      },
    });
  };

  if (loading) return (
    <main className="px-4 py-6 space-y-4 max-w-2xl mx-auto">
      {/* Back link skeleton */}
      <div className="h-4 w-24 bg-gray-200 animate-pulse rounded" />

      {/* Client info card skeleton */}
      <div className="card space-y-3">
        <div className="h-5 w-40 bg-gray-200 animate-pulse rounded" />
        <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
        <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
        <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
        <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-gray-200 animate-pulse rounded-xl" />
          <div className="h-9 w-24 bg-gray-200 animate-pulse rounded-xl" />
        </div>
      </div>

      {/* Pet card skeletons */}
      <Loader />
      <Loader />
    </main>
  );
  if (!client) return <main className="px-4 py-6">Client not found</main>;

  return (
    <main>
      <div className="mb-2">
        <Link to="/clients">&larr; Back to Clients</Link>
      </div>

      <h1 className="mt-2 mb-4">{client.full_name}'s Pets</h1>

      {/* CLIENT INFO */}
      <div className="card mb-6">
        <div className="card-body space-y-3">
          <h2 className="font-semibold text-lg">Client Info</h2>
          <input
            placeholder="Client Name"
            value={client.full_name || ""}
            onChange={(e) =>
              setClient((prev) => ({ ...prev, full_name: e.target.value }))
            }
          />

          <input
            placeholder="Email"
            type="email"
            value={client.email || ""}
            onChange={(e) =>
              setClient((prev) => ({ ...prev, email: e.target.value }))
            }
          />

          <div className="text-sm text-gray-700">
            📞 {client.phone || "No phone on file"}
          </div>
          <div className="text-xs text-gray-500">
            Phone & SMS settings are managed from the Clients page.
          </div>

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

          {/* Emergency Contact */}
          <div className="pt-2 border-t border-[var(--border-med)]">
            <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">
              Emergency Contact
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Contact name"
                value={client.emergency_contact_name || ""}
                onChange={(e) =>
                  setClient((prev) => ({ ...prev, emergency_contact_name: e.target.value }))
                }
              />
              <input
                placeholder="Contact phone"
                value={client.emergency_contact_phone || ""}
                onChange={(e) =>
                  setClient((prev) => ({ ...prev, emergency_contact_phone: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Custom intake answers */}
          {client.custom_answers && Object.keys(client.custom_answers).length > 0 && (
            <div className="pt-2 border-t border-[var(--border-med)]">
              <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">
                Intake Answers
              </div>
              <div className="space-y-2">
                {Object.entries(client.custom_answers).map(([qId, answer]) => (
                  <div key={qId} className="text-sm">
                    <span className="text-gray-500 text-xs font-medium">{qId.replace(/_/g, " ")}</span>
                    <div className="text-gray-800 mt-0.5">
                      {Array.isArray(answer) ? answer.join(", ") : String(answer || "—")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="pt-2 border-t border-[var(--border-med)]">
            <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">
              Client Notes
            </div>
            <textarea
              placeholder="Any notes about this client (e.g. always late, preferred parking, etc.)"
              value={client.notes || ""}
              onChange={(e) => setClient((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary text-sm"
              disabled={savingClient}
              onClick={async () => {
                setSavingClient(true);
                await supabase
                  .from("clients")
                  .update({
                    full_name: client.full_name || null,
                    email: client.email || null,
                    street: client.street || null,
                    city: client.city || null,
                    state: client.state || null,
                    zip: client.zip || null,
                    emergency_contact_name:  client.emergency_contact_name || null,
                    emergency_contact_phone: client.emergency_contact_phone || null,
                    notes: client.notes || null,
                  })
                  .eq("id", client.id)
                  .eq("groomer_id", user.id);
                setSavingClient(false);
              }}
            >
              {savingClient ? "Saving…" : "Save Client Info"}
            </button>

            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={handleAddPet}
            >
              ➕ Add Pet
            </button>

            {client.street && client.city && client.state && client.zip && (
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

      {/* PET LIST */}
      <ul className="space-y-3">
        {pets.length === 0 ? (
          <div className="card">
            <div className="card-body">
              <p className="text-gray-600 mb-3">No pets added yet.</p>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={handleAddPet}
              >
                ➕ Add First Pet
              </button>
            </div>
          </div>
        ) : (
          pets.map((pet) => (
            <li key={pet.id} className="card">
              <div className="card-body">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-lg">{pet.name}</div>
                    <div className="text-gray-600">{pet.breed}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border-med)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--bg)] transition font-semibold"
                      onClick={() => handleEdit(pet)}
                    >
                      ✏️ Edit
                    </button>
                    <LazyPetPhoto url={pet.photo_url} name={pet.name} />
                  </div>
                </div>

                {pet.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pet.tags.map((tag, i) => (
                      <span
                        key={`${pet.id}-${tag}-${i}`}
                        className={`chip ${
                          ["Bites", "Anxious", "Aggressive", "Matting"].includes(tag)
                            ? "chip-danger"
                            : ""
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {pet.notes && (
                  <div className="text-sm text-gray-700 mt-2">{pet.notes}</div>
                )}

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

                {/* Default services + duration */}
                {(pet.default_services?.length > 0 || pet.default_duration_min) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-500 font-medium">Defaults:</span>
                    {pet.default_services?.map((svc) => (
                      <span key={svc} className="chip chip-brand">{svc}</span>
                    ))}
                    {pet.default_duration_min && (
                      <span className="chip chip-neutral">⏱ {pet.default_duration_min} min</span>
                    )}
                  </div>
                )}

                {/* SHOT RECORDS */}
                <div className="mt-4">
                  <div className="font-medium text-gray-800 mb-1">Shot Records</div>

                  {pet.pet_shot_records?.length > 0 ? (
                    <ul className="ml-3 list-disc text-sm text-gray-700">
                      {pet.pet_shot_records.map((rec) => (
                        <li key={rec.id}>
                          <strong>{rec.shot_type}</strong> — expires {rec.date_expires}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      No shot records yet.
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setAddShotPet(pet);
                      setShotModalOpen(true);
                    }}
                    className="btn-secondary text-sm mt-2"
                  >
                    + Add Shot Record
                  </button>
                </div>

                {/* BUTTONS */}
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link to={`/pets/${pet.id}/appointments`} className="btn-secondary">
                    View Appointments
                  </Link>

                  <button className="btn-primary" onClick={() => handleEdit(pet)}>
                    ✏️ Edit
                  </button>

                  <button className="btn btn-danger" onClick={() => handleDelete(pet.id)}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {/* PET EDIT MODAL */}
      <PetEditModal
        open={petEditOpen}
        onClose={closePetEdit}
        editingId={editingId}
        form={form}
        setForm={setForm}
        otherTag={otherTag}
        setOtherTag={setOtherTag}
        toggleTag={toggleTag}
        onSubmit={handleSubmit}
        photoPreview={photoPreview}
        onPhotoChange={handlePhotoChange}
        planTier={planTier}
      />

      {/* SHOT MODAL */}
      <ShotModal
        open={shotModalOpen}
        onClose={() => {
          setShotModalOpen(false);
          setAddShotPet(null);
        }}
        pet={addShotPet}
        shotForm={shotForm}
        setShotForm={setShotForm}
        onSave={async () => {
          if (!addShotPet) return;

          await supabase.from("pet_shot_records").insert({
            pet_id: addShotPet.id,
            shot_type: shotForm.shot_type,
            date_given: shotForm.date_unknown ? null : shotForm.date_given || null,
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

          setShotModalOpen(false);
          setAddShotPet(null);
          await reloadPets();
        }}
      />

      {/* SMS CONVERSATION HISTORY */}
      <SmsConversationHistory clientId={clientId} clientPhone={client?.phone} />

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />

    </main>
  );
}

/* ---------------- SMS CONVERSATION HISTORY ---------------- */
function SmsConversationHistory({ clientId, clientPhone }) {
  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!clientPhone) { setLoading(false); return; }

    supabase
      .from("sms_conversations")
      .select("messages, last_message_at")
      .eq("phone", clientPhone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setConv(data || null);
        setLoading(false);
      });
  }, [clientPhone]);

  if (loading) return null;
  if (!conv) return null;

  // Filter to only user/assistant text messages (skip tool results)
  const readable = (conv.messages || []).filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim()
  ).slice(-20);

  if (!readable.length) return null;

  const lastSeen = new Date(conv.last_message_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700
          hover:text-emerald-700 transition"
      >
        <span>💬 SMS Conversation History</span>
        <span className="text-gray-400 text-xs">Last active {lastSeen}</span>
        <span className="ml-auto">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 border rounded-xl overflow-hidden bg-gray-50">
          <div className="max-h-80 overflow-y-auto p-3 space-y-2">
            {readable.map((msg, i) => {
              const isClient = msg.role === "user";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: isClient ? "flex-start" : "flex-end",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "78%",
                      padding: "8px 12px",
                      borderRadius: isClient
                        ? "4px 16px 16px 16px"
                        : "16px 4px 16px 16px",
                      background: isClient ? "#ffffff" : "#10b981",
                      color: isClient ? "#111827" : "#ffffff",
                      border: isClient ? "1px solid #e5e7eb" : "none",
                      fontSize: "0.83rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t text-xs text-gray-400 text-right">
            Showing last {readable.length} messages
          </div>
        </div>
      )}
    </div>
  );
}