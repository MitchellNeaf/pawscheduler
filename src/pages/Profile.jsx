import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import Loader from "../components/Loader";
import ConfirmModal from "../components/ConfirmModal";
import VacationSection from "../components/VacationSection";
import { SERVICE_OPTIONS, DEFAULT_PRICING } from "../utils/grooming";


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

// Default intake form questions — mirrors the fields already in Intake.jsx
// These are shown in the Profile intake editor as the starting point.
// type: "text" | "textarea" | "yesno"
const DEFAULT_INTAKE_QUESTIONS = [
  { id: "q1", label: "Does your dog have any medical conditions or health concerns we should know about?", type: "textarea", required: false },
  { id: "q2", label: "Is your dog up to date on all vaccinations?", type: "yesno", required: true },
  { id: "q3", label: "Has your dog ever been aggressive or bitten anyone during grooming?", type: "yesno", required: true },
  { id: "q4", label: "Is your dog on any medications?", type: "yesno", required: false },
  { id: "q5", label: "Are there any areas of your dog's body that are sensitive or should be avoided?", type: "textarea", required: false },
  { id: "q6", label: "How does your dog typically behave during baths and grooming?", type: "textarea", required: false },
  { id: "q7", label: "Any special instructions or preferences for this grooming visit?", type: "textarea", required: false },
];

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [slug, setSlug] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
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
        if (data.reminder_message_template) setReminderTemplate(data.reminder_message_template || "");
        if (data.sms_confirmation_template) setConfirmationTemplate(data.sms_confirmation_template || "");
        if (data.reminder_rules) setReminderRules(data.reminder_rules);
        if (data.custom_services) {
          setCustomServices(data.custom_services);
        } else {
          // Initialize from defaults
          const merged = { ...DEFAULT_PRICING, ...(data.service_pricing || {}) };
          setCustomServices(SERVICE_OPTIONS.map(name => ({
            name,
            pricing: merged[name] || { 1: 0, 2: 0, 3: 0, 4: 0 },
          })));
        }
        setBookingRequiresApproval(data.booking_requires_approval || false);
        setBookingEnabled(data.booking_enabled !== false); // default true if null
        setFullName(data.full_name || "");
        setBio(data.bio || "");
        setSlug(data.slug || "");
        setLogoUrl(data.logo_url || null);
        setMaxParallel(data.max_parallel ?? 1);
        setMaxApptsPerDay(data.max_appts_per_day ?? null);

        setCustomAddons(data.custom_addons || []);
        setCustomFees(data.custom_fees || []);

        // Load custom intake questions; seed defaults if never set
        if (data.custom_intake_questions) {
          setCustomIntakeQuestions(data.custom_intake_questions);
        } else {
          setCustomIntakeQuestions(DEFAULT_INTAKE_QUESTIONS);
        }

        // Load waiver text
        setWaiverText(data.waiver_text || "");
        setBrandColor(data.brand_color || "forest");

        // Load service pricing — merge with defaults so new services always have a price
        // (custom_services handles the editor, this is legacy support)

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
        bio: bio.trim() || null,
        slug: cleanSlug,
        max_parallel: maxParallel,
        max_appts_per_day: maxApptsPerDay || null,
        time_zone: timeZone,
        booking_requires_approval: bookingRequiresApproval,
        booking_enabled: bookingEnabled,
        reminder_message_template: reminderTemplate.trim() || null,
        sms_confirmation_template: confirmationTemplate.trim() || null,
        reminder_rules: reminderRules.length ? reminderRules : [48],
        custom_services: customServices,
        brand_color: brandColor || "forest",
        waiver_text: waiverText.trim() || null,
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

  // ---------------- TABS ----------------
  const [activeTab, setActiveTab] = useState("profile");
  const tabBarRef = useRef(null);
  const [tabBarHasOverflow, setTabBarHasOverflow] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [reminderTemplate, setReminderTemplate] = useState("");
  const [confirmationTemplate, setConfirmationTemplate] = useState("");
  const [reminderRules, setReminderRules] = useState([48, 2]); // hours before appointment
  const [customServices, setCustomServices] = useState(null);
  const [customAddons, setCustomAddons] = useState([]);
  const [customFees, setCustomFees] = useState([]);
  const [bookingRequiresApproval, setBookingRequiresApproval] = useState(false);
  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [stripeError, setStripeError] = useState("");
  const [planTier, setPlanTier] = useState("free"); // defaults to most restricted until loaded
  const [customIntakeQuestions, setCustomIntakeQuestions] = useState(null);
  const [waiverText, setWaiverText] = useState("");
  const [brandColor, setBrandColor] = useState("forest");
  const [savingIntake, setSavingIntake] = useState(false);

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

  // Track whether the tab bar has more content to scroll to,
  // so the fade/chevron hint only shows when it's actually useful.
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;

    const checkOverflow = () => {
      const hasMore = el.scrollWidth - el.scrollLeft - el.clientWidth > 4;
      setTabBarHasOverflow(hasMore);
    };

    checkOverflow();
    el.addEventListener("scroll", checkOverflow);
    window.addEventListener("resize", checkOverflow);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [loading]);

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
    { id: "profile",   emoji: "👤", label: "Profile"  },
    { id: "booking",   emoji: "🎨", label: "Booking Page" },
    { id: "schedule",  emoji: "🗓", label: "Schedule" },
    { id: "pricing",   emoji: "💲", label: "Pricing"  },
    { id: "reminders", emoji: "🔔", label: (planTier === "basic" || planTier === "growth" || planTier === "pro") ? "Reminders" : "Reminders 🔒" },
    { id: "intake",    emoji: "📋", label: (planTier === "growth" || planTier === "pro") ? "Intake" : "Intake 🔒" },
    { id: "payments",  emoji: "💳", label: planTier === "pro" ? "Payments" : "Payments 🔒" },
    { id: "smsbot",    emoji: "💬", label: planTier === "pro" ? "SMS Bot" : "SMS Bot 🔒" },
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
      <div className="relative mt-4 mb-6">
        <div ref={tabBarRef} className="flex border-b border-[var(--border-med)] overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{ minWidth: 76, flexShrink: 0 }}
              className={`py-2.5 px-1 text-xs font-semibold transition-colors text-center border-b-2 whitespace-nowrap
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
        {/* Fade + chevron hint that the tab bar scrolls — only shown while there's more to scroll to */}
        {tabBarHasOverflow && (
          <div
            className="pointer-events-none absolute top-0 right-0 h-full w-10 flex items-center justify-end animate-pulse"
            style={{ background: "linear-gradient(to right, transparent, var(--bg) 70%)" }}
          >
            <span className="text-[var(--text-3)] text-base pr-0.5">›</span>
          </div>
        )}
      </div>

      {/* ── PROFILE TAB ── */}
      {activeTab === "profile" && (
        <div className="space-y-4">

          {/* ── Account Info Card ── */}
          <AccountInfoCard userId={user?.id} planTier={planTier} onManageBilling={handleManageBilling} />

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
            <label className="block text-sm font-medium mb-1">Bio / About</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="A short description of your grooming business — experience, specialties, location, etc. This appears on your public booking page."
              className="border rounded w-full p-2 text-sm resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">Shown publicly on your booking page below your name.</p>
          </div>

                    {/* Booking Approval */}
          <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-1)] text-sm">Require Booking Approval</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">Clients submit a request instead of booking directly. You approve or decline from your schedule.</p>
              </div>
              <button
                onClick={() => setBookingRequiresApproval(prev => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${bookingRequiresApproval ? "bg-emerald-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${bookingRequiresApproval ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* ── SMS REMINDERS & CONFIRMATIONS — Basic+ ── */}
          {(planTier === "basic" || planTier === "growth" || planTier === "pro") ? (
          <>
          {/* ── SECTION 1: 48hr Confirmation (fixed timing, editable message) ── */}
          <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[var(--text-1)] text-sm">48hr Confirmation Request</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  Automatically sent 48 hours before every appointment. Timing is fixed — customize the wording below. Always includes a confirm link.
                </p>
              </div>
              <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 whitespace-nowrap">
                Always 48hrs
              </span>
            </div>

            {(() => {
              const TOKENS = [
                { label: "First name", value: "%first_name%" },
                { label: "Pet", value: "%pet%" },
                { label: "Date", value: "%date%" },
                { label: "Time", value: "%time%" },
                { label: "Services", value: "%services%" },
                { label: "Confirm link", value: "%confirm_link%" },
                { label: "Business name", value: "%business_name%" },
              ];

              const insertToken = (textareaId, token, getValue, setValue) => {
                const el = document.getElementById(textareaId);
                if (!el) return;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const next = getValue().slice(0, start) + token + getValue().slice(end);
                setValue(next);
                setTimeout(() => {
                  el.focus();
                  el.setSelectionRange(start + token.length, start + token.length);
                }, 0);
              };

              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TOKENS.map((t) => (
                      <button key={t.value} type="button"
                        onClick={() => insertToken("confirm-template-input", t.value, () => confirmationTemplate, setConfirmationTemplate)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition">
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="confirm-template-input"
                    rows={3}
                    value={confirmationTemplate}
                    onChange={(e) => setConfirmationTemplate(e.target.value)}
                    placeholder={`Hi %first_name%, please confirm %pet%'s appointment on %date% at %time%: %confirm_link%`}
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm resize-none bg-[var(--bg)] text-[var(--text-1)]"
                  />
                  <p className="text-[11px] text-[var(--text-3)]">
                    Leave blank for the default. The %confirm_link% token is always appended if not included.
                  </p>
                </div>
              );
            })()}
          </div>

          {/* ── SECTION 2: Custom Reminders (configurable timing + message) ── */}
          <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-4">
            <div>
              <h3 className="font-bold text-[var(--text-1)] text-sm">Reminders</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">
                Set when reminders fire and customize the message. Add %confirm_link% to any reminder if you want clients to be able to confirm from it too.
              </p>
            </div>

            {(() => {
              const TOKENS = [
                { label: "First name", value: "%first_name%" },
                { label: "Pet", value: "%pet%" },
                { label: "Date", value: "%date%" },
                { label: "Time", value: "%time%" },
                { label: "Services", value: "%services%" },
                { label: "Confirm link", value: "%confirm_link%" },
                { label: "Business name", value: "%business_name%" },
              ];

              const insertToken = (token) => {
                const el = document.getElementById("reminder-template-input");
                if (!el) return;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const next = reminderTemplate.slice(0, start) + token + reminderTemplate.slice(end);
                setReminderTemplate(next);
                setTimeout(() => {
                  el.focus();
                  el.setSelectionRange(start + token.length, start + token.length);
                }, 0);
              };

              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TOKENS.map((t) => (
                      <button key={t.value} type="button"
                        onClick={() => insertToken(t.value)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition">
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="reminder-template-input"
                    rows={3}
                    value={reminderTemplate}
                    onChange={(e) => setReminderTemplate(e.target.value)}
                    placeholder={`Hi %first_name%, just a reminder that %pet% has a grooming appointment on %date% at %time%. Reply STOP to opt out.`}
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm resize-none bg-[var(--bg)] text-[var(--text-1)]"
                  />
                  <p className="text-[11px] text-[var(--text-3)]">Leave blank for the default wording.</p>
                </div>
              );
            })()}

            {/* Timing rules */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-med)]">
              <div>
                <h4 className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wide">Send at</h4>
                <p className="text-[11px] text-[var(--text-3)] mt-0.5">Each rule fires once at that many hours before the appointment.</p>
              </div>
              <div className="space-y-2">
                {reminderRules.map((hrs, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="number" min={1} max={168}
                      value={hrs}
                      onChange={(e) => {
                        const updated = [...reminderRules];
                        updated[i] = Number(e.target.value) || 1;
                        setReminderRules(updated);
                      }}
                      className="w-20 border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm bg-[var(--bg)] text-[var(--text-1)] text-center"
                    />
                    <span className="text-sm text-[var(--text-2)]">hours before</span>
                    <button
                      type="button"
                      disabled={reminderRules.length <= 1}
                      onClick={() => setReminderRules(prev => prev.filter((_, idx) => idx !== i))}
                      className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
                    >✕</button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setReminderRules(prev => [...prev, 2])}
                className="text-sm px-3 py-1.5 rounded-xl border border-dashed border-[var(--border-med)] text-[var(--text-3)] hover:border-emerald-400 hover:text-emerald-600 transition font-semibold"
              >
                + Add reminder time
              </button>
            </div>
          </div>
          </> ) : (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-6 text-center space-y-3">
              <div className="text-3xl">💬</div>
              <h3 className="font-bold text-[var(--text-1)]">SMS reminders require Basic or higher</h3>
              <p className="text-sm text-[var(--text-2)]">Upgrade to send automatic SMS reminders, confirmation requests, and customize your message templates.</p>
              <a href="/upgrade" className="inline-block px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
                Upgrade to Basic — $29.99/mo →
              </a>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Public Booking Slug</label>
            <div className="flex gap-2">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                className="border rounded p-2 flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  const link = `https://app.pawscheduler.app/book/${slug}`;
                  navigator.clipboard.writeText(link).then(() => {
                    setCopyMsg("Copied!");
                    setTimeout(() => setCopyMsg(""), 2000);
                  });
                }}
                className="px-3 py-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition whitespace-nowrap"
              >
                {copyMsg || "Copy Link"}
              </button>
            </div>
            {slug && (
              <p className="text-xs text-[var(--text-3)] mt-1 break-all">
                app.pawscheduler.app/book/{slug}
              </p>
            )}
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

      {/* ── BOOKING PAGE TAB ── */}
      {activeTab === "booking" && (
        <div className="space-y-4">

          {/* ── Online Booking Toggle ── */}
          <div className={`rounded-2xl border-2 p-4 transition-colors ${
            bookingEnabled
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className={`font-bold text-sm ${bookingEnabled ? "text-emerald-800" : "text-red-800"}`}>
                  {bookingEnabled ? "🟢 Online booking is open" : "🔴 Online booking is closed"}
                </h3>
                <p className={`text-xs mt-0.5 ${bookingEnabled ? "text-emerald-700" : "text-red-700"}`}>
                  {bookingEnabled
                    ? "Clients can book appointments from your public booking page."
                    : "Your booking page is hidden. Clients will see a \"not accepting bookings\" message."}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const newVal = !bookingEnabled;
                  setBookingEnabled(newVal);
                  await supabase
                    .from("groomers")
                    .update({ booking_enabled: newVal })
                    .eq("id", user.id);
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${
                  bookingEnabled ? "bg-emerald-500" : "bg-red-400"
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  bookingEnabled ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4">
            <h3 className="font-bold text-[var(--text-1)] text-sm mb-1">Your Booking Page</h3>
            <p className="text-xs text-[var(--text-3)] mb-2">Share this link with clients so they can book appointments online.</p>
            <div className="flex gap-2">
              <input readOnly value={slug ? `app.pawscheduler.app/book/${slug}` : "Set your slug in the Profile tab first"}
                className="border rounded p-2 flex-1 text-sm bg-[var(--surface-2)] text-[var(--text-2)]" />
              <button type="button" disabled={!slug}
                onClick={() => { navigator.clipboard.writeText(`https://app.pawscheduler.app/book/${slug}`).then(() => { setCopyMsg("Copied!"); setTimeout(() => setCopyMsg(""), 2000); }); }}
                className="px-3 py-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition whitespace-nowrap disabled:opacity-40">
                {copyMsg || "Copy Link"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Booking Page Theme</label>
            <p className="text-xs text-gray-400 mb-3">Choose the look of your public booking page.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "forest",   label: "Forest",   grad: "linear-gradient(135deg, #059669 0%, #10b981 100%)" },
                { key: "ocean",    label: "Ocean",    grad: "linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)" },
                { key: "lavender", label: "Lavender", grad: "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)" },
                { key: "rose",     label: "Rose",     grad: "linear-gradient(135deg, #be185d 0%, #f472b6 100%)" },
                { key: "sunrise",  label: "Sunrise",  grad: "linear-gradient(135deg, #ea580c 0%, #fbbf24 100%)" },
                { key: "slate",    label: "Slate",    grad: "linear-gradient(135deg, #1e293b 0%, #475569 100%)" },
                { key: "blush",    label: "Blush",    grad: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)" },
                { key: "mint",     label: "Mint",     grad: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" },
              ].map(theme => (
                <button key={theme.key} type="button" onClick={() => setBrandColor(theme.key)}
                  className={`relative rounded-xl overflow-hidden border-2 transition ${brandColor === theme.key ? "border-emerald-500 ring-2 ring-emerald-300" : "border-transparent hover:border-gray-300"}`}>
                  <div style={{ background: theme.grad, height: 52 }} />
                  <div className="py-1.5 px-2 bg-white text-center">
                    <span className="text-xs font-semibold text-gray-700">{theme.label}</span>
                  </div>
                  {brandColor === theme.key && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Waiver Intro Text</label>
            <textarea value={waiverText} onChange={(e) => setWaiverText(e.target.value)} rows={4}
              placeholder="Optional — add a personal note before your standard grooming waiver"
              className="border rounded w-full p-2 text-sm resize-none" />
            <p className="text-xs text-gray-400 mt-1">Shown at the top of your waiver, before the standard sections.</p>
          </div>

          <button onClick={saveProfile} disabled={saving} className="btn-primary w-full mt-2">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* ── REMINDERS TAB ── */}
      {activeTab === "reminders" && (
        <div className="space-y-4">
          {(planTier === "basic" || planTier === "growth" || planTier === "pro") ? (
          <>
          <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[var(--text-1)] text-sm">48hr Confirmation Request</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">Automatically sent 48 hours before every appointment. Always includes a confirm link.</p>
              </div>
              <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 whitespace-nowrap">Always 48hrs</span>
            </div>
            {(() => {
              const TOKENS = [
                { label: "First name", value: "%first_name%" }, { label: "Pet", value: "%pet%" },
                { label: "Date", value: "%date%" }, { label: "Time", value: "%time%" },
                { label: "Services", value: "%services%" }, { label: "Confirm link", value: "%confirm_link%" },
                { label: "Business name", value: "%business_name%" },
              ];
              const insertToken = (token) => {
                const el = document.getElementById("confirm-template-input");
                if (!el) return;
                const start = el.selectionStart; const end = el.selectionEnd;
                const next = confirmationTemplate.slice(0, start) + token + confirmationTemplate.slice(end);
                setConfirmationTemplate(next);
                setTimeout(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); }, 0);
              };
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TOKENS.map((t) => (
                      <button key={t.value} type="button" onClick={() => insertToken(t.value)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition">
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea id="confirm-template-input" rows={3} value={confirmationTemplate}
                    onChange={(e) => setConfirmationTemplate(e.target.value)}
                    placeholder="Hi %first_name%, please confirm %pet%'s appointment on %date% at %time%: %confirm_link%"
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm resize-none bg-[var(--bg)] text-[var(--text-1)]" />
                </div>
              );
            })()}
          </div>

          <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-4">
            <div>
              <h3 className="font-bold text-[var(--text-1)] text-sm">Reminders</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">Set when reminders fire and customize the message.</p>
            </div>
            {(() => {
              const TOKENS = [
                { label: "First name", value: "%first_name%" }, { label: "Pet", value: "%pet%" },
                { label: "Date", value: "%date%" }, { label: "Time", value: "%time%" },
                { label: "Services", value: "%services%" }, { label: "Confirm link", value: "%confirm_link%" },
                { label: "Business name", value: "%business_name%" },
              ];
              const insertToken = (token) => {
                const el = document.getElementById("reminder-template-input");
                if (!el) return;
                const start = el.selectionStart; const end = el.selectionEnd;
                const next = reminderTemplate.slice(0, start) + token + reminderTemplate.slice(end);
                setReminderTemplate(next);
                setTimeout(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); }, 0);
              };
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TOKENS.map((t) => (
                      <button key={t.value} type="button" onClick={() => insertToken(t.value)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition">
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea id="reminder-template-input" rows={3} value={reminderTemplate}
                    onChange={(e) => setReminderTemplate(e.target.value)}
                    placeholder="Hi %first_name%, just a reminder that %pet% has a grooming appointment on %date% at %time%. Reply STOP to opt out."
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm resize-none bg-[var(--bg)] text-[var(--text-1)]" />
                </div>
              );
            })()}
            <div className="space-y-2 pt-2 border-t border-[var(--border-med)]">
              <h4 className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wide">Send at</h4>
              <div className="space-y-2">
                {reminderRules.map((hrs, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" min={1} max={168} value={hrs}
                      onChange={(e) => { const updated = [...reminderRules]; updated[i] = Number(e.target.value) || 1; setReminderRules(updated); }}
                      className="w-20 border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm bg-[var(--bg)] text-[var(--text-1)] text-center" />
                    <span className="text-sm text-[var(--text-2)]">hours before</span>
                    <button type="button" disabled={reminderRules.length <= 1}
                      onClick={() => setReminderRules(prev => prev.filter((_, idx) => idx !== i))}
                      className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 text-sm font-bold">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setReminderRules(prev => [...prev, 2])}
                className="text-sm px-3 py-1.5 rounded-xl border border-dashed border-[var(--border-med)] text-[var(--text-3)] hover:border-emerald-400 hover:text-emerald-600 transition font-semibold">
                + Add reminder time
              </button>
            </div>
          </div>
          </> ) : (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-6 text-center space-y-3">
              <div className="text-3xl">💬</div>
              <h3 className="font-bold text-[var(--text-1)]">SMS reminders require Basic or higher</h3>
              <a href="/upgrade" className="inline-block px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
                Upgrade to Basic — $29.99/mo →
              </a>
            </div>
          )}
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
        <div className="space-y-4">
          {planTier === "free" ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-6 text-center space-y-3">
              <div className="text-3xl">💲</div>
              <h3 className="font-bold text-[var(--text-1)]">Editable services require Basic or higher</h3>
              <p className="text-sm text-[var(--text-2)]">Upgrade to customize your service names, add new services, and set prices by dog size.</p>
              <a href="/upgrade" className="inline-block px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
                Upgrade to Basic — $29.99/mo →
              </a>
            </div>
          ) : (
            <>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-1)] mb-1">Services & Pricing</h2>
              <p className="text-sm text-[var(--text-3)]">
                Edit your service names and prices by dog size. Changes apply to scheduling and your public booking page.
              </p>
            </div>

          {/* Service cards */}
          <div className="space-y-3">
            {(customServices || []).map((svc, i) => (
              <div key={i} className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-3">

                {/* Service name row + delete */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={svc.name}
                    onChange={e => {
                      const updated = [...customServices];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setCustomServices(updated);
                    }}
                    placeholder="Service name"
                    className="flex-1 border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm font-semibold bg-[var(--bg)] text-[var(--text-1)]"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomServices(prev => prev.filter((_, idx) => idx !== i))}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition font-bold text-sm"
                    title="Remove service"
                  >✕</button>
                </div>

                {/* Price inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { size: 1, label: "Small" },
                    { size: 2, label: "Medium" },
                    { size: 3, label: "Large" },
                    { size: 4, label: "XL" },
                  ].map(({ size, label }) => (
                    <div key={size}>
                      <label className="block text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-1">{label}</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-3)]">$</span>
                        <input
                          type="number"
                          min="0"
                          value={svc.pricing?.[size] === 0 ? "" : (svc.pricing?.[size] ?? "")}
                          onChange={e => {
                            const updated = [...customServices];
                            updated[i] = {
                              ...updated[i],
                              pricing: {
                                ...updated[i].pricing,
                                [size]: e.target.value === "" ? 0 : Number(e.target.value) || 0
                              }
                            };
                            setCustomServices(updated);
                          }}
                          onFocus={e => e.target.select()}
                          placeholder="0"
                          className="w-full border border-[var(--border-med)] rounded-xl pl-6 pr-2 py-2 text-sm bg-[var(--bg)] text-[var(--text-1)]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Description */}
                <input
                  type="text"
                  value={svc.description || ""}
                  onChange={e => {
                    const updated = [...customServices];
                    updated[i] = { ...updated[i], description: e.target.value };
                    setCustomServices(updated);
                  }}
                  placeholder="Description (optional) — shown to clients on the booking page"
                  className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-xs bg-[var(--bg)] text-[var(--text-2)]"
                />

                {/* Duration */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">
                    ⏱ Duration
                  </label>
                  <select
                    value={svc.duration_min || ""}
                    onChange={e => {
                      const updated = [...customServices];
                      updated[i] = { ...updated[i], duration_min: e.target.value ? Number(e.target.value) : null };
                      setCustomServices(updated);
                    }}
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-xs bg-[var(--bg)] text-[var(--text-1)]"
                  >
                    <option value="">Not set</option>
                    {[15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480].map(m => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} min` : `${Math.floor(m/60)}h${m % 60 ? ` ${m % 60}m` : ""}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[var(--text-3)]">Auto-fills appointment duration when this service is selected.</p>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                const merged = { ...DEFAULT_PRICING };
                setCustomServices(SERVICE_OPTIONS.map(name => ({
                  name,
                  pricing: merged[name] || { 1: 0, 2: 0, 3: 0, 4: 0 },
                })));
              }}
              className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] underline"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => setCustomServices(prev => [...(prev || []), { name: "", pricing: { 1: 0, 2: 0, 3: 0, 4: 0 } }])}
              className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
            >
              + Add Service
            </button>
          </div>

          <p className="text-xs text-[var(--text-3)]">
            Multiple services are summed automatically. You can always override the amount per appointment.
          </p>

          {/* ── ADD-ONS & FEES — Basic+ ── */}
          {(planTier === "basic" || planTier === "growth" || planTier === "pro") ? (
          <>
          {/* ── ADD-ONS SECTION ── */}
          <div className="pt-2 border-t border-[var(--border-med)]">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-bold text-[var(--text-1)]">Add-ons</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  Flat-rate extras clients can select when booking — tooth brush, ear pluck, nail grind, etc.
                </p>
              </div>
            </div>

            <div className="space-y-3 mt-3">
              {customAddons.map((addon, i) => (
                <div key={addon.id || i} className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={addon.name}
                      onChange={e => {
                        const updated = [...customAddons];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setCustomAddons(updated);
                      }}
                      placeholder="Add-on name"
                      className="flex-1 border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm font-semibold bg-[var(--bg)] text-[var(--text-1)]"
                    />
                    <div className="relative w-24 flex-shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-3)]">$</span>
                      <input
                        type="number"
                        min="0"
                        value={addon.price === 0 ? "" : (addon.price ?? "")}
                        onChange={e => {
                          const updated = [...customAddons];
                          updated[i] = { ...updated[i], price: e.target.value === "" ? 0 : Number(e.target.value) || 0 };
                          setCustomAddons(updated);
                        }}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                        className="w-full border border-[var(--border-med)] rounded-xl pl-6 pr-2 py-2.5 text-sm bg-[var(--bg)] text-[var(--text-1)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomAddons(prev => prev.filter((_, idx) => idx !== i))}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition font-bold text-sm"
                      title="Remove add-on"
                    >✕</button>
                  </div>
                  <input
                    type="text"
                    value={addon.description || ""}
                    onChange={e => {
                      const updated = [...customAddons];
                      updated[i] = { ...updated[i], description: e.target.value };
                      setCustomAddons(updated);
                    }}
                    placeholder="Description (optional) — shown to clients on the booking page"
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-xs bg-[var(--bg)] text-[var(--text-2)]"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => setCustomAddons(prev => [...prev, { id: `a${Date.now()}`, name: "", price: 0, description: "" }])}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--border-med)] text-[var(--text-3)] text-sm font-semibold hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                + Add Add-on
              </button>
            </div>
          </div>

          {/* ── FEES SECTION ── */}
          <div className="pt-2 border-t border-[var(--border-med)]">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-bold text-[var(--text-1)]">Fees</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  Situational charges you apply manually — flea treatment, difficult dog, late cancel, etc. Never shown to clients.
                </p>
              </div>
            </div>

            <div className="space-y-3 mt-3">
              {customFees.map((fee, i) => (
                <div key={fee.id || i} className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={fee.name}
                      onChange={e => {
                        const updated = [...customFees];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setCustomFees(updated);
                      }}
                      placeholder="Fee name"
                      className="flex-1 border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm font-semibold bg-[var(--bg)] text-[var(--text-1)]"
                    />
                    <div className="relative w-24 flex-shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-3)]">$</span>
                      <input
                        type="number"
                        min="0"
                        value={fee.price === 0 ? "" : (fee.price ?? "")}
                        onChange={e => {
                          const updated = [...customFees];
                          updated[i] = { ...updated[i], price: e.target.value === "" ? 0 : Number(e.target.value) || 0 };
                          setCustomFees(updated);
                        }}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                        className="w-full border border-[var(--border-med)] rounded-xl pl-6 pr-2 py-2.5 text-sm bg-[var(--bg)] text-[var(--text-1)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomFees(prev => prev.filter((_, idx) => idx !== i))}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition font-bold text-sm"
                      title="Remove fee"
                    >✕</button>
                  </div>
                  <input
                    type="text"
                    value={fee.description || ""}
                    onChange={e => {
                      const updated = [...customFees];
                      updated[i] = { ...updated[i], description: e.target.value };
                      setCustomFees(updated);
                    }}
                    placeholder="Internal note (optional) — e.g. when to apply this fee"
                    className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-xs bg-[var(--bg)] text-[var(--text-2)]"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => setCustomFees(prev => [...prev, { id: `f${Date.now()}`, name: "", price: 0, description: "" }])}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--border-med)] text-[var(--text-3)] text-sm font-semibold hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                + Add Fee
              </button>
            </div>
          </div>
          </> ) : (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-5 text-center space-y-2 mt-2">
              <div className="text-2xl">🔒</div>
              <p className="font-semibold text-[var(--text-1)] text-sm">Add-ons & Fees require Basic or higher</p>
              <p className="text-xs text-[var(--text-2)]">Upgrade to offer client-selectable add-ons and apply groomer-only fees to appointments.</p>
              <a href="/upgrade" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
                Upgrade to Basic →
              </a>
            </div>
          )}

          <button
            onClick={async () => {
              const { error } = await supabase
                .from("groomers")
                .update({
                  custom_services: customServices,
                  custom_addons: customAddons,
                  custom_fees: customFees,
                })
                .eq("id", user.id);
              if (!error) {
                setConfirmConfig({
                  title: "Saved!",
                  message: "Your services, add-ons, and fees have been updated.",
                  confirmLabel: "OK",
                  onConfirm: () => {},
                });
              }
            }}
            className="btn-primary w-full mt-2"
          >
            Save Services & Pricing
          </button>
          </>
          )}
        </div>
      )}

      {/* ── SMS BOT TAB ── */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          {planTier !== "pro" ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-6 text-center space-y-3">
              <div className="text-3xl">💳</div>
              <h3 className="font-bold text-[var(--text-1)]">Client payments require Pro</h3>
              <p className="text-sm text-[var(--text-2)]">Upgrade to Pro to connect Stripe and send payment requests directly to clients after appointments.</p>
              <a href="/upgrade" className="inline-block px-5 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition">
                Upgrade to Pro — $79.99/mo →
              </a>
            </div>
          ) : (
          <>
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
          </>
          )}
        </div>
      )}

      {/* ── INTAKE TAB ── */}
      {activeTab === "intake" && (
        <div className="space-y-4">
          {(planTier !== "growth" && planTier !== "pro") ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-med)] p-6 text-center space-y-3">
              <div className="text-3xl">📋</div>
              <h3 className="font-bold text-[var(--text-1)]">Intake forms require Growth or higher</h3>
              <p className="text-sm text-[var(--text-2)]">Upgrade to customize the questions your clients answer when they fill out your intake form.</p>
              <a href="/upgrade" className="inline-block px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
                Upgrade to Growth — $49.99/mo →
              </a>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-1)] mb-1">Intake Form Questions</h2>
                <p className="text-sm text-[var(--text-3)]">
                  Customize the questions clients answer when filling out your intake form. Edit, remove, or add new questions. Changes apply immediately to your public intake page.
                </p>
              </div>

              {/* Question type legend */}
              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-3)]">
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border-med)]">
                  <span className="font-bold text-[var(--text-2)]">T</span> Short answer
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border-med)]">
                  <span className="font-bold text-[var(--text-2)]">¶</span> Long answer
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border-med)]">
                  <span className="font-bold text-[var(--text-2)]">Y/N</span> Yes / No
                </span>
              </div>

              {/* Question rows */}
              <div className="space-y-2">
                {(customIntakeQuestions || []).map((q, i) => (
                  <div key={q.id || i} className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-3 space-y-2">
                    {/* Question text input */}
                    <input
                      type="text"
                      value={q.label}
                      onChange={(e) => {
                        const updated = [...customIntakeQuestions];
                        updated[i] = { ...updated[i], label: e.target.value };
                        setCustomIntakeQuestions(updated);
                      }}
                      placeholder="Enter your question…"
                      className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2 text-sm bg-[var(--bg)] text-[var(--text-1)]"
                    />

                    {/* Controls row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Type selector */}
                      <select
                        value={q.type}
                        onChange={(e) => {
                          const updated = [...customIntakeQuestions];
                          updated[i] = { ...updated[i], type: e.target.value };
                          setCustomIntakeQuestions(updated);
                        }}
                        className="border border-[var(--border-med)] rounded-lg px-2 py-1.5 text-xs bg-[var(--bg)] text-[var(--text-1)] font-medium"
                      >
                        <option value="text">T — Short answer</option>
                        <option value="textarea">¶ — Long answer</option>
                        <option value="yesno">Y/N — Yes / No</option>
                      </select>

                      {/* Required toggle */}
                      <label className="flex items-center gap-1.5 text-xs text-[var(--text-2)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={q.required || false}
                          onChange={(e) => {
                            const updated = [...customIntakeQuestions];
                            updated[i] = { ...updated[i], required: e.target.checked };
                            setCustomIntakeQuestions(updated);
                          }}
                          className="rounded accent-emerald-500"
                        />
                        Required
                      </label>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Move up */}
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => {
                          const updated = [...customIntakeQuestions];
                          [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                          setCustomIntakeQuestions(updated);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-med)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition text-sm"
                        title="Move up"
                      >↑</button>

                      {/* Move down */}
                      <button
                        type="button"
                        disabled={i === (customIntakeQuestions.length - 1)}
                        onClick={() => {
                          const updated = [...customIntakeQuestions];
                          [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
                          setCustomIntakeQuestions(updated);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-med)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition text-sm"
                        title="Move down"
                      >↓</button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => setCustomIntakeQuestions(prev => prev.filter((_, idx) => idx !== i))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition text-sm font-bold"
                        title="Remove question"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setCustomIntakeQuestions(DEFAULT_INTAKE_QUESTIONS)}
                  className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] underline"
                >
                  Reset to defaults
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newQ = {
                      id: `q${Date.now()}`,
                      label: "",
                      type: "text",
                      required: false,
                    };
                    setCustomIntakeQuestions(prev => [...(prev || []), newQ]);
                  }}
                  className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
                >
                  + Add Question
                </button>
              </div>

              <p className="text-xs text-[var(--text-3)]">
                These questions appear in the "Additional Questions" section of your intake form at the bottom, after the standard client and pet fields.
              </p>

              <button
                onClick={async () => {
                  setSavingIntake(true);
                  const { error } = await supabase
                    .from("groomers")
                    .update({ custom_intake_questions: customIntakeQuestions })
                    .eq("id", user.id);
                  setSavingIntake(false);
                  if (!error) {
                    setConfirmConfig({ title: "Saved! ✓", message: "Your intake form questions have been updated.", confirmLabel: "OK", onConfirm: () => {} });
                  } else {
                    setConfirmConfig({ title: "Could not save", message: error.message || "Something went wrong.", confirmLabel: "OK", onConfirm: () => {} });
                  }
                }}
                disabled={savingIntake}
                className="btn-primary w-full mt-2"
              >
                {savingIntake ? "Saving…" : "Save Intake Questions"}
              </button>

              {/* ── WAIVER TEXT ── */}
              <div className="mt-6 pt-6 border-t border-[var(--border-med)] space-y-3">
                <div>
                  <h3 className="font-semibold text-[var(--text-1)]">Grooming Waiver Text</h3>
                  <p className="text-xs text-[var(--text-3)] mt-1">
                    This text appears at the top of your waiver page, before the standard clauses. Use it to add your business name, specific policies, or a personal intro.
                  </p>
                </div>
                <textarea
                  value={waiverText}
                  onChange={(e) => setWaiverText(e.target.value)}
                  rows={5}
                  placeholder="e.g. Welcome to Sam's Grooming! By signing below you agree to our grooming policies..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
                <button
                  onClick={async () => {
                    const { error } = await supabase
                      .from("groomers")
                      .update({ waiver_text: waiverText || null })
                      .eq("id", user.id);
                    if (!error) {
                      setConfirmConfig({ title: "Saved! ✓", message: "Your waiver intro has been updated.", confirmLabel: "OK", onConfirm: () => {} });
                    }
                  }}
                  className="btn-primary w-full"
                >
                  Save Waiver Text
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SMS BOT TAB ── */}
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
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={maxParallel}
                  onChange={(e) => setMaxParallel(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  className="border border-[var(--border-med)] rounded p-2 w-28 bg-[var(--surface)] text-[var(--text-1)] text-center"
                />
                <span className="text-sm text-[var(--text-3)]">pets simultaneously (up to 30)</span>
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
    growth: { label: "Growth", color: "bg-emerald-100 text-emerald-700" },
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