import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function ClientForm({ onClientSaved, editingClient, onCancelEdit }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // When editingClient changes, populate / reset the form
  useEffect(() => {
    if (editingClient) {
      setFullName(editingClient.full_name || "");
      setEmail(editingClient.email || "");
      setPhone(editingClient.phone || "");
    } else {
      setFullName("");
      setEmail("");
      setPhone("");
    }
  }, [editingClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to add clients.");
      setLoading(false);
      return;
    }

    const payload = {
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim(),
    };

    try {
      if (editingClient?.id) {
        // UPDATE existing client
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", editingClient.id)
          .eq("groomer_id", user.id);

        if (error) {
          console.error("Update client error:", error);
          alert("Error updating client: " + error.message);
        } else {
          onClientSaved?.();
          onCancelEdit?.();
        }
      } else {
        // INSERT new client
        const insertPayload = {
          ...payload,
          groomer_id: user.id,
        };

        const { error } = await supabase
          .from("clients")
          .insert([insertPayload]);

        if (error) {
          console.error("Insert client error:", error);
          alert("Error adding client: " + error.message);
        } else {
          onClientSaved?.();
          setFullName("");
          setEmail("");
          setPhone("");
        }
      }
    } catch (err) {
      console.error("Unexpected client save error:", err);
      alert("Unexpected error saving client. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        className="w-full p-2 border rounded"
        placeholder="Client name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />

      <input
        className="w-full p-2 border rounded"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
      />

      <input
        className="w-full p-2 border rounded"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading
            ? "Saving..."
            : editingClient
            ? "Update Client"
            : "Add Client"}
        </button>

        {editingClient && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="btn-secondary"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
