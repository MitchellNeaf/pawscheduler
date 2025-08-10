import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import ClientForm from '../components/ClientForm';
import { useCallback } from "react"; // make sure this is present

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [pets, setPets] = useState([]);
  const [search, setSearch] = useState("");


  const fetchData = useCallback(async () => {
    try {
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (clientError) {
        console.error("Error loading clients:", clientError.message);
      } else {
        setClients(clientData || []);
      }

      const { data: petData, error: petError } = await supabase
        .from("pets")
        .select("*");

      if (petError) {
        console.error("Error loading pets:", petError.message);
      } else {
        setPets(petData || []);
      }
    } catch (e) {
      console.error("Unexpected fetchData error:", e);
    }
  }, [setClients, setPets]); // include deps to satisfy react-hooks/exhaustive-deps


  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredClients = clients.filter(client => {
    const lowerSearch = search.toLowerCase();
    const clientNameMatch = client.full_name?.toLowerCase().includes(lowerSearch);
    const petMatches = pets
      .filter(pet => pet.client_id === client.id)
      .some(pet =>
        pet.name?.toLowerCase().includes(lowerSearch) ||
        pet.breed?.toLowerCase().includes(lowerSearch) ||
        (pet.tags || []).some(tag => tag.toLowerCase().includes(lowerSearch))
      );
    return clientNameMatch || petMatches;
  });

  return (
    <main>
      <h1 className="mt-2">Clients</h1>

      {/* Search */}
      <div className="card mb-4">
        <div className="card-body">
          <label className="block font-semibold mb-1 text-gray-700">Search Clients or Pets</label>
          <input
            type="text"
            placeholder="Type a client name, pet name, breed, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-96"
          />
        </div>
      </div>

      {/* Add Client */}
      <div className="card">
        <div className="card-header">
          <h2 className="m-0">Add Client</h2>
        </div>
        <div className="card-body">
          {/* Your ClientForm already renders a <form>; base CSS will make it look like a card */}
          <ClientForm onClientAdded={fetchData} />
        </div>
      </div>

      {/* Client List */}
      <ul className="mt-6 space-y-3">
        {filteredClients.map((client) => (
          <li key={client.id} className="card">
            <div className="card-body">
              <div className="font-semibold">
                <Link to={`/clients/${client.id}`}>{client.full_name}</Link>
              </div>
              <div className="text-gray-600">{client.phone}</div>

              <ul className="mt-2 ml-4 text-sm text-gray-700 !space-y-1">
                {pets
                  .filter(pet => pet.client_id === client.id)
                  .map(pet => (
                    <li key={pet.id} className="!p-0 !border-0 !shadow-none !bg-transparent">
                      {pet.name} {pet.breed && `– ${pet.breed}`}
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
