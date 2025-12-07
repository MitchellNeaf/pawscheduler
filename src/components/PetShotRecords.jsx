import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function PetShotRecords({ petId, userId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editMode, setEditMode] = useState(null);
  const [form, setForm] = useState({
    shot_type: "Rabies",
    date_given: "",
    date_expires: "",
    notes: ""
  });

  useEffect(() => {
    loadRecords();
  }, [petId]);

  const loadRecords = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pet_shot_records")
      .select("*")
      .eq("pet_id", petId)
      .order("date_expires", { ascending: false });

    setRecords(data || []);
    setLoading(false);
  };

  const openNewForm = () => {
    setEditMode(null);
    setForm({
      shot_type: "Rabies",
      date_given: "",
      date_expires: "",
      notes: ""
    });
    setFormOpen(true);
  };

  const openEditForm = (record) => {
    setEditMode(record.id);
    setForm({
      shot_type: record.shot_type,
      date_given: record.date_given || "",
      date_expires: record.date_expires || "",
      notes: record.notes || ""
    });
    setFormOpen(true);
  };

  const saveRecord = async () => {
    if (!form.shot_type || !form.date_expires) {
      alert("Shot type and expiration date are required.");
      return;
    }

    if (editMode) {
      await supabase
        .from("pet_shot_records")
        .update(form)
        .eq("id", editMode)
        .eq("pet_id", petId);
    } else {
      await supabase.from("pet_shot_records").insert({
        pet_id: petId,
        ...form
      });
    }

    setFormOpen(false);
    setEditMode(null);
    await loadRecords();
  };

  const deleteRecord = async (id) => {
    if (!window.confirm("Delete this record?")) return;

    await supabase
      .from("pet_shot_records")
      .delete()
      .eq("id", id)
      .eq("pet_id", petId);

    loadRecords();
  };

  return (
    <div className="mt-6 p-4 border rounded bg-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">Shot Records</h2>
        <button
          onClick={openNewForm}
          className="btn-primary text-sm px-3 py-1"
        >
          + Add
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : records.length === 0 ? (
        <p className="text-gray-500 text-sm italic">No shot records yet.</p>
      ) : (
        <ul className="space-y-3">
          {records.map((rec) => (
            <li
              key={rec.id}
              className="border p-3 rounded flex flex-col gap-1 bg-gray-50"
            >
              <div className="flex justify-between">
                <span className="font-medium">{rec.shot_type}</span>
                <div className="flex gap-2 text-sm">
                  <button
                    onClick={() => openEditForm(rec)}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteRecord(rec.id)}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-600">
                Given: {rec.date_given || "—"}
              </div>
              <div className="text-xs text-gray-600">
                Expires: {rec.date_expires || "—"}
              </div>

              {rec.notes && (
                <div className="text-xs text-gray-500 italic">{rec.notes}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* FORM */}
      {formOpen && (
        <div className="mt-4 p-4 border rounded bg-gray-50">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <label className="flex flex-col">
              Shot Type
              <select
                className="border rounded px-2 py-1"
                value={form.shot_type}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, shot_type: e.target.value }))
                }
              >
                <option>Rabies</option>
                <option>Bordetella</option>
                <option>DHPP</option>
                <option>Other</option>
              </select>
            </label>

            <label className="flex flex-col">
              Date Given
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={form.date_given}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, date_given: e.target.value }))
                }
              />
            </label>

            <label className="flex flex-col">
              Expiration Date *
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={form.date_expires}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    date_expires: e.target.value
                  }))
                }
              />
            </label>

            <label className="flex flex-col">
              Notes
              <textarea
                className="border rounded px-2 py-1"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setFormOpen(false);
                setEditMode(null);
              }}
              className="btn-secondary text-sm px-3 py-1"
            >
              Cancel
            </button>
            <button
              onClick={saveRecord}
              className="btn-primary text-sm px-3 py-1"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
