import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";
import VacationSection from "../components/VacationSection";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [user, setUser] = useState(null);

  // Working hours + breaks state
  const [hours, setHours] = useState({});
  const [breaks, setBreaks] = useState({});
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaving, setHoursSaving] = useState(false);

  // ---------------- LOAD LOGGED-IN USER ----------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // ---------------- LOAD PROFILE ----------------
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setFullName(data.full_name || "");
        setSlug(data.slug || "");
        setLogoUrl(data.logo_url || null);
      }

      setLoading(false);
    };

    loadProfile();
  }, [user]);

  // ---------------- LOAD HOURS + BREAKS ----------------
  const loadSchedule = useCallback(async () => {
    if (!user) return;

    setHoursLoading(true);

    const { data: hrs } = await supabase
      .from("working_hours")
      .select("*")
      .eq("groomer_id", user.id);

    const { data: brk } = await supabase
      .from("working_breaks")
      .select("*")
      .eq("groomer_id", user.id);

    const newHours = {};
    const newBreaks = {};

    for (let i = 0; i < 7; i++) {
      const day = hrs?.find((h) => h.weekday === i);

      newHours[i] = day
        ? {
            start: day.start_time,
            end: day.end_time,
            enabled: true,
          }
        : {
            start: "09:00",
            end: "17:00",
            enabled: false,
          };

      newBreaks[i] =
        brk
          ?.filter((b) => b.weekday === i)
          .map((b) => ({
            id: b.id,
            start: b.break_start,
            end: b.break_end,
          })) || [];
    }

    setHours(newHours);
    setBreaks(newBreaks);
    setHoursLoading(false);
  }, [user]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // ---------------- LOGO UPLOAD ----------------
  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    if (file.size > 1024 * 1024) {
      alert("Logo must be under 1MB.");
      return;
    }

    setSaving(true);

    const ext = file.name.split(".").pop();
    const fileName = `${user.id}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("logos")
      .upload(fileName, file, { upsert: true });

    if (uploadErr) {
      alert("Upload failed: " + uploadErr.message);
      setSaving(false);
      return;
    }

    const { data } = supabase.storage.from("logos").getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    await supabase
      .from("groomers")
      .update({ logo_url: publicUrl })
      .eq("id", user.id);

    setLogoUrl(publicUrl);
    setSaving(false);
  };

  // ---------------- SAVE PROFILE FIELDS ----------------
  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    const cleanSlug = slug.toLowerCase().replace(/\s+/g, "");

    await supabase
      .from("groomers")
      .update({
        full_name: fullName,
        slug: cleanSlug,
      })
      .eq("id", user.id);

    setSaving(false);
  };

  // ---------------- SAVE HOURS + BREAKS ----------------
  const saveSchedule = async () => {
    if (!user) return;
    setHoursSaving(true);

    await supabase.from("working_hours").delete().eq("groomer_id", user.id);
    await supabase.from("working_breaks").delete().eq("groomer_id", user.id);

    const hoursToInsert = [];
    const breaksToInsert = [];

    for (let i = 0; i < 7; i++) {
      if (hours[i].enabled) {
        hoursToInsert.push({
          groomer_id: user.id,
          weekday: i,
          start_time: hours[i].start,
          end_time: hours[i].end,
        });
      }

      breaks[i].forEach((b) => {
        breaksToInsert.push({
          groomer_id: user.id,
          weekday: i,
          break_start: b.start,
          break_end: b.end,
        });
      });
    }

    if (hoursToInsert.length > 0) {
      await supabase.from("working_hours").insert(hoursToInsert);
    }

    if (breaksToInsert.length > 0) {
      await supabase.from("working_breaks").insert(breaksToInsert);
    }

    setHoursSaving(false);
    alert("Schedule saved!");
  };

  if (loading || hoursLoading) return <Loader />;

  return (
    <main className="max-w-lg mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-bold">Your Profile</h1>

      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo"
          className="w-32 h-32 object-cover rounded-full border mx-auto"
        />
      ) : (
        <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto flex items-center justify-center text-gray-600">
          No Logo
        </div>
      )}

      <label className="block text-sm font-medium mt-4">Upload Logo</label>
      <input type="file" accept="image/*" onChange={handleLogoChange} />

      <label className="block mt-4 font-medium">Business Name</label>
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="border rounded w-full p-2"
      />

      <label className="block mt-4 font-medium">Public Booking Slug</label>
      <input
        value={slug}
        onChange={(e) =>
          setSlug(e.target.value.toLowerCase().replace(/\s+/g, ""))
        }
        className="border rounded w-full p-2"
      />

      <button
        onClick={saveProfile}
        disabled={saving}
        className="btn-primary w-full mt-4"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>

      {/* ------------------------------------------- */}
      {/*             WORKING HOURS SECTION            */}
      {/* ------------------------------------------- */}

      <section className="mt-10 border-t pt-8">
        <h2 className="text-xl font-bold mb-4">Working Hours</h2>

        {Object.keys(hours).map((key) => {
          const dayIndex = Number(key);
          return (
            <div key={dayIndex} className="border p-4 rounded mb-4 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{WEEKDAYS[dayIndex]}</h3>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={hours[dayIndex].enabled}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [dayIndex]: {
                          ...prev[dayIndex],
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span className="text-sm">Open</span>
                </label>
              </div>

              {hours[dayIndex].enabled && (
                <>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="text-sm">Start</label>
                      <input
                        type="time"
                        value={hours[dayIndex].start}
                        onChange={(e) =>
                          setHours((prev) => ({
                            ...prev,
                            [dayIndex]: {
                              ...prev[dayIndex],
                              start: e.target.value,
                            },
                          }))
                        }
                        className="border rounded w-full p-2"
                      />
                    </div>

                    <div>
                      <label className="text-sm">End</label>
                      <input
                        type="time"
                        value={hours[dayIndex].end}
                        onChange={(e) =>
                          setHours((prev) => ({
                            ...prev,
                            [dayIndex]: {
                              ...prev[dayIndex],
                              end: e.target.value,
                            },
                          }))
                        }
                        className="border rounded w-full p-2"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-sm font-medium">Breaks</h4>

                    {breaks[dayIndex].map((b, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-3 gap-3 mt-2 items-center"
                      >
                        <input
                          type="time"
                          value={b.start}
                          onChange={(e) =>
                            setBreaks((prev) => {
                              const copy = { ...prev };
                              copy[dayIndex][idx].start = e.target.value;
                              return copy;
                            })
                          }
                          className="border rounded p-2"
                        />

                        <input
                          type="time"
                          value={b.end}
                          onChange={(e) =>
                            setBreaks((prev) => {
                              const copy = { ...prev };
                              copy[dayIndex][idx].end = e.target.value;
                              return copy;
                            })
                          }
                          className="border rounded p-2"
                        />

                        <button
                          className="text-red-600"
                          onClick={() =>
                            setBreaks((prev) => {
                              const updated = { ...prev };
                              updated[dayIndex] = updated[dayIndex].filter(
                                (_, i) => i !== idx
                              );
                              return updated;
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}

                    <button
                      className="mt-2 text-blue-600"
                      onClick={() =>
                        setBreaks((prev) => ({
                          ...prev,
                          [dayIndex]: [
                            ...prev[dayIndex],
                            { start: "12:00", end: "12:30" },
                          ],
                        }))
                      }
                    >
                      ➕ Add Break
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Save hours BEFORE vacations */}
        <button
          onClick={saveSchedule}
          disabled={hoursSaving}
          className="btn-primary w-full mt-6"
        >
          {hoursSaving ? "Saving Schedule…" : "Save Schedule"}
        </button>

        {/* VACATION SECTION */}
        <VacationSection userId={user.id} />
      </section>
    </main>
  );
}
