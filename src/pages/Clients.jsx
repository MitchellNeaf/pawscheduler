import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";
import Loader from "../components/Loader";

/**
 * Normalize US phone to E.164 for Telnyx.
 * Examples:
 * 814-333-4444 -> +18143334444
 * (814)3334444 -> +18143334444
 * 18143334444  -> +18143334444
 */
function normalizeUSPhoneToE164(input) {
  const raw = (input || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return "INVALID";
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [pets, setPets] = useState([]);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // Get logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientData } = await supabase
        .from("clients")
        .select("*")
        .eq("groomer_id", user.id)
        .order("created_at", { ascending: false });

      const { data: petData } = await supabase
        .from("pets")
        .select("*")
        .eq("groomer_id", user.id);

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

  // Detect duplicate pet names (only within quick add)
  useEffect(() => {
    const cleaned = quickPets
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);

    const hasDuplicates = new Set(cleaned).size !== cleaned.length;
    setDuplicateWarning(
      hasDuplicates ? "Duplicate dog names for this client." : ""
    );
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
      alert("Could not save client. Try again.");
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

      // If blank/cleared: delete phone + force opt-out
      if (normalized === null) {
        const { error } = await supabase
          .from("clients")
          .update({ phone: null, sms_opt_in: false })
          .eq("id", clientId);

        if (error) throw error;

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

      // If we have a valid phone, allow opt-in toggle
      const { error } = await supabase
        .from("clients")
        .update({
          phone: normalized,
          sms_opt_in: !!smsOptInDraft,
        })
        .eq("id", clientId);

      if (error) throw error;

      await fetchData();
      cancelSmsEdit();
    } catch (e) {
      console.error(e);
      setSmsSaveError("Could not save SMS settings. Try again.");
    } finally {
      setSmsSaving(false);
    }
  };

  // Combined search
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
            onClick={() => setShowQuickAdd((v) => !v)}
          >
            ⚡ Quick Add
          </button>
        )}
      </div>

      {/* QUICK ADD (unchanged) */}
      {showQuickAdd && (
        <div className="card mb-6 border-2 border-dashed">
          <div className="card-body space-y-3">
            <h2 className="font-semibold text-lg">Quick Add Client</h2>

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
                    onClick={() =>
                      setQuickPets((p) => p.filter((_, i) => i !== idx))
                    }
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

            <div className="flex gap-3 flex-wrap">
              <button
                className="btn-primary"
                disabled={quickSaving || !!duplicateWarning}
                onClick={() => handleQuickAdd(false)}
              >
                {quickSaving ? "Saving..." : "Save Client"}
              </button>

              <button
                className="btn-secondary"
                disabled={quickSaving || !!duplicateWarning}
                onClick={() => handleQuickAdd(true)}
              >
                Save & Add Next Client
              </button>

              {clients.length > 0 && (
                <button
                  className="btn-secondary"
                  onClick={() => setShowQuickAdd(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {clients.length > 0 && (
        <div className="card mb-6">
          <div className="card-body">
            <input
              placeholder="Search clients, pets, phone, or address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Client List */}
      <ul className="space-y-4">
        {filteredClients.map((client) => {
          const fullAddress =
            client.street && client.city && client.state && client.zip
              ? `${client.street}, ${client.city}, ${client.state} ${client.zip}`
              : null;

          const isEditing = smsEditId === client.id;

          return (
            <li key={client.id} className="card">
              <div className="card-body">
                {/* Name */}
                <Link
                  to={`/clients/${client.id}`}
                  className="font-semibold text-lg block"
                >
                  {client.full_name}
                </Link>

                {/* Contact Info */}
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
                            onChange={(e) =>
                              setSmsOptInDraft(e.target.checked)
                            }
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
    </main>
  );
}
