import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";
import VacationSection from "../components/VacationSection";

const SERVICE_OPTIONS = [
  "Bath",
  "Full Groom",
  "Nails",
  "Teeth",
  "Deshed",
  "Anal Glands",
  "Puppy Trim",
  "Other",
];

const SIZE_LABELS = { 1: "S/M", 2: "Large", 3: "XL" };

const DEFAULT_PRICING = {
  "Bath":        { 1: 25, 2: 40, 3: 60 },
  "Full Groom":  { 1: 45, 2: 65, 3: 90 },
  "Nails":       { 1: 15, 2: 15, 3: 20 },
  "Teeth":       { 1: 15, 2: 15, 3: 20 },
  "Deshed":      { 1: 35, 2: 55, 3: 75 },
  "Anal Glands": { 1: 15, 2: 15, 3: 20 },
  "Puppy Trim":  { 1: 40, 2: 55, 3: 75 },
  "Other":       { 1: 0,  2: 0,  3: 0  },
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Keep it simple + safe (covers almost all US groomers)
const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET) — America/New_York" },
  { value: "America/Chicago", label: "Central (CT) — America/Chicago" },
  { value: "America/Denver", label: "Mountain (MT) — America/Denver" },
  { value: "America/Phoenix", label: "Arizona (MST) — America/Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific (PT) — America/Los_Angeles" },
  { value: "America/Anchorage", label: "Alaska — America/Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Pacific/Honolulu" },
];

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [user, setUser] = useState(null);
  const [maxParallel, setMaxParallel] = useState(1);

  // ✅ Timezone
  const [timeZone, setTimeZone] = useState("America/New_York");

  const [hours, setHours] = useState({});
  const [breaks, setBreaks] = useState({});
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaving, setHoursSaving] = useState(false);

  // ---------------- PRICING ----------------
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [pricingSaving, setPricingSaving] = useState(false);

  // ---------------- LOAD USER ----------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
  }, []);

  // ---------------- LOAD PROFILE ----------------
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      const { data } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setFullName(data.full_name || "");
        setSlug(data.slug || "");
        setLogoUrl(data.logo_url || null);
        setMaxParallel(data.max_parallel ?? 1);

        // Load service pricing — merge with defaults so new services always have a price
        if (data.service_pricing) {
          const merged = { ...DEFAULT_PRICING };
          Object.keys(data.service_pricing).forEach((svc) => {
            merged[svc] = { ...DEFAULT_PRICING[svc], ...data.service_pricing[svc] };
          });
          setPricing(merged);
        }

        // ✅ Load timezone; if missing, auto-detect and save once
        if (data.time_zone) {
          setTimeZone(data.time_zone);
        } else {
          const detected =
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "America/New_York";
          setTimeZone(detected);

          // best-effort backfill (ignore errors)
          await supabase
            .from("groomers")
            .update({ time_zone: detected })
            .eq("id", user.id)
            .is("time_zone", null);
        }
      }

      setLoading(false);
    };

    loadProfile();
  }, [user]);

  // ---------------- LOAD SCHEDULE ----------------
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
        ? { start: day.start_time, end: day.end_time, enabled: true }
        : { start: "09:00", end: "17:00", enabled: false };

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

    if (file.size > 10 * 1024 * 1024) {
      alert("Image too large. Max 10MB.");
      return;
    }

    setSaving(true);

    const convertToPng = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        const img = new Image();

        reader.onload = (ev) => (img.src = ev.target.result);

        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              resolve(new File([blob], "logo.png", { type: "image/png" }));
            },
            "image/png",
            1.0
          );
        };

        reader.readAsDataURL(file);
      });
    };

    const pngFile = await convertToPng(file);
    const filePath = `${user.id}/logo.png`;

    const { error: uploadErr } = await supabase.storage
      .from("logos")
      .upload(filePath, pngFile, {
        upsert: true,
        contentType: "image/png",
      });

    if (uploadErr) {
      alert("Upload failed: " + uploadErr.message);
      setSaving(false);
      return;
    }

    const { data: publicData } = supabase.storage
      .from("logos")
      .getPublicUrl(filePath);

    const publicUrl = publicData.publicUrl + "?v=" + Date.now();

    await supabase.from("groomers").update({ logo_url: publicUrl }).eq("id", user.id);

    setLogoUrl(publicUrl);
    setSaving(false);
  };

  // ---------------- SAVE PROFILE ----------------
  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    const cleanSlug = slug.toLowerCase().replace(/\s+/g, "");

    const { error } = await supabase
      .from("groomers")
      .update({
        full_name: fullName,
        slug: cleanSlug,
        max_parallel: maxParallel,
        time_zone: timeZone, // ✅ Save timezone
      })
      .eq("id", user.id);

    if (error) alert("Failed to save profile: " + error.message);

    setSaving(false);
  };

  // ---------------- SAVE HOURS ----------------
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

      breaks[i].forEach((b) =>
        breaksToInsert.push({
          groomer_id: user.id,
          weekday: i,
          break_start: b.start,
          break_end: b.end,
        })
      );
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

  // ---------------- SAVE PRICING ----------------
  const savePricing = async () => {
    if (!user) return;
    setPricingSaving(true);
    const { error } = await supabase
      .from("groomers")
      .update({ service_pricing: pricing })
      .eq("id", user.id);
    if (error) alert("Failed to save pricing: " + error.message);
    setPricingSaving(false);
  };

  // ---------------- BILLING PORTAL ----------------
  const handleManageBilling = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const resp = await fetch("/.netlify/functions/billingPortal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        returnUrl: window.location.origin + "/profile",
      }),
    });

    const json = await resp.json();
    if (json.url) window.location.href = json.url;
    else alert("Unable to open billing portal.");
  };

  if (loading || hoursLoading) return <Loader />;

  return (
    <main className="max-w-lg mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-bold">Your Profile</h1>

      {/* TRIAL COUNTDOWN */}
      <TrialBanner userId={user?.id} />

      {/* SUBSCRIPTION STATUS BOX */}
      <SubscriptionStatus userId={user?.id} onManageBilling={handleManageBilling} />

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

      {/* ✅ TIME ZONE DROPDOWN */}
      <label className="block mt-4 font-medium">Time Zone</label>
      <select
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        className="border rounded w-full p-2"
      >
        {TIMEZONE_OPTIONS.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
      <div className="text-xs text-gray-500 mt-1">
        This controls your booking times and “tomorrow” SMS reminders.
      </div>

      <label className="block mt-4 font-medium">Public Booking Slug</label>
      <label className="block mt-4 font-medium">Max Dogs at Same Time</label>
      <div className="flex items-center gap-3">
        <select
          value={maxParallel}
          onChange={(e) => setMaxParallel(Number(e.target.value))}
          className="border rounded p-2 w-32"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-600">
          (Total pets you can groom simultaneously)
        </span>
      </div>

      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, ""))}
        className="border rounded w-full p-2"
      />

      <button onClick={saveProfile} disabled={saving} className="btn-primary w-full mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>

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
                      <div key={idx} className="grid grid-cols-3 gap-3 mt-2 items-center">
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
                              const copy = { ...prev };
                              copy[dayIndex] = copy[dayIndex].filter((_, i) => i !== idx);
                              return copy;
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
                          [dayIndex]: [...prev[dayIndex], { start: "12:00", end: "12:30" }],
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

        <button
          onClick={saveSchedule}
          disabled={hoursSaving}
          className="btn-primary w-full mt-6"
        >
          {hoursSaving ? "Saving Schedule…" : "Save Schedule"}
        </button>

        <VacationSection userId={user.id} />
      </section>

      {/* ===== SERVICE PRICING ===== */}
      <section className="border-t pt-8">
        <h2 className="text-xl font-bold mb-1">Service Pricing</h2>
        <p className="text-sm text-gray-500 mb-5">
          Set your default prices by service and dog size. These auto-fill the
          amount when you create an appointment.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left py-2 pr-4 font-semibold text-gray-700 w-32">
                  Service
                </th>
                {[1, 2, 3].map((size) => (
                  <th key={size} className="text-center py-2 px-2 font-semibold text-gray-700">
                    {SIZE_LABELS[size]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICE_OPTIONS.map((svc) => (
                <tr key={svc} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-800">{svc}</td>
                  {[1, 2, 3].map((size) => (
                    <td key={size} className="py-2 px-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={pricing[svc]?.[size] ?? 0}
                          onChange={(e) =>
                            setPricing((prev) => ({
                              ...prev,
                              [svc]: {
                                ...prev[svc],
                                [size]: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="border rounded w-full pl-6 pr-2 py-1 text-center"
                          style={{ maxWidth: 80 }}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          When multiple services are selected on an appointment, prices are summed automatically.
          You can always override the amount on any individual appointment.
        </p>

        <button
          onClick={savePricing}
          disabled={pricingSaving}
          className="btn-primary w-full mt-5"
        >
          {pricingSaving ? "Saving Pricing…" : "Save Pricing"}
        </button>
      </section>

      {/* ===== SMS AI SCHEDULER ===== */}
      <section className="border-t pt-8">
        <h2 className="text-xl font-bold mb-1">SMS AI Scheduler</h2>
        <p className="text-sm text-gray-500 mb-5">
          Let clients book, view, and cancel appointments by texting your
          scheduling number. Powered by AI — no app download required.
        </p>

        <SmsBotSection userId={user?.id} />
      </section>
    </main>
  );
}

/* ---------------- SMS BOT SECTION ---------------- */
function SmsBotSection({ userId }) {
  const [enabled, setEnabled] = useState(null);
  const [botNumber, setBotNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("groomers")
      .select("sms_bot_enabled, sms_bot_number")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        setEnabled(data?.sms_bot_enabled || false);
        setBotNumber(data?.sms_bot_number || "");
        setLoading(false);
      });
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("groomers")
      .update({ sms_bot_number: botNumber.trim() || null })
      .eq("id", userId);
    setSaving(false);
    alert("Saved!");
  };

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
        <div className="text-2xl mb-2">💬</div>
        <div className="font-semibold text-gray-800 mb-1">
          SMS AI Scheduler
        </div>
        <p className="text-sm text-gray-500 mb-3">
          This is a premium add-on ($10/mo). Contact{" "}
          <a href="mailto:pawscheduler@gmail.com" className="text-emerald-600 underline">
            pawscheduler@gmail.com
          </a>{" "}
          to enable it for your account.
        </p>
        <div className="inline-flex items-center gap-2 text-xs bg-gray-200 text-gray-600
          px-3 py-1.5 rounded-full font-semibold">
          🔒 Not enabled
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200
        rounded-xl text-sm text-emerald-800 font-semibold">
        ✅ SMS AI Scheduler is active on your account
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Your Scheduling Phone Number
        </label>
        <input
          value={botNumber}
          onChange={(e) => setBotNumber(e.target.value)}
          placeholder="+18005551234"
          className="border rounded w-full p-2"
        />
        <p className="text-xs text-gray-500 mt-1">
          Share this number with clients so they can text to book appointments.
        </p>
      </div>

      {botNumber && (
        <div className="rounded-xl bg-gray-50 border p-4 text-sm text-gray-700">
          <div className="font-semibold mb-2">Share this with clients:</div>
          <p className="italic">
            "Text <strong>{botNumber}</strong> to book, reschedule, or cancel
            your grooming appointment anytime!"
          </p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? "Saving…" : "Save Number"}
      </button>
    </div>
  );
}

/* ---------------- TRIAL BANNER ---------------- */
function TrialBanner({ userId }) {
  const [daysLeft, setDaysLeft] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("groomers")
        .select("trial_end_date, subscription_status")
        .eq("id", userId)
        .single();

      if (!data) return;

      setStatus(data.subscription_status);

      const now = new Date();
      const end = new Date(data.trial_end_date);
      const diff = Math.ceil((end - now) / 86400000);

      setDaysLeft(diff);
    };

    load();
  }, [userId]);

  if (!status) return null;

  if (status === "trial" && daysLeft < 0) {
    return (
      <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4 font-semibold">
        🚫 Your trial has ended — please{" "}
        <a href="/upgrade" className="underline font-bold">
          upgrade to continue
        </a>
        .
      </div>
    );
  }

  if (status === "trial" && daysLeft >= 0) {
    return (
      <div className="bg-yellow-100 text-yellow-800 p-3 rounded-md mb-4 font-semibold">
        ⏳ Your trial ends in <strong>{daysLeft}</strong> days.{" "}
        <a href="/upgrade" className="underline font-bold">
          Upgrade now →
        </a>
      </div>
    );
  }

  return null;
}

/* ---------------- SUBSCRIPTION STATUS ---------------- */
function SubscriptionStatus({ userId, onManageBilling }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      const { data } = await supabase
        .from("groomers")
        .select("subscription_status, cancel_at_period_end")
        .eq("id", userId)
        .single();

      setStatus(data);
      setLoading(false);
    };

    loadStatus();
  }, [userId]);

  if (loading) return <p className="text-gray-500">Loading subscription…</p>;

  const sub = status.subscription_status;

  return (
    <div className="p-4 bg-white border rounded-xl shadow-sm mt-6">
      <h3 className="text-lg font-semibold mb-2">Subscription</h3>

      {sub === "active" && (
        <div className="bg-emerald-50 text-emerald-700 px-3 py-2 rounded-md font-semibold inline-block mb-3">
          ✔ Active Subscription
        </div>
      )}

      {sub === "active" && (
        <button onClick={onManageBilling} className="btn-primary w-full mt-3">
          Manage Billing
        </button>
      )}

      {sub === "trial" && (
        <a href="/upgrade" className="btn-primary w-full mt-3 text-center block">
          Upgrade Now
        </a>
      )}

      {sub === "expired" && (
        <a href="/upgrade" className="btn-primary w-full mt-3 text-center block">
          Renew Subscription
        </a>
      )}
    </div>
  );
}