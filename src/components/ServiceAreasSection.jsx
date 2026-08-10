// src/components/ServiceAreasSection.jsx
// Lets a groomer define named service areas/zones and assign which
// weekdays each one is worked. Used by the Areas tab in Profile, and
// consumed by the Schedule page's Map view to filter/color clients.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import ConfirmModal from "./ConfirmModal";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const COLOR_OPTIONS = [
  "#059669", "#2563eb", "#d97706", "#dc2626",
  "#7c3aed", "#db2777", "#0891b2", "#65a30d",
];

export default function ServiceAreasSection({ userId }) {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState(null);

  // New/editing area form state
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [days, setDays] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadAreas = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("service_areas")
      .select("*")
      .eq("groomer_id", userId)
      .order("created_at", { ascending: true });
    setAreas(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadAreas(); }, [loadAreas]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setColor(COLOR_OPTIONS[0]);
    setDays([]);
  };

  const startEdit = (area) => {
    setEditingId(area.id);
    setName(area.name);
    setColor(area.color || COLOR_OPTIONS[0]);
    setDays(area.days_of_week || []);
  };

  const toggleDay = (d) => {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const row = {
      groomer_id: userId,
      name: name.trim(),
      color,
      days_of_week: days,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      await supabase.from("service_areas").update(row).eq("id", editingId);
    } else {
      await supabase.from("service_areas").insert(row);
    }

    setSaving(false);
    resetForm();
    loadAreas();
  };

  const handleDelete = (area) => {
    setConfirmConfig({
      title: `Delete "${area.name}"?`,
      message: "Clients assigned to this area will be unassigned, not deleted. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await supabase.from("service_areas").delete().eq("id", area.id);
        loadAreas();
      },
    });
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-3)]">Loading service areas…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-1)] mb-1">Service Areas</h2>
        <p className="text-sm text-[var(--text-3)]">
          Define named zones for how you think about your territory, and which days you work each one.
          Assign clients to a zone from their client page.
        </p>
      </div>

      {/* Existing areas list */}
      {areas.length > 0 && (
        <div className="space-y-2">
          {areas.map((area) => (
            <div
              key={area.id}
              className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ background: area.color }}
                />
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-1)] truncate">{area.name}</div>
                  <div className="text-xs text-[var(--text-3)]">
                    {area.days_of_week?.length > 0
                      ? area.days_of_week
                          .slice()
                          .sort()
                          .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
                          .join(", ")
                      : "No days assigned"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => startEdit(area)}
                  className="text-xs font-semibold text-[var(--text-2)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg)]"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(area)}
                  className="text-xs font-semibold text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/edit form */}
      <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-4 space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-1)]">
          {editingId ? "Edit area" : "Add a new area"}
        </h3>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. North Side"
            className="w-full border border-[var(--border-med)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-[var(--text-1)]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 flex-shrink-0"
                style={{ background: c, borderColor: color === c ? "#111827" : "transparent" }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">Days worked</label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition
                  ${days.includes(d.value)
                    ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                    : "bg-white border-gray-200 text-gray-600"
                  }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          {editingId && (
            <button
              onClick={resetForm}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border-med)] text-[var(--text-2)] font-semibold text-sm"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : editingId ? "Save Changes" : "Add Area"}
          </button>
        </div>
      </div>

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}