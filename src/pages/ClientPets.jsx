import { useParams, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";
import ConfirmModal from "../components/ConfirmModal";
import { SERVICE_OPTIONS } from "../utils/grooming";

// Size category (pricing tier) — distinct from slot_weight (booking capacity).
// Small and Medium both occupy 1 capacity slot; Large occupies 2; XL occupies 3.
const SIZE_CATEGORIES = [
  { value: 1, label: "Small",  slotWeight: 1 },
  { value: 2, label: "Medium", slotWeight: 1 },
  { value: 3, label: "Large",  slotWeight: 2 },
  { value: 4, label: "XL",     slotWeight: 3 },
];

function slotWeightForSize(sizeCategory) {
  const found = SIZE_CATEGORIES.find(s => s.value === sizeCategory);
  return found ? found.slotWeight : 1;
}

function sizeCategoryLabel(sizeCategory) {
  const found = SIZE_CATEGORIES.find(s => s.value === sizeCategory);
  return found ? found.label : "Small";
}

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
  extraPhotos,
  setExtraPhotos,
  newPhotoFiles,
  setNewPhotoFiles,
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
            <label className="block text-sm font-medium mb-1">Pet Photos</label>

            {/* Existing + new preview photos */}
            <div className="flex flex-wrap gap-2 mb-2">
              {/* Primary photo */}
              {photoPreview && !photoPreview.startsWith("blob:") && (
                <div className="relative">
                  <img src={photoPreview} alt="Main"
                    className="w-16 h-16 rounded-lg object-cover border-2 border-emerald-400" />
                  <span className="absolute -top-1 -left-1 text-[9px] bg-emerald-500 text-white rounded px-1 font-bold">Main</span>
                </div>
              )}
              {/* Blob preview for new primary */}
              {photoPreview && photoPreview.startsWith("blob:") && (
                <div className="relative">
                  <img src={photoPreview} alt="New main"
                    className="w-16 h-16 rounded-lg object-cover border-2 border-emerald-400" />
                  <span className="absolute -top-1 -left-1 text-[9px] bg-emerald-500 text-white rounded px-1 font-bold">Main</span>
                </div>
              )}
              {/* Extra existing photos */}
              {extraPhotos.map((url, i) => (
                <div key={url} className="relative">
                  <img src={url} alt={`${i + 2}`}
                    className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => setExtraPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center leading-none font-bold"
                  >✕</button>
                </div>
              ))}
              {/* Preview new files */}
              {newPhotoFiles.map((file, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(file)} alt={`New ${i}`}
                    className="w-16 h-16 rounded-lg object-cover border border-blue-300" />
                  <button
                    type="button"
                    onClick={() => setNewPhotoFiles(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center leading-none font-bold"
                  >✕</button>
                </div>
              ))}
            </div>

            {/* Upload buttons */}
            <div className="flex gap-2 flex-wrap">
              <label className="cursor-pointer">
                <span className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition font-medium text-gray-700">
                  {photoPreview ? "Change main photo" : "Set main photo"}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
              </label>
              <label className="cursor-pointer">
                <span className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 transition font-medium text-blue-700">
                  + Add photo
                </span>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    const compressed = await Promise.all(files.map(f => compressImage(f)));
                    setNewPhotoFiles(prev => [...prev, ...compressed]);
                  }} />
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-1">Main photo shows on schedule cards. All photos shown here.</p>
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
          <label className="font-medium block mt-4">Size (pricing)</label>
          <select
            name="size_category"
            value={form.size_category ?? 1}
            onChange={(e) => {
              const sizeCategory = Number(e.target.value);
              setForm((prev) => ({
                ...prev,
                size_category: sizeCategory,
                slot_weight: slotWeightForSize(sizeCategory),
              }));
            }}
            className="border rounded w-full p-2"
          >
            {SIZE_CATEGORIES.map(({ value, label, slotWeight }) => (
              <option key={value} value={value}>
                {label} ({slotWeight} slot{slotWeight > 1 ? "s" : ""})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Small and Medium both use 1 booking slot — this only affects pricing.
          </p>

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

          {/* DEFAULT PRICE */}
          <div className="mt-3">
            <label className="font-medium block mb-1">
              Default Price
              <span className="ml-2 text-xs font-normal text-gray-500">
                — auto-fills when booking this pet
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.default_price ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    default_price: e.target.value === "" ? null : parseFloat(e.target.value),
                  }))
                }
                className="border rounded-xl w-full p-2 pl-7 text-sm"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Overrides size-based pricing for this pet. Still adjustable per appointment.</p>
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
  const [upcomingAppts, setUpcomingAppts] = useState([]);
  const [pets, setPets] = useState([]);
  const [user, setUser] = useState(null);
  const [planTier, setPlanTier] = useState("free");
  const [intakeQuestions, setIntakeQuestions] = useState([]);
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
    size_category: 1,
    default_services: [],
    default_duration_min: null,
    default_price: null,
  });

  const [otherTag, setOtherTag] = useState("");
  const [editingId, setEditingId] = useState(null);

  // Modal state (UI only)
  const [petEditOpen, setPetEditOpen] = useState(false);
  const [shotModalOpen, setShotModalOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  // Multiple pet photos
  const [extraPhotos, setExtraPhotos] = useState([]); // array of existing URLs
  const [newPhotoFiles, setNewPhotoFiles] = useState([]); // new files to upload
  // Client photo
  const [clientPhotoFile, setClientPhotoFile] = useState(null);
  const [clientPhotoPreview, setClientPhotoPreview] = useState(null);

  // ConfirmModal state
  const [confirmConfig, setConfirmConfig] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user || null;
      setUser(u);
      if (u) {
        supabase.from("groomers").select("plan_tier, custom_intake_questions").eq("id", u.id).maybeSingle()
          .then(({ data: g }) => {
            if (g?.plan_tier) setPlanTier(g.plan_tier);
            if (g?.custom_intake_questions) setIntakeQuestions(g.custom_intake_questions);
          });
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

      // Load upcoming appointments for this client's pets
      const petIds = (petData || []).map(p => p.id);
      if (petIds.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: apptData } = await supabase
          .from("appointments")
          .select("id, date, time, confirmed, waitlist, services, pets(name)")
          .in("pet_id", petIds)
          .gte("date", today)
          .or("no_show.is.null,no_show.eq.false")
          .order("date", { ascending: true })
          .order("time", { ascending: true })
          .limit(10);
        setUpcomingAppts(apptData || []);
      }

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
      size_category: 1,
      default_services: [],
      default_duration_min: null,
      default_price: null,
    });
    setOtherTag("");
    setEditingId(null);
    setPetEditOpen(false);
    setPhotoFile(null);
    setPhotoPreview(null);
    setExtraPhotos([]);
    setNewPhotoFiles([]);
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPhotoFile(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
  };

  const handleClientPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setClientPhotoFile(compressed);
    setClientPhotoPreview(URL.createObjectURL(compressed));
  };

  const handleAddPet = () => {
    setForm({
      name: "",
      breed: "",
      notes: "",
      tags: [],
      slot_weight: 1,
      size_category: 1,
      default_services: [],
      default_duration_min: null,
      default_price: null,
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

    // Upload primary photo if a new one was selected
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

    // Upload additional photos
    let allUrls = [...extraPhotos]; // start with existing kept photos
    for (let i = 0; i < newPhotoFiles.length; i++) {
      const file = newPhotoFiles[i];
      const path = `${user.id}/${editingId || `new-${Date.now()}`}/extra-${Date.now()}-${i}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("pet-photos")
        .upload(path, file, { upsert: true, contentType: "image/jpeg" });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("pet-photos").getPublicUrl(path);
        allUrls.push(pub.publicUrl + "?v=" + Date.now());
      } else {
        console.error("Extra photo upload failed:", upErr.message);
      }
    }

    // If no primary photo but we have extra photos, promote first extra
    if (!photoUrl && allUrls.length > 0) {
      photoUrl = allUrls[0];
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
          size_category: form.size_category ?? 1,
          default_services: form.default_services.length ? form.default_services : null,
          default_duration_min: form.default_duration_min || null,
          default_price: form.default_price ?? null,
          photo_url: photoUrl,
          photo_urls: allUrls.length > 0 ? allUrls : null,
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
          size_category: form.size_category ?? 1,
          default_services: form.default_services.length ? form.default_services : null,
          default_duration_min: form.default_duration_min || null,
          default_price: form.default_price ?? null,
          photo_url: photoUrl,
          photo_urls: allUrls.length > 0 ? allUrls : null,
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
      size_category: pet.size_category ?? 1,
      default_services: pet.default_services || [],
      default_duration_min: pet.default_duration_min || null,
      default_price: pet.default_price ?? null,
    });

    if (pet.tags?.some((t) => !TAG_OPTIONS.includes(t))) {
      setOtherTag(pet.tags.find((t) => !TAG_OPTIONS.includes(t)) || "");
    } else {
      setOtherTag("");
    }

    setEditingId(pet.id);
    setPhotoFile(null);
    setPhotoPreview(pet.photo_url || null);
    setExtraPhotos(pet.photo_urls || []);
    setNewPhotoFiles([]);
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

      {/* UPCOMING APPOINTMENTS */}
      {upcomingAppts.length > 0 && (
        <div className="card mb-6">
          <div className="card-body space-y-2">
            <h2 className="font-semibold text-base">Upcoming Appointments</h2>
            {upcomingAppts.map((appt) => {
              const [y, m, d] = appt.date.split("-").map(Number);
              const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric"
              });
              const [h, min] = (appt.time || "00:00").slice(0, 5).split(":").map(Number);
              const ampm = h >= 12 ? "PM" : "AM";
              const timeStr = `${h % 12 || 12}:${String(min).padStart(2, "0")} ${ampm}`;
              const isWaitlisted = appt.waitlist;
              const isConfirmed = appt.confirmed;
              return (
                <div key={appt.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-light)] last:border-0">
                  <div>
                    <div className="text-sm font-medium">{appt.pets?.name}</div>
                    <div className="text-xs text-[var(--text-3)]">{dateStr} at {timeStr}</div>
                    {appt.services?.length > 0 && (
                      <div className="text-xs text-[var(--text-3)]">
                        {Array.isArray(appt.services) ? appt.services.join(", ") : appt.services}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    isWaitlisted
                      ? "bg-blue-100 text-blue-700"
                      : isConfirmed
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {isWaitlisted ? "Waitlisted" : isConfirmed ? "Confirmed" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CLIENT INFO */}
      <div className="card mb-6">
        <div className="card-body space-y-3">
          <h2 className="font-semibold text-lg">Client Info</h2>

          {/* Client photo */}
          {(planTier === "basic" || planTier === "growth" || planTier === "pro") && (
            <div className="flex items-center gap-3">
              {(clientPhotoPreview || client.photo_url) ? (
                <img
                  src={clientPhotoPreview || client.photo_url}
                  alt={client.full_name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-emerald-400"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-2xl">
                  👤
                </div>
              )}
              <label className="cursor-pointer">
                <span className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition font-medium text-gray-700">
                  {client.photo_url ? "Change photo" : "Add client photo"}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleClientPhotoChange} />
              </label>
            </div>
          )}
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
          {client.custom_intake_answers && Object.keys(client.custom_intake_answers).length > 0 && (
            <div className="pt-2 border-t border-[var(--border-med)]">
              <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">
                Intake Answers
              </div>
              <div className="space-y-2">
                {Object.entries(client.custom_intake_answers).map(([qId, answer]) => {
                  const question = intakeQuestions.find((q) => q.id === qId);
                  return (
                    <div key={qId} className="text-sm">
                      <span className="text-gray-500 text-xs font-medium">
                        {question?.label || qId.replace(/_/g, " ")}
                      </span>
                      <div className="text-gray-800 mt-0.5">
                        {Array.isArray(answer) ? answer.join(", ") : String(answer || "—")}
                      </div>
                    </div>
                  );
                })}
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

                // Upload client photo if changed
                let clientPhotoUrl = client.photo_url || null;
                if (clientPhotoFile) {
                  const path = `clients/${client.id}/photo.jpg`;
                  const { error: upErr } = await supabase.storage
                    .from("pet-photos")
                    .upload(path, clientPhotoFile, { upsert: true, contentType: "image/jpeg" });
                  if (!upErr) {
                    const { data: pub } = supabase.storage.from("pet-photos").getPublicUrl(path);
                    clientPhotoUrl = pub.publicUrl + "?v=" + Date.now();
                    setClient(prev => ({ ...prev, photo_url: clientPhotoUrl }));
                    setClientPhotoFile(null);
                    setClientPhotoPreview(null);
                  } else {
                    alert("Client photo upload failed: " + upErr.message);
                  }
                }

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
                    photo_url: clientPhotoUrl,
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

                {/* Photo gallery — show all photos if more than one */}
                {pet.photo_urls && pet.photo_urls.length > 1 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                    {pet.photo_urls.map((url, i) => (
                      <img key={i} src={url} alt={`${pet.name} ${i + 1}`}
                        className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                    ))}
                  </div>
                )}

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
                  Size:{" "}
                  <strong>
                    {sizeCategoryLabel(pet.size_category ?? 1)}
                  </strong>
                  <span className="text-gray-400 text-xs ml-1">
                    ({pet.slot_weight ?? 1} slot{(pet.slot_weight ?? 1) > 1 ? "s" : ""})
                  </span>
                </div>

                {/* Default services + duration */}
                {(pet.default_services?.length > 0 || pet.default_duration_min || pet.default_price != null) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-500 font-medium">Defaults:</span>
                    {pet.default_services?.map((svc) => (
                      <span key={svc} className="chip chip-brand">{svc}</span>
                    ))}
                    {pet.default_duration_min && (
                      <span className="chip chip-neutral">⏱ {pet.default_duration_min} min</span>
                    )}
                    {pet.default_price != null && (
                      <span className="chip chip-neutral">💵 ${Number(pet.default_price).toFixed(2)}</span>
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
        extraPhotos={extraPhotos}
        setExtraPhotos={setExtraPhotos}
        newPhotoFiles={newPhotoFiles}
        setNewPhotoFiles={setNewPhotoFiles}
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