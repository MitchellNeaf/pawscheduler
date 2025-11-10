import { useState } from "react";
import { supabase } from "../supabase";

export default function ClientForm({ onClientAdded }) {
  const [full_name, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // ✅ get current logged-in groomer
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      alert("You must be logged in to add clients.");
      setLoading(false);
      return;
    }

    const payload = {
      full_name: full_name.trim(),
      phone: phone.trim(),
      groomer_id: user.id, // ✅ attach groomer
    };

    const { error } = await supabase.from("clients").insert([payload]);

    if (error) {
      alert("Error adding client: " + error.message);
    } else {
      setFullName("");
      setPhone("");
      onClientAdded?.(); // refresh the list
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-4 border rounded">
      <input
        className="w-full p-2 border"
        placeholder="Client name"
        value={full_name}
        onChange={(e) => setFullName(e.target.value)}
        required
      />
      <input
        className="w-full p-2 border"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        {loading ? "Saving..." : "Add Client"}
      </button>
    </form>
  );
}
