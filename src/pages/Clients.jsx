import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";
import Loader from "../components/Loader";

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

  // Detect duplicate pet names (ONLY within this client being created)
  useEffect(() => {
    const cleaned = quickPets
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);

    const localDuplicates = new Set(cleaned).size !== cleaned.length;

    if (localDuplicates) {
      setDuplicateWarning("Duplicate dog names for this client.");
    } else {
      setDuplicateWarning("");
    }
  }, [quickPets]);

  const handleQuickAdd = async (addNext = false) => {
    const cleanedPets = quickPets.map((p) => p.trim()).filter(Boolean);

    if (!quickClientName.trim() || cleanedPets.length === 0 || duplicateWarning || !user) {
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

  // Combined search
  const filteredClients = clients.filter((client) => {
    const q = search.toLowerCase();

    const clientMatch =
      (client.full_name || "").toLowerCase().includes(q) ||
      (client.email || "").toLowerCase().includes(q) ||
      (client.phone || "").toLowerCase().includes(q);

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

      {/* QUICK ADD */}
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

            <p className="text-sm text-gray-500">
              Add details, vaccines, and notes later.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {clients.length > 0 && (
        <div className="card mb-6">
          <div className="card-body">
            <input
              placeholder="Search clients or pets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Client List */}
      <ul className="space-y-4">
        {filteredClients.map((client) => (
          <li key={client.id} className="card">
            <div className="card-body">
              <Link
                to={`/clients/${client.id}`}
                className="font-semibold text-lg"
              >
                {client.full_name}
              </Link>

              <ul className="mt-2 ml-1 space-y-1">
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
        ))}
      </ul>
    </main>
  );
}
