import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";
import ClientForm from "../components/ClientForm";
import Loader from "../components/Loader";

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [pets, setPets] = useState([]);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Get logged-in groomer
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
    } catch (e) {
      console.error("Unexpected fetchData error:", e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Combined search
  const filteredClients = clients.filter((client) => {
    const q = search.toLowerCase();

    const clientMatch = client.full_name?.toLowerCase().includes(q);

    const petMatch = pets
      .filter((p) => p.client_id === client.id)
      .some(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.breed?.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q))
      );

    return clientMatch || petMatch;
  });

  if (loading) return <Loader />;

  return (
    <main className="px-4 pb-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Clients</h1>

      {/* Search Box */}
      <div className="card mb-6">
        <div className="card-body">
          <label className="block mb-2 text-gray-700 font-medium">
            Search Clients or Pets
          </label>
          <input
            type="text"
            placeholder="Type a client name, pet name, breed, or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-96 shadow-sm"
          />
        </div>
      </div>

      {/* Add Client */}
      <div className="card mb-8">
        <div className="card-header">
          <h2 className="m-0 font-semibold">Add Client</h2>
        </div>
        <div className="card-body">
          <ClientForm onClientAdded={fetchData} user={user} />
        </div>
      </div>

      {/* Client List */}
      <ul className="space-y-4">
        {filteredClients.map((client) => (
          <li key={client.id} className="card hover:shadow-lg transition">
            <div className="card-body">
              <div className="flex justify-between items-start">
                <div>
                  <Link
                    to={`/clients/${client.id}`}
                    className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                  >
                    {client.full_name}
                  </Link>
                  <div className="text-gray-600 text-sm">{client.phone}</div>
                </div>
              </div>

              {/* Pets Under Client */}
              <ul className="mt-3 ml-1 space-y-1">
                {pets
                  .filter((pet) => pet.client_id === client.id)
                  .map((pet) => (
                    <li key={pet.id} className="text-sm text-gray-700">
                      <span className="font-medium">{pet.name}</span>
                      {pet.breed && (
                        <span className="text-gray-500"> — {pet.breed}</span>
                      )}

                      {pet.tags?.length > 0 && (
                        <span className="ml-2 text-xs text-gray-500">
                          [{pet.tags.join(", ")}]
                        </span>
                      )}
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
