// src/pages/Clients.jsx
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";
import Loader from "../components/Loader";

const SLOT_WEIGHT_OPTIONS = [
  { value: 1, label: "Small / Medium" },
  { value: 2, label: "Large" },
  { value: 3, label: "XL" },
];

const PET_TAG_OPTIONS = [
  "Bites", "Anxious", "Senior", "Aggressive", "Matting",
  "Arthritis", "Blind", "Deaf", "Allergies", "Other",
];

/**
 * ============================================================
 *  ADD PET MODAL
 * ============================================================
 */
function AddPetModal({ open, onClose, client, user, onSaved }) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [slotWeight, setSlotWeight] = useState(1);
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset form when modal opens for a new client
  useEffect(() => {
    if (open) {
      setName(""); setBreed(""); setSlotWeight(1);
      setTags([]); setNotes(""); setError("");
    }
  }, [open, client?.id]);

  if (!open || !client) return null;

  const toggleTag = (tag) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  const handleSave = async () => {
    if (!name.trim()) { setError("Dog name is required."); return; }
    setSaving(true);
    setError("");

    const { error: err } = await supabase.from("pets").insert({
      name: name.trim(),
      breed: breed.trim() || null,
      slot_weight: slotWeight,
      tags: tags.length ? tags : null,
      notes: notes.trim() || null,
      client_id: client.id,
      groomer_id: user.id,
    });

    setSaving(false);

    if (err) { setError(err.message); return; }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-3">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Add Pet</h2>
            <p className="text-xs text-gray-500 mt-0.5">for {client.full_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">

          {/* Name */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Dog name <span className="text-red-500">*</span></span>
            <input
              placeholder="e.g. Buddy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full"
              autoFocus
            />
          </label>

          {/* Breed */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Breed <span className="text-gray-400 font-normal">(optional)</span></span>
            <input
              placeholder="e.g. Golden Retriever"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full"
            />
          </label>

          {/* Size */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Size</span>
            <div className="grid grid-cols-3 gap-2">
              {SLOT_WEIGHT_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSlotWeight(value)}
                  className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-colors
                    ${slotWeight === value
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-emerald-400"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Tags <span className="text-gray-400 font-normal">(optional)</span></span>
            <div className="flex flex-wrap gap-2">
              {PET_TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                    ${tags.includes(tag)
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-amber-400"
                    }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Notes <span className="text-gray-400 font-normal">(optional)</span></span>
            <textarea
              placeholder="Any special notes about this dog…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border rounded-lg px-3 py-2 text-sm w-full resize-none"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add Pet"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 *  PHONE NORMALIZATION
 * ============================================================
 */
function normalizeUSPhoneToE164(input) {
  const raw = (input || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return "INVALID";
}

/**
 * ============================================================
 *  APPOINTMENT PROPAGATION HELPERS
 * ============================================================
 */

function getTodayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getPetIdsForClient(clientId, pets) {
  return (pets || [])
    .filter((p) => p.client_id === clientId)
    .map((p) => p.id)
    .filter(Boolean);
}

async function propagateSmsPreferenceToFutureAppointments({
  clientId,
  pets,
  enabled,
}) {
  const petIds = getPetIdsForClient(clientId, pets);

  if (!petIds.length) return;

  const today = getTodayYMD();

  const updatePayload = {
    sms_reminder_enabled: !!enabled,
  };

  if (enabled) {
    updatePayload.sms_reminder_sent_at = null;
  }

  const { error } = await supabase
    .from("appointments")
    .update(updatePayload)
    .in("pet_id", petIds)
    .gte("date", today);

  if (error) throw error;
}

/**
 * ============================================================
 *  QUICK ADD MODAL (UI ONLY CHANGE)
 * ============================================================
 */
function QuickAddModal({
  open,
  onClose,
  clientsCount,
  quickClientName,
  setQuickClientName,
  quickPets,
  setQuickPets,
  duplicateWarning,
  quickSaving,
  onSaveClient,
  onSaveAndAddNext,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-3">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-900 text-lg">
            ⚡ Quick Add Client
          </h2>

          {/* Only allow close if they already have clients */}
          {clientsCount > 0 ? (
            <button
              onClick={onClose}
              className="text-gray-500 text-sm px-2 py-1 rounded hover:bg-gray-100"
            >
              ✕
            </button>
          ) : (
            <span className="text-xs text-gray-500">Required first setup</span>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="text-sm text-gray-600">
            Add a client and at least one dog. (You can always edit details
            later.)
          </div>

          <input
            placeholder="Client name (e.g. Richard)"
            value={quickClientName}
            onChange={(e) => setQuickClientName(e.target.value)}
          />

          {quickPets.map((pet, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                placeholder={`Dog ${idx + 1} name`}
                value={pet}
                onChange={(e) => {
                  const copy = [...quickPets];
                  copy[idx] = e.target.value;
                  setQuickPets(copy);
                }}
              />

              {quickPets.length > 1 && (
                <button
                  type="button"
                  className="btn-danger text-sm"
                  onClick={() => setQuickPets((p) => p.filter((_, i) => i !== idx))}
                >
                  ❌
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setQuickPets((p) => [...p, ""])}
          >
            ➕ Add another dog
          </button>

          {duplicateWarning && (
            <div className="text-sm text-red-600 font-medium">
              {duplicateWarning}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex gap-3 flex-wrap justify-end">
          <button
            className="btn-primary"
            disabled={quickSaving || !!duplicateWarning}
            onClick={onSaveClient}
          >
            {quickSaving ? "Saving..." : "Save Client"}
          </button>

          <button
            className="btn-secondary"
            disabled={quickSaving || !!duplicateWarning}
            onClick={onSaveAndAddNext}
          >
            Save & Add Next Client
          </button>

          {clientsCount > 0 && (
            <button className="btn-secondary" onClick={onClose} disabled={quickSaving}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [pets, setPets] = useState([]);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groomerSlug, setGroomerSlug] = useState("");

  // Quick add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickPets, setQuickPets] = useState([""]);
  const [quickSaving, setQuickSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");

  // Inline SMS edit state
  const [smsEditId, setSmsEditId] = useState(null);
  const [smsPhoneDraft, setSmsPhoneDraft] = useState("");
  const [smsOptInDraft, setSmsOptInDraft] = useState(false);
  const [smsSaveError, setSmsSaveError] = useState("");
  const [smsSaving, setSmsSaving] = useState(false);

  // Add Pet modal state
  const [addPetClient, setAddPetClient] = useState(null);

  // Waiver link state
  const [waiverSentFor, setWaiverSentFor] = useState(new Set());
  const [waiverSignedIds, setWaiverSignedIds] = useState(new Set());

  // Intake state
  const [intakeSentFor, setIntakeSentFor] = useState(new Set());
  const [sendingIntake, setSendingIntake] = useState(null);
  const [sendingWaiver, setSendingWaiver] = useState(null); // clientId | null

  const copyWaiverLink = (client) => {
    const waiverUrl = `${window.location.origin}/waiver/${groomerSlug}?cid=${client.id}`;
    navigator.clipboard.writeText(waiverUrl).then(() => {
      setWaiverSentFor((prev) => new Set([...prev, client.id]));
    });
  };

  const sendWaiverEmail = async (client) => {
    setSendingWaiver(client.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/sendWaiverEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clientId: client.id }),
      });
      if (res.ok) {
        setWaiverSentFor((prev) => new Set([...prev, client.id]));
      } else {
        copyWaiverLink(client);
      }
    } catch {
      copyWaiverLink(client);
    } finally {
      setSendingWaiver(null);
    }
  };

  const sendWaiverViaSms = async (client) => {
    setSendingWaiver(`sms-${client.id}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/sendWaiverSms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clientId: client.id }),
      });
      if (res.ok) {
        setWaiverSentFor((prev) => new Set([...prev, `sms-${client.id}`]));
      }
    } catch {
      console.error("SMS waiver send failed");
    } finally {
      setSendingWaiver(null);
    }
  };

  const sendIntakeEmail = async (client) => {
    if (!client.email || !groomerSlug) {
      // No email — copy link instead
      const url = `${window.location.origin}/intake/${groomerSlug}?cid=${client.id}`;
      navigator.clipboard.writeText(url);
      setIntakeSentFor((prev) => new Set([...prev, client.id]));
      return;
    }
    setSendingIntake(client.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/sendIntakeEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clientId: client.id }),
      });
      if (res.ok) {
        setIntakeSentFor((prev) => new Set([...prev, client.id]));
      } else {
        // Fall back to clipboard
        const url = `${window.location.origin}/intake/${groomerSlug}?cid=${client.id}`;
        navigator.clipboard.writeText(url);
        setIntakeSentFor((prev) => new Set([...prev, client.id]));
      }
    } catch {
      const url = `${window.location.origin}/intake/${groomerSlug}?cid=${client.id}`;
      navigator.clipboard.writeText(url);
      setIntakeSentFor((prev) => new Set([...prev, client.id]));
    } finally {
      setSendingIntake(null);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) return;

      const { data: clientData } = await supabase
        .from("clients")
        .select("*")
        .eq("groomer_id", authUser.id)
        .order("created_at", { ascending: false });

      const { data: petData } = await supabase
        .from("pets")
        .select("*")
        .eq("groomer_id", authUser.id);

      // Load groomer slug for waiver link
      const { data: groomerData } = await supabase
        .from("groomers")
        .select("slug")
        .eq("id", authUser.id)
        .single();

      if (groomerData?.slug) setGroomerSlug(groomerData.slug);

      // Load waiver signatures to show signed status
      const { data: sigData } = await supabase
        .from("waiver_signatures")
        .select("client_id")
        .eq("groomer_id", authUser.id)
        .not("client_id", "is", null);

      if (sigData) {
        setWaiverSignedIds(new Set(sigData.map((s) => s.client_id)));
      }

      setClients(clientData || []);
      setPets(petData || []);
      setLoading(false);

      if ((clientData || []).length === 0) {
        setShowQuickAdd(true);
      }
    } catch (e) {
      console.error("Fetch error:", e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const cleaned = quickPets
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);

    const hasDuplicates = new Set(cleaned).size !== cleaned.length;
    setDuplicateWarning(hasDuplicates ? "Duplicate dog names for this client." : "");
  }, [quickPets]);

  const handleQuickAdd = async (addNext = false) => {
    const cleanedPets = quickPets.map((p) => p.trim()).filter(Boolean);

    if (
      !quickClientName.trim() ||
      cleanedPets.length === 0 ||
      duplicateWarning ||
      !user
    ) {
      return;
    }

    setQuickSaving(true);

    try {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          full_name: quickClientName.trim(),
          groomer_id: user.id,
        })
        .select()
        .single();

      if (clientError) throw clientError;

      const petRows = cleanedPets.map((name) => ({
        name,
        client_id: client.id,
        groomer_id: user.id,
        slot_weight: 1,
      }));

      const { error: petError } = await supabase.from("pets").insert(petRows);
      if (petError) throw petError;

      if (addNext) {
        setQuickClientName("");
        setQuickPets([""]);
      } else {
        setShowQuickAdd(false);
      }

      await fetchData();
    } catch (err) {
      console.error(err);
      // Surface error inline via duplicateWarning so user sees it without a dialog
      setDuplicateWarning("Could not save client. Please try again.");
    } finally {
      setQuickSaving(false);
    }
  };

  const startSmsEdit = (client) => {
    setSmsSaveError("");
    setSmsEditId(client.id);
    setSmsPhoneDraft(client.phone || "");
    setSmsOptInDraft(!!client.sms_opt_in);
  };

  const cancelSmsEdit = () => {
    setSmsSaveError("");
    setSmsEditId(null);
    setSmsPhoneDraft("");
    setSmsOptInDraft(false);
  };

  const saveSmsEdit = async (clientId) => {
    setSmsSaveError("");
    setSmsSaving(true);

    try {
      const normalized = normalizeUSPhoneToE164(smsPhoneDraft);

      if (normalized === null) {
        const { error } = await supabase
          .from("clients")
          .update({ phone: null, sms_opt_in: false })
          .eq("id", clientId);

        if (error) throw error;

        await propagateSmsPreferenceToFutureAppointments({
          clientId,
          pets,
          enabled: false,
        });

        await fetchData();
        cancelSmsEdit();
        return;
      }

      if (normalized === "INVALID") {
        setSmsSaveError(
          "Invalid phone. Use a 10-digit US number (e.g. 814-333-4444)."
        );
        return;
      }

      const enabled = !!smsOptInDraft;

      const { error } = await supabase
        .from("clients")
        .update({
          phone: normalized,
          sms_opt_in: enabled,
        })
        .eq("id", clientId);

      if (error) throw error;

      await propagateSmsPreferenceToFutureAppointments({
        clientId,
        pets,
        enabled,
      });

      await fetchData();
      cancelSmsEdit();
    } catch (e) {
      console.error(e);
      setSmsSaveError("Could not save SMS settings. Try again.");
    } finally {
      setSmsSaving(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const q = search.toLowerCase();

    const clientMatch =
      (client.full_name || "").toLowerCase().includes(q) ||
      (client.email || "").toLowerCase().includes(q) ||
      (client.phone || "").toLowerCase().includes(q) ||
      (client.street || "").toLowerCase().includes(q) ||
      (client.city || "").toLowerCase().includes(q) ||
      (client.state || "").toLowerCase().includes(q) ||
      (client.zip || "").toLowerCase().includes(q);

    const petMatch = pets
      .filter((p) => p.client_id === client.id)
      .some((p) => (p.name || "").toLowerCase().includes(q));

    return clientMatch || petMatch;
  });

  if (loading) return <Loader />;

  return (
    <main className="px-4 pb-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Clients</h1>

        {clients.length > 0 && (
          <button
            className="btn-primary text-sm"
            onClick={() => setShowQuickAdd(true)}
          >
            ⚡ Quick Add
          </button>
        )}
      </div>

      {/* QUICK ADD MODAL (UI ONLY CHANGE) */}
      <QuickAddModal
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        clientsCount={clients.length}
        quickClientName={quickClientName}
        setQuickClientName={setQuickClientName}
        quickPets={quickPets}
        setQuickPets={setQuickPets}
        duplicateWarning={duplicateWarning}
        quickSaving={quickSaving}
        onSaveClient={() => handleQuickAdd(false)}
        onSaveAndAddNext={() => handleQuickAdd(true)}
      />

      {/* Search */}
      {clients.length > 0 && (
        <div className="card mb-6">
          <div className="card-body">
            <div style={{ position: "relative" }}>
              <input
                placeholder="Search clients, pets, phone, or address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingRight: search ? "2.5rem" : undefined }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute", right: 10, top: "50%",
                    transform: "translateY(-50%)", background: "none",
                    border: "none", cursor: "pointer", color: "var(--text-3)",
                    fontSize: "1rem", lineHeight: 1, padding: 0,
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            {search && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-3)",
                marginTop: 6, fontWeight: 600 }}>
                {filteredClients.length === 0
                  ? "No clients match"
                  : `${filteredClients.length} of ${clients.length} client${clients.length !== 1 ? "s" : ""}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Client List */}
      <ul className="space-y-4">
        {filteredClients.length === 0 && search && (
          <div style={{ textAlign: "center", padding: "32px 16px",
            color: "var(--text-3)", fontSize: "0.9rem" }}>
            No clients match <strong>"{search}"</strong>
          </div>
        )}
        {filteredClients.map((client) => {
          const fullAddress =
            client.street && client.city && client.state && client.zip
              ? `${client.street}, ${client.city}, ${client.state} ${client.zip}`
              : null;

          const isEditing = smsEditId === client.id;

          return (
            <li key={client.id} className="card">
              <div className="card-body">
                <Link
                  to={`/clients/${client.id}`}
                  className="font-semibold text-lg block"
                >
                  {client.full_name}
                </Link>

                <div className="mt-1 text-sm text-gray-600 space-y-0.5">
                  {client.email && <div>📧 {client.email}</div>}

                  {client.phone && (
                    <div className="flex gap-3 flex-wrap items-center">
                      <a
                        href={`tel:${client.phone}`}
                        className="text-blue-600 hover:underline"
                      >
                        📞 Call
                      </a>

                      <a
                        href={`sms:${client.phone}`}
                        className="text-blue-600 hover:underline"
                      >
                        💬 Text
                      </a>

                      <span className="text-gray-700">{client.phone}</span>

                      {client.sms_opt_in && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          SMS opted-in
                        </span>
                      )}
                    </div>
                  )}

                  {!client.phone && (
                    <div className="text-xs text-gray-500">
                      No phone on file (SMS disabled)
                    </div>
                  )}

                  {fullAddress && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        fullAddress
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:underline"
                    >
                      📍 {fullAddress}
                    </a>
                  )}

                  {/* Emergency contact */}
                  {(client.emergency_contact_name || client.emergency_contact_phone) && (
                    <div className="text-xs text-[var(--text-3)] mt-1">
                      🚨 Emergency: {client.emergency_contact_name}{client.emergency_contact_phone ? ` — ${client.emergency_contact_phone}` : ""}
                    </div>
                  )}
                </div>

                {/* SMS Edit */}
                <div className="mt-3">
                  {!isEditing ? (
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      onClick={() => startSmsEdit(client)}
                    >
                      ✉️ Edit SMS
                    </button>
                  ) : (
                    <div className="card border border-dashed mt-2">
                      <div className="card-body space-y-2">
                        <div className="text-sm font-medium text-gray-800">
                          SMS Settings
                        </div>

                        <input
                          placeholder="Phone (e.g. 814-333-4444)"
                          value={smsPhoneDraft}
                          onChange={(e) => setSmsPhoneDraft(e.target.value)}
                        />

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={smsOptInDraft}
                            disabled={!smsPhoneDraft.trim()}
                            onChange={(e) => setSmsOptInDraft(e.target.checked)}
                          />
                          Opt in to text reminders
                        </label>

                        <div className="text-xs text-gray-500">
                          Message rates may apply. Reply STOP to opt out.
                        </div>

                        {smsSaveError && (
                          <div className="text-sm text-red-600 font-medium">
                            {smsSaveError}
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          <button
                            className="btn-primary text-sm"
                            disabled={smsSaving}
                            onClick={() => saveSmsEdit(client.id)}
                          >
                            {smsSaving ? "Saving..." : "Save"}
                          </button>

                          <button
                            className="btn-secondary text-sm"
                            disabled={smsSaving}
                            onClick={cancelSmsEdit}
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="text-xs text-gray-500">
                          Tip: clearing the phone number will also disable SMS
                          opt-in automatically.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pets */}
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Link
                    to={`/clients/${client.id}`}
                    className="btn-secondary text-sm"
                  >
                    View Client
                  </Link>

                  <button
                    type="button"
                    className="btn-primary text-sm"
                    onClick={() => setAddPetClient(client)}
                  >
                    ➕ Add Pet
                  </button>

                  {/* Waiver — signed badge, or send options */}
                  {groomerSlug && (
                    waiverSignedIds.has(client.id) ? (
                      <span className="text-sm px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 font-semibold">
                        ✅ Waiver Signed
                      </span>
                    ) : waiverSentFor.has(client.id) ? (
                      <span className="text-sm px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 font-semibold">
                        ✓ Waiver Sent
                      </span>
                    ) : client.email ? (
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={sendingWaiver === client.id}
                          onClick={() => sendWaiverEmail(client)}
                          className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          title="Send waiver via email"
                        >
                          {sendingWaiver === client.id ? "Sending…" : "📧 Email Waiver"}
                        </button>
                        {client.phone && client.sms_opt_in && (
                          <button
                            type="button"
                            disabled={sendingWaiver === `sms-${client.id}`}
                            onClick={() => sendWaiverViaSms(client)}
                            className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                            title="Send waiver via SMS"
                          >
                            {sendingWaiver === `sms-${client.id}` ? "Sending…" : "📱 SMS Waiver"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => copyWaiverLink(client)}
                        className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                        title="Copy waiver link to clipboard"
                      >
                        📋 Copy Waiver Link
                      </button>
                    )
                  )}

                  {/* Intake button */}
                  {groomerSlug && (
                    intakeSentFor.has(client.id) ? (
                      <span className="text-sm px-3 py-1.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 font-semibold">
                        ✓ Intake Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={sendingIntake === client.id}
                        onClick={() => sendIntakeEmail(client)}
                        className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
                        title={client.email ? "Send intake form via email" : "Copy intake link to clipboard"}
                      >
                        {sendingIntake === client.id
                          ? "Sending…"
                          : client.email
                          ? "📋 Send Intake"
                          : "📋 Copy Intake Link"}
                      </button>
                    )
                  )}
                </div>

                <ul className="mt-3 ml-1 space-y-1">
                  {pets
                    .filter((p) => p.client_id === client.id)
                    .map((pet) => (
                      <li key={pet.id} className="text-sm">
                        {pet.name}
                      </li>
                    ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>

      <AddPetModal
        open={!!addPetClient}
        onClose={() => setAddPetClient(null)}
        client={addPetClient}
        user={user}
        onSaved={fetchData}
      />
    </main>
  );
}