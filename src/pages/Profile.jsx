import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";
import ConfirmModal from "../components/ConfirmModal";
import VacationSection from "../components/VacationSection";
import { SERVICE_OPTIONS, DEFAULT_PRICING } from "../utils/grooming";

const SIZE_LABELS = { 1: "S/M", 2: "Large", 3: "XL" };

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
  const [maxApptsPerDay, setMaxApptsPerDay] = useState(null); // null = no limit

  // ✅ Timezone
  const [timeZone, setTimeZone] = useState("America/New_York");

  const [hours, setHours] = useState({});
  const [breaks, setBreaks] = useState({});
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaving, setHoursSaving] = useState(false);

  // ---------------- PRICING ----------------
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [pricingSaving, setPricingSaving] = useState(false);

  // ---------------- CONFIRM MODAL ----------------
  const [confirmConfig, setConfirmConfig] = useState(null);

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
        if (data.plan_tier) setPlanTier(data.plan_tier);
        setFullName(data.full_name || "");
        setSlug(data.slug || "");
        setLogoUrl(data.logo_url || null);
        setMaxParallel(data.max_parallel ?? 1);
        setMaxApptsPerDay(data.max_appts_per_day ?? null);

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
      setConfirmConfig({
        title: "File too large",
        message: "Please choose an image under 10MB.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
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
      setConfirmConfig({
        title: "Upload failed",
        message: uploadErr.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
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
        max_appts_per_day: maxApptsPerDay || null,
        time_zone: timeZone,
      })
      .eq("id", user.id);

    if (error) {
      setConfirmConfig({
        title: "Could not save",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    }

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
    setConfirmConfig({
      title: "Schedule saved ✓",
      message: "Your working hours have been updated.",
      confirmLabel: "OK",
      onConfirm: () => {},
    });
  };

  // ---------------- SAVE PRICING ----------------
  const savePricing = async () => {
    if (!user) return;
    setPricingSaving(true);
    const { error } = await supabase
      .from("groomers")
      .update({ service_pricing: pricing })
      .eq("id", user.id);
    if (error) {
      setConfirmConfig({
        title: "Could not save pricing",
        message: error.message || "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    }
    setPricingSaving(false);
  };

  // ---------------- TABS ----------------
  const [activeTab, setActiveTab] = useState("profile");
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [planTier, setPlanTier] = useState("starter");

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
    else {
      setConfirmConfig({
        title: "Could not open billing",
        message: "Please try again or contact support.",
        confirmLabel: "OK",
        onConfirm: () => {},
      });
    }
  };

  // Check for stripe=success in URL (returned from Stripe onboarding)
  // Must be before any early returns to satisfy React hooks rules
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") === "success") {
      setStripeConnected(true);
      setActiveTab("payments");
      window.history.replaceState({}, "", "/profile");
    }
  }, []);

  if (loading || hoursLoading) return <Loader />;

  // Generate 15-minute increment time options in 12-hour format
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 5; hour <= 21; hour++) {
      for (let min of [0, 15, 30, 45]) {
        const value = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour % 12 || 12;
        const label = `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  };

  const TABS = [
    { id: "profile",  emoji: "👤", label: "Profile"  },
    { id: "schedule", emoji: "🗓", label: "Schedule" },
    { id: "pricing",  emoji: "💲", label: "Pricing"  },
    { id: "smsbot",   emoji: "💬", label: planTier === "pro" ? "SMS Bot" : "SMS Bot 🔒" },
  ];

  const handleConnectStripe = async () => {
    if (!user) return;
    setStripeConnecting(true);
    setStripeError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/createConnectAccount", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
      } else {
        setStripeError(json.error || "Could not connect Stripe. Please try again.");
      }
    } catch {
      setStripeError("Network error. Please try again.");
    } finally {
      setStripeConnecting(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto p-4">
      <h1 className="text-2xl font-bold mb-3">Settings</h1>

      <TrialBanner userId={user?.id} />
      <SubscriptionStatus userId={user?.id} onManageBilling={handleManageBilling} />

      {/* TAB BAR */}
      <div className="flex mt-4 mb-6 border-b border-[var(--border-med)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1 }}
            className={`py-2.5 text-xs font-semibold transition-colors text-center border-b-2
              ${activeTab === tab.id
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]"
              }`}
          >
            <span className="block text-base leading-none mb-0.5">{tab.emoji}</span>
            <span className="block">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      {activeTab === "profile" && (
        <div className="space-y-4">

          {/* ── Account Info Card ── */}
          <AccountInfoCard userId={user?.id} planTier={planTier} onManageBilling={handleBillingPortal} />

          <div className="flex flex-col items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-24 h-24 object-cover rounded-full border" />
            ) : (
              <div className="w-24 h-24 bg-[var(--surface-2)] rounded-full flex items-center justify-center text-[var(--text-3)] text-sm">
                No Logo
              </div>
            )}
            <label className="cursor-pointer">
              <span className="border border-[var(--border-med)] rounded-xl px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-1)] text-sm font-medium transition-colors">
                Upload Logo
              </span>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Business Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="border rounded w-full p-2" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Public Booking Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, ""))}
              className="border rounded w-full p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Time Zone</label>
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="border rounded w-full p-2">
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--text-3)] mt-1">Controls booking times and "tomorrow" SMS reminders.</p>
          </div>

          <button onClick={saveProfile} disabled={saving} className="btn-primary w-full mt-2">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {activeTab === "schedule" && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-1)]">Working Hours</h2>
            <p className="text-sm text-[var(--text-3)] mt-0.5">
              Set which days you work and your start/end times. Breaks block time on the booking page.
            </p>
          </div>

          {Object.keys(hours).map((key) => {
            const dayIndex = Number(key);
            const day = hours[dayIndex];
            const dayBreaks = breaks[dayIndex] || [];

            return (
              <div
                key={dayIndex}
                className={`rounded-2xl border transition-all overflow-hidden
                  ${day.enabled
                    ? "border-emerald-200 bg-[var(--surface)] shadow-sm"
                    : "border-[var(--border-med)] bg-[var(--surface-2)] opacity-60"
                  }`}
              >
                {/* Day header row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className={`font-semibold text-sm ${day.enabled ? "text-[var(--text-1)]" : "text-[var(--text-3)]"}`}>
                    {WEEKDAYS[dayIndex]}
                  </span>

                  {/* Toggle switch */}
                  <button
                    type="button"
                    onClick={() => setHours((prev) => ({
                      ...prev,
                      [dayIndex]: { ...prev[dayIndex], enabled: !prev[dayIndex].enabled },
                    }))}
                    aria-label={day.enabled ? `Close ${WEEKDAYS[dayIndex]}` : `Open ${WEEKDAYS[dayIndex]}`}
                    className="relative flex-shrink-0"
                    style={{
                      width: 44, height: 26, borderRadius: 999,
                      backgroundColor: day.enabled ? "#10b981" : "#d1d5db",
                      border: "none", padding: 3, cursor: "pointer",
                      transition: "background-color 0.2s",
                      display: "flex", alignItems: "center",
                    }}
                  >
                    <span style={{
                      display: "block", width: 20, height: 20,
                      borderRadius: "50%", backgroundColor: "white",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      transform: day.enabled ? "translateX(18px)" : "translateX(0px)",
                      transition: "transform 0.2s",
                    }} />
                  </button>
                </div>

                {/* Expanded content when open */}
                {day.enabled && (
                  <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-med)] pt-3">

                    {/* Start / End times */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
                          Opens
                        </label>
                        <select
                          value={day.start}
                          onChange={(e) => setHours((prev) => ({
                            ...prev,
                            [dayIndex]: { ...prev[dayIndex], start: e.target.value },
                          }))}
                          className="border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm w-full bg-[var(--surface)] text-[var(--text-1)]"
                        >
                          {generateTimeOptions().map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
                          Closes
                        </label>
                        <select
                          value={day.end}
                          onChange={(e) => setHours((prev) => ({
                            ...prev,
                            [dayIndex]: { ...prev[dayIndex], end: e.target.value },
                          }))}
                          className="border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm w-full bg-[var(--surface)] text-[var(--text-1)]"
                        >
                          {generateTimeOptions().map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Breaks */}
                    {dayBreaks.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Breaks</p>
                        {dayBreaks.map((b, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={b.start}
                              onChange={(e) => setBreaks((prev) => {
                                const c = { ...prev, [dayIndex]: [...prev[dayIndex]] };
                                c[dayIndex][idx] = { ...c[dayIndex][idx], start: e.target.value };
                                return c;
                              })}
                              className="border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm flex-1 bg-[var(--surface)] text-[var(--text-1)]"
                            >
                              {generateTimeOptions().map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            <span className="text-xs text-[var(--text-3)] flex-shrink-0">to</span>
                            <select
                              value={b.end}
                              onChange={(e) => setBreaks((prev) => {
                                const c = { ...prev, [dayIndex]: [...prev[dayIndex]] };
                                c[dayIndex][idx] = { ...c[dayIndex][idx], end: e.target.value };
                                return c;
                              })}
                              className="border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm flex-1 bg-[var(--surface)] text-[var(--text-1)]"
                            >
                              {generateTimeOptions().map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setBreaks((prev) => ({
                                ...prev,
                                [dayIndex]: prev[dayIndex].filter((_, i) => i !== idx),
                              }))}
                              className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0 px-1"
                              aria-label="Remove break"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setBreaks((prev) => ({
                        ...prev,
                        [dayIndex]: [...prev[dayIndex], { start: "12:00", end: "13:00" }],
                      }))}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      + Add break
                    </button>

                    {/* Copy to other days */}
                    <div className="pt-3 border-t border-[var(--border-med)]">
                      <p className="text-xs text-[var(--text-3)] font-medium mb-2">Copy these hours to:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((name, idx) => {
                          if (idx === dayIndex) return null;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setHours((prev) => ({
                                  ...prev,
                                  [idx]: {
                                    ...prev[idx],
                                    start: day.start,
                                    end: day.end,
                                    enabled: true,
                                  },
                                }));
                                setBreaks((prev) => ({
                                  ...prev,
                                  [idx]: dayBreaks.map((b) => ({ ...b })),
                                }));
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border-med)] text-[var(--text-2)] bg-[var(--surface-2)] hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            >
                              {name.slice(0, 3)}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            const updates = {};
                            const breakUpdates = {};
                            for (let i = 0; i < 7; i++) {
                              if (i === dayIndex) continue;
                              updates[i] = {
                                ...hours[i],
                                start: day.start,
                                end: day.end,
                                enabled: true,
                              };
                              breakUpdates[i] = dayBreaks.map((b) => ({ ...b }));
                            }
                            setHours((prev) => ({ ...prev, ...updates }));
                            setBreaks((prev) => ({ ...prev, ...breakUpdates }));
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          All days
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={saveSchedule}
            disabled={hoursSaving}
            className="btn-primary w-full mt-2"
          >
            {hoursSaving ? "Saving…" : "Save Schedule"}
          </button>

          <div className="mt-4">
            <VacationSection userId={user.id} />
          </div>
        </div>
      )}

      {/* ── PRICING TAB ── */}
      {activeTab === "pricing" && (
        <div>
          <h2 className="text-lg font-bold mb-1">Service Pricing</h2>
          <p className="text-sm text-[var(--text-3)] mb-5">
            Set your default prices by service and dog size. These auto-fill when you create an appointment.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 font-semibold text-[var(--text-2)] w-32">Service</th>
                  {[1, 2, 3].map((size) => (
                    <th key={size} className="text-center py-2 px-2 font-semibold text-[var(--text-2)]">{SIZE_LABELS[size]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SERVICE_OPTIONS.map((svc) => (
                  <tr key={svc} className="border-t border-[var(--border-med)]">
                    <td className="py-2 pr-4 font-medium text-[var(--text-1)]">{svc}</td>
                    {[1, 2, 3].map((size) => (
                      <td key={size} className="py-2 px-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-3)] text-sm">$</span>
                          <input type="number" min="0" step="1" value={pricing[svc]?.[size] ?? 0}
                            onChange={(e) => setPricing((prev) => ({ ...prev, [svc]: { ...prev[svc], [size]: Number(e.target.value) || 0 } }))}
                            className="border rounded w-full pl-6 pr-2 py-1 text-center" style={{ maxWidth: 80 }} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-3">
            Multiple services are summed automatically. You can always override the amount per appointment.
          </p>
          <button onClick={savePricing} disabled={pricingSaving} className="btn-primary w-full mt-5">
            {pricingSaving ? "Saving Pricing…" : "Save Pricing"}
          </button>
        </div>
      )}

      {/* ── SMS BOT TAB ── */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-1">Client Payments</h2>
            <p className="text-sm text-[var(--text-3)] mb-5">
              Connect your Stripe account to request payment from clients after appointments. 
              Payments go directly to your Stripe account — PawScheduler takes no cut.
            </p>
          </div>

          {stripeConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-2xl">✅</div>
                <div>
                  <div className="font-semibold text-emerald-800">Stripe Connected</div>
                  <div className="text-sm text-emerald-700">You can now request payment from clients directly from the Schedule page.</div>
                </div>
              </div>
              <div className="rounded-xl border bg-[var(--surface)] p-4 space-y-3">
                <p className="font-semibold text-sm text-[var(--text-1)]">How it works</p>
                <ol className="text-sm text-[var(--text-2)] space-y-2 list-decimal ml-4">
                  <li>After an appointment, tap <strong>💳 Request Payment</strong> on the appointment card in Schedule.</li>
                  <li>PawScheduler sends the client a text + email with a secure Stripe payment link.</li>
                  <li>Client pays with card, Apple Pay, or Google Pay.</li>
                  <li>The appointment is automatically marked as paid when payment completes.</li>
                </ol>
              </div>
              <button
                type="button"
                onClick={handleConnectStripe}
                disabled={stripeConnecting}
                className="w-full py-2.5 rounded-xl border border-[var(--border-med)] text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)] transition disabled:opacity-50"
              >
                {stripeConnecting ? "Loading…" : "Update Stripe Account Settings"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border bg-[var(--surface)] p-4 space-y-3">
                <p className="font-semibold text-sm text-[var(--text-1)]">What you get</p>
                <ul className="text-sm text-[var(--text-2)] space-y-2">
                  {["Send payment requests via text + email", "Clients pay with card, Apple Pay, or Google Pay", "Payments go directly to your bank", "Appointments auto-mark as paid on payment", "No extra fees from PawScheduler"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Note:</strong> Stripe charges a standard processing fee (typically 2.9% + 30¢ per transaction). 
                This goes to Stripe, not PawScheduler.
              </div>

              {stripeError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{stripeError}</p>
              )}

              <button
                type="button"
                onClick={handleConnectStripe}
                disabled={stripeConnecting}
                className="w-full py-3.5 rounded-xl bg-[#635BFF] text-white font-bold text-sm hover:bg-[#4F46E5] transition disabled:opacity-50"
              >
                {stripeConnecting ? "Connecting…" : "💳 Connect Stripe Account"}
              </button>
              <p className="text-xs text-center text-[var(--text-3)]">
                You'll be redirected to Stripe to set up your account. Takes about 2 minutes.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "smsbot" && (
        <div>
          <h2 className="text-lg font-bold mb-1">SMS AI Scheduler</h2>
          <p className="text-sm text-[var(--text-3)] mb-5">
            Let clients book, view, and cancel appointments by texting your scheduling number. Powered by AI — no app download required.
          </p>

          {planTier !== "pro" && (
            <div className="mb-6 rounded-2xl bg-violet-50 border border-violet-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="font-bold text-violet-900">Pro Plan Required</p>
                  <p className="text-sm text-violet-700">The AI SMS bot is available on the Pro plan ($79/mo or $799/yr).</p>
                </div>
              </div>
              <a href="/upgrade"
                className="block w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold text-center hover:bg-violet-700 transition">
                Upgrade to Pro →
              </a>
            </div>
          )}

          <div className="bg-[var(--surface-2)] border border-[var(--border-med)] rounded-xl p-4 space-y-4 mb-5">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Booking Limits</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Max Dogs at Same Time</label>
              <div className="flex items-center gap-3">
                <select value={maxParallel} onChange={(e) => setMaxParallel(Number(e.target.value))} className="border border-[var(--border-med)] rounded p-2 w-28 bg-[var(--surface)] text-[var(--text-1)]">
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-sm text-[var(--text-3)]">pets simultaneously</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Appointments Per Day</label>
              <div className="flex items-center gap-3">
                <select value={maxApptsPerDay ?? ""} onChange={(e) => setMaxApptsPerDay(e.target.value === "" ? null : Number(e.target.value))} className="border border-[var(--border-med)] rounded p-2 w-28 bg-[var(--surface)] text-[var(--text-1)]">
                  <option value="">No limit</option>
                  {[2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-sm text-[var(--text-3)]">SMS bot won't book beyond this</span>
              </div>
            </div>
            <button onClick={saveProfile} disabled={saving} className="btn-primary w-full">
              {saving ? "Saving…" : "Save Limits"}
            </button>
          </div>

          <SmsBotSection userId={user?.id} />
        </div>
      )}

      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />

    </main>
  );
}

/* ---------------- SMS BOT SECTION ---------------- */
function SmsBotSection({ userId }) {
  const [botNumber, setBotNumber] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("groomers")
      .select("sms_bot_enabled, sms_bot_number, subscription_status")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        setEnabled(data?.sms_bot_enabled || false);
        setBotNumber(data?.sms_bot_number || "");
        setSubStatus(data?.subscription_status || null);
        setLoading(false);
      });
  }, [userId]);

  const handleToggle = async () => {
    if (toggling) return;
    setToggling(true);
    const newVal = !enabled;
    setEnabled(newVal);
    const { error } = await supabase
      .from("groomers")
      .update({ sms_bot_enabled: newVal })
      .eq("id", userId);
    if (error) {
      setEnabled(!newVal);
      console.error("Failed to save SMS bot setting:", error.message);
    }
    setToggling(false);
  };

  if (loading) return <p className="text-sm text-[var(--text-3)]">Loading…</p>;

  // STATE 1: Trial — locked, upsell to paid
  if (subStatus === "trial" || subStatus === null) {
    return (
      <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-5 text-center">
        <div className="text-2xl mb-2">💬</div>
        <div className="font-semibold text-[var(--text-1)] mb-1">AI SMS Scheduler</div>
        <p className="text-sm text-[var(--text-2)] mb-3">
          Included with every paid plan. Upgrade to get your dedicated scheduling
          number — clients text it to book, reschedule, or cancel anytime.
        </p>
        <a
          href="/upgrade"
          className="inline-flex items-center gap-2 text-sm bg-emerald-600 text-white
            px-4 py-2 rounded-full font-semibold hover:bg-emerald-700 transition"
        >
          Upgrade to unlock →
        </a>
      </div>
    );
  }

  // STATE 2: Paid but number not yet assigned
  if (!botNumber) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-5 text-center">
        <div className="text-2xl mb-2">⏳</div>
        <div className="font-semibold text-[var(--text-1)] mb-1">Number Being Assigned</div>
        <p className="text-sm text-[var(--text-2)] mb-2">
          Your SMS scheduling number is being set up. You’ll receive an email
          within 24 hours once it’s ready.
        </p>
        <p className="text-xs text-[var(--text-3)]">
          Questions?{" "}
          <a href="mailto:pawscheduler@gmail.com" className="text-emerald-600 underline">
            pawscheduler@gmail.com
          </a>
        </p>
      </div>
    );
  }

  // STATE 3: Active — number assigned
  return (
    <div className="space-y-4">

      {/* Toggle */}
      <div className="flex items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border-med)] rounded-xl">
        <div>
          <div className="font-semibold text-[var(--text-1)] text-sm">SMS AI Scheduler</div>
          <div className={`text-xs mt-0.5 font-medium ${enabled ? "text-emerald-600" : "text-[var(--text-3)]"}`}>
            {enabled ? "✅ Active — clients can text to book" : "⏸ Paused — bot will not respond"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          aria-label={enabled ? "Disable SMS bot" : "Enable SMS bot"}
          style={{
            width: 52, height: 32, borderRadius: 999,
            backgroundColor: enabled ? "#10b981" : "#d1d5db",
            border: "none", padding: 3,
            cursor: toggling ? "not-allowed" : "pointer",
            opacity: toggling ? 0.6 : 1,
            transition: "background-color 0.2s",
            flexShrink: 0, display: "flex", alignItems: "center",
          }}
        >
          <span style={{
            display: "block", width: 26, height: 26, borderRadius: "50%",
            backgroundColor: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transform: enabled ? "translateX(20px)" : "translateX(0px)",
            transition: "transform 0.2s",
          }} />
        </button>
      </div>

      {/* Read-only number */}
      <div>
        <label className="block text-sm font-medium mb-1 text-[var(--text-2)]">
          Your Scheduling Phone Number
        </label>
        <div className="flex items-center gap-2 border border-[var(--border-med)] rounded-lg px-3 py-2 bg-[var(--surface-2)]">
          <span className="text-sm font-mono text-[var(--text-1)] flex-1">{botNumber}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(botNumber)}
            className="text-xs text-emerald-600 font-semibold hover:underline shrink-0"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-[var(--text-3)] mt-1">
          Share this number with clients so they can text to book appointments.
        </p>
      </div>

      {/* Share text */}
      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-[var(--text-2)]">
        <div className="font-semibold mb-2 text-emerald-800">Share this with clients:</div>
        <p className="italic text-[var(--text-2)]">
          "Text <strong className="text-[var(--text-1)]">{botNumber}</strong> to book, reschedule, or cancel
          your grooming appointment anytime — day or night! 🐾"
        </p>
      </div>

    </div>
  );
}


/* ---------------- TRIAL BANNER ---------------- */
/* ---------------- ACCOUNT INFO CARD ---------------- */
function AccountInfoCard({ userId, planTier, onManageBilling }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("groomers")
      .select("full_name, email, subscription_status, plan_tier, current_period_end, cancel_at_period_end, stripe_customer_id, trial_end_date")
      .eq("id", userId)
      .single()
      .then(({ data }) => setInfo(data));
  }, [userId]);

  if (!info) return null;

  const planLabels = {
    free:    { label: "Free",    color: "bg-gray-100 text-gray-600" },
    basic:   { label: "Basic",   color: "bg-blue-100 text-blue-700" },
    starter: { label: "Starter", color: "bg-emerald-100 text-emerald-700" },
    pro:     { label: "Pro",     color: "bg-violet-100 text-violet-700" },
  };

  const plan = planLabels[info.plan_tier || "free"];

  // Days until next bill
  let billingNote = null;
  if (info.subscription_status === "active" && info.current_period_end) {
    const daysLeft = Math.ceil((new Date(info.current_period_end) - new Date()) / 86400000);
    if (info.cancel_at_period_end) {
      billingNote = `Cancels in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
    } else if (daysLeft >= 0) {
      billingNote = `Next bill in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
    }
  } else if (info.subscription_status === "trial" && info.trial_end_date) {
    const daysLeft = Math.ceil((new Date(info.trial_end_date) - new Date()) / 86400000);
    if (daysLeft > 0) {
      billingNote = `Trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
    }
  } else if (info.subscription_status === "free") {
    billingNote = "Free plan — no billing";
  }

  return (
    <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[var(--text-1)]">My Account</h3>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${plan.color}`}>
          {plan.label}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-3)]">Name</span>
          <span className="font-medium text-[var(--text-1)]">{info.full_name || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-3)]">Email</span>
          <span className="font-medium text-[var(--text-1)]">{info.email || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-3)]">Plan</span>
          <span className="font-medium text-[var(--text-1)] capitalize">{info.plan_tier || "free"}</span>
        </div>
        {billingNote && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-3)]">Billing</span>
            <span className={`font-medium ${info.cancel_at_period_end ? "text-amber-600" : "text-[var(--text-1)]"}`}>
              {billingNote}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <a href="/upgrade"
          className="flex-1 py-2 rounded-xl border border-[var(--border-med)] text-xs font-semibold text-center text-[var(--text-2)] hover:bg-[var(--surface-2)] transition">
          {info.plan_tier === "free" ? "Upgrade Plan" : "Change Plan"}
        </a>
        {info.stripe_customer_id && info.subscription_status === "active" && (
          <button onClick={onManageBilling}
            className="flex-1 py-2 rounded-xl border border-[var(--border-med)] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)] transition">
            Manage Billing
          </button>
        )}
      </div>
    </div>
  );
}

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

  if (loading) return <p className="text-[var(--text-3)]">Loading subscription…</p>;

  const sub = status.subscription_status;

  return (
    <div className="p-4 bg-[var(--surface)] border border-[var(--border-med)] rounded-xl shadow-sm mt-6">
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