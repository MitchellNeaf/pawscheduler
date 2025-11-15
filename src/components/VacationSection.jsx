import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export default function VacationSection({ userId }) {
  const [vacations, setVacations] = useState([]);
  const [loading, setLoading] = useState(true);

  // New vacation form
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  // --------------------------
  // CLEAN loadVacations (useCallback fixes ESLint)
  // --------------------------
  const loadVacations = useCallback(async () => {
    if (!userId) return;

    setLoading(true);

    const { data } = await supabase
      .from("vacation_days")
      .select("*")
      .eq("groomer_id", userId)
      .order("date", { ascending: true });

    setVacations(data || []);
    setLoading(false);
  }, [userId]);

  // --------------------------
  // useEffect with correct dependencies
  // --------------------------
  useEffect(() => {
    loadVacations();
  }, [loadVacations]);

  // --------------------------
  // ADD VACATION
  // --------------------------
  const addVacation = async () => {
    if (!rangeStart) return alert("Please select a start date.");

    const start = new Date(rangeStart);
    const end = rangeEnd ? new Date(rangeEnd) : new Date(rangeStart);

    if (end < start) return alert("End date cannot be before start date.");

    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push({
        groomer_id: userId,
        date: d.toISOString().split("T")[0],
        start_time: startTime || null,
        end_time: endTime || null,
        reason: reason || null,
      });
    }

    const { error } = await supabase.from("vacation_days").insert(days);

    if (error) {
      alert(error.message);
      return;
    }

    // Reset form
    setRangeStart("");
    setRangeEnd("");
    setStartTime("");
    setEndTime("");
    setReason("");

    loadVacations();
  };

  // --------------------------
  // DELETE VACATION
  // --------------------------
  const deleteVacation = async (id) => {
    await supabase.from("vacation_days").delete().eq("id", id);
    loadVacations();
  };

  // --------------------------
  // RENDER
  // --------------------------
  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="text-xl font-bold mb-4">Vacation / Days Off</h2>

      <div className="bg-gray-50 p-4 rounded mb-6 space-y-4">
        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Start Date</label>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="border rounded w-full p-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium">End Date (optional)</label>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="border rounded w-full p-2"
            />
          </div>
        </div>

        {/* Partial-day time range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Off Start Time (optional)</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="border rounded w-full p-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Off End Time (optional)</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="border rounded w-full p-2"
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="text-sm font-medium">Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="border rounded w-full p-2"
            placeholder="Vacation, holiday, trip, etc..."
          />
        </div>

        <button
          onClick={addVacation}
          className="px-4 py-2 bg-blue-600 text-white rounded mt-2"
        >
          Add Vacation
        </button>
      </div>

      {/* Vacation List */}
      <h3 className="text-lg font-semibold mb-2">Scheduled Days Off</h3>

      {loading ? (
        <div>Loading…</div>
      ) : vacations.length === 0 ? (
        <div className="text-gray-600">No vacation days added.</div>
      ) : (
        <ul className="space-y-3">
          {vacations.map((v) => (
            <li
              key={v.id}
              className="border p-3 rounded flex justify-between items-center"
            >
              <div>
                <div className="font-medium">{v.date}</div>

                {v.start_time && v.end_time ? (
                  <div className="text-sm text-gray-600">
                    Off from {v.start_time} to {v.end_time}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">Full Day Off</div>
                )}

                {v.reason && (
                  <div className="text-sm italic text-gray-500">{v.reason}</div>
                )}
              </div>

              <button
                onClick={() => deleteVacation(v.id)}
                className="text-red-600 text-sm"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
