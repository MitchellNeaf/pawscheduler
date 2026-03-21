// netlify/functions/smsBot.js
const fetch = globalThis.fetch || require("node-fetch"); // node-fetch fallback for older Netlify runtimes
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");

/* ─────────────────────────────────────────
   ENV VALIDATION — fail fast on startup
───────────────────────────────────────── */
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "TELNYX_API_KEY",
  "TELNYX_BOT_PHONE_NUMBER",
  "URL",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[smsBot] STARTUP ERROR: missing env var ${key}`);
    // Don't throw — let handler return a 500 rather than crashing cold start
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extended to 24 hours — clients often reply hours later
const CONVERSATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const BOT_NUMBER = process.env.TELNYX_BOT_PHONE_NUMBER;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

/* ─────────────────────────────────────────
   LOGGER — masks phone numbers and keys
───────────────────────────────────────── */
function maskPhone(str) {
  return String(str || "").replace(/\+?1?(\d{3})\d{4}(\d{4})/, "+1$1****$2");
}

const log = {
  info:  (...a) => console.log("[INFO]",  ...a),
  warn:  (...a) => console.warn("[WARN]",  ...a),
  error: (...a) => console.error("[ERROR]", ...a),
  sms:   (phone, msg) => console.log(`[SMS] from ${maskPhone(phone)}: ${msg}`),
  tool:  (name, data) => console.log(`[TOOL:${name}]`, JSON.stringify(data).slice(0, 400)),
};

/* ─────────────────────────────────────────
   TIME SLOTS
   Built dynamically per-call from groomer's
   actual hours rather than hardcoded 6-20.
   Falls back to 6–20 if hours unavailable.
───────────────────────────────────────── */
function buildTimeSlots(startHour = 6, endHour = 20) {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    for (const min of [0, 15, 30, 45]) {
      slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
    }
  }
  return slots;
}

// Module-level fallback used before groomer hours are known
const TIME_SLOTS = buildTimeSlots(6, 20);

/* ─────────────────────────────────────────
   SEND SMS
───────────────────────────────────────── */
async function sendSms(to, text) {
  log.info(`Sending SMS to ${maskPhone(to)}: ${text}`);
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: BOT_NUMBER, to, text }),
  });
  const responseText = await res.text();
  if (!res.ok) {
    log.error("Telnyx send failed:", res.status, responseText);
  } else {
    log.info("Telnyx send success:", res.status);
  }
}

/* ─────────────────────────────────────────
   PURE HELPERS
───────────────────────────────────────── */
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addDays(dateStr, daysToAdd) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return dt.toISOString().slice(0, 10);
}

function getWeekdayFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function addMinutesToTime(time24, minutesToAdd) {
  const [h, m] = time24.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + (Number(minutesToAdd) || 0);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function pickRepresentativeSlots(slots, max = 8) {
  if (!Array.isArray(slots) || slots.length <= max) return slots || [];
  const picked = [];
  const used = new Set();
  const lastIndex = slots.length - 1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * lastIndex) / (max - 1));
    if (!used.has(idx)) { picked.push(slots[idx]); used.add(idx); }
  }
  return picked;
}

// Strip tool blocks — only keep plain text turns for history
function toSafeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  const safe = [];
  for (const msg of messages) {
    if (!msg?.role) continue;
    if (typeof msg.content === "string") {
      safe.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text.trim())
        .filter(Boolean);
      if (textParts.length) safe.push({ role: msg.role, content: textParts.join("\n") });
    }
  }
  // Keep last 10 turns to control token cost
  return safe.slice(-10);
}

function computeAmountForServices(pricing, services, slotWeight) {
  const sz = slotWeight || 1;
  return (services || [])
    .filter((s) => s !== "Other")
    .reduce((sum, svc) => {
      const row = pricing?.[svc];
      return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
    }, 0);
}

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

/* ─────────────────────────────────────────
   AVAILABILITY
   Uses groomer's actual hours to build the
   slot grid dynamically — not hardcoded.
───────────────────────────────────────── */
async function getAvailabilityForDate({ date, duration_min, groomer_id, pet_slot_weight = 1, exclude_appointment_id = null }) {
  const { data: groomer, error: groomerErr } = await supabase
    .from("groomers").select("max_parallel").eq("id", groomer_id).single();
  if (groomerErr) return { available: false, date, reason: `Could not load groomer: ${groomerErr.message}` };
  const maxParallel = groomer?.max_parallel || 1;

  const { data: vacs, error: vacErr } = await supabase
    .from("vacation_days").select("date, start_time, end_time")
    .eq("groomer_id", groomer_id).eq("date", date);
  if (vacErr) return { available: false, date, reason: `Could not load vacation: ${vacErr.message}` };
  if (vacs?.some((v) => !v.start_time && !v.end_time)) {
    return { available: false, date, reason: "Groomer is on vacation this day.", unavailable_type: "vacation" };
  }

  const weekday = getWeekdayFromDate(date);
  const { data: hours, error: hoursErr } = await supabase
    .from("working_hours").select("start_time, end_time")
    .eq("groomer_id", groomer_id).eq("weekday", weekday).maybeSingle();
  if (hoursErr) return { available: false, date, reason: `Could not load working hours: ${hoursErr.message}` };
  if (!hours?.start_time || !hours?.end_time) {
    return { available: false, date, reason: "Groomer is not working this day.", unavailable_type: "not_working" };
  }

  // Build slot grid dynamically from groomer's actual start/end hours
  const startHour = parseInt(hours.start_time.slice(0, 2), 10);
  const endHour   = parseInt(hours.end_time.slice(0, 2), 10);
  const SLOTS = buildTimeSlots(Math.max(0, startHour - 1), Math.min(23, endHour + 1));

  const startIdx = SLOTS.indexOf(hours.start_time.slice(0, 5));
  const endIdx   = SLOTS.indexOf(hours.end_time.slice(0, 5));
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    return { available: false, date, reason: "Working hours not configured correctly.", unavailable_type: "config_error" };
  }
  const workingSlots = SLOTS.slice(startIdx, endIdx + 1);

  const { data: breaks, error: breaksErr } = await supabase
    .from("working_breaks").select("break_start, break_end")
    .eq("groomer_id", groomer_id).eq("weekday", weekday);
  if (breaksErr) return { available: false, date, reason: `Could not load breaks: ${breaksErr.message}` };

  const breakSet = new Set();
  (breaks || []).forEach((b) => {
    const bi = SLOTS.indexOf((b.break_start || "").slice(0, 5));
    const ei = SLOTS.indexOf((b.break_end   || "").slice(0, 5));
    if (bi !== -1 && ei !== -1 && ei > bi) SLOTS.slice(bi, ei).forEach((s) => breakSet.add(s));
  });
  (vacs || []).forEach((v) => {
    if (!v.start_time || !v.end_time) return;
    const vi = SLOTS.indexOf(v.start_time.slice(0, 5));
    const vj = SLOTS.indexOf(v.end_time.slice(0, 5));
    if (vi !== -1 && vj !== -1 && vj > vi) SLOTS.slice(vi, vj).forEach((s) => breakSet.add(s));
  });

  const { data: appts, error: apptErr } = await supabase
    .from("appointments").select("id, time, duration_min, slot_weight, no_show")
    .eq("groomer_id", groomer_id).eq("date", date);
  if (apptErr) return { available: false, date, reason: `Could not load appointments: ${apptErr.message}` };

  const loadForSlot = (slot) => {
    let total = 0;
    (appts || []).forEach((a) => {
      if (a.no_show === true) return;
      // Exclude the appointment being rescheduled — it vacates its old slot
      if (exclude_appointment_id && a.id === exclude_appointment_id) return;
      const start = (a.time || "").slice(0, 5);
      const idx = SLOTS.indexOf(start);
      if (idx < 0) return;
      const blocks = Math.ceil((a.duration_min || 15) / 15);
      const occupied = SLOTS.slice(idx, idx + blocks);
      if (occupied.includes(slot)) total += a.slot_weight ?? 1;
    });
    return total;
  };

  const blocks = Math.ceil((duration_min || 15) / 15);
  const available = [];
  workingSlots.forEach((slot, idx) => {
    if (breakSet.has(slot)) return;
    const window = workingSlots.slice(idx, idx + blocks);
    if (window.length < blocks) return;
    if (window.some((s) => breakSet.has(s))) return;
    if (window.some((s) => loadForSlot(s) + pet_slot_weight > maxParallel)) return;
    available.push(slot);
  });

  const filtered = available.filter((s) => s.endsWith(":00") || s.endsWith(":30"));

  // Debug logging — helps diagnose slot issues
  log.info(`getAvailability: date=${date} dur=${duration_min} weight=${pet_slot_weight} working=${workingSlots[0]}–${workingSlots[workingSlots.length-1]} breaks=${breakSet.size} open=${filtered.join(",")}`);

  if (!filtered.length) {
    return { available: false, date, reason: "No openings remain on this day.", unavailable_type: "full", slots: [], all_slots_count: 0 };
  }

  // Return all slots — do NOT cap here. trimToolResult caps to 8 for Claude.
  return {
    available: true,
    date,
    duration_min: duration_min || 15,
    slots: filtered.map((s) => {
      const end24 = addMinutesToTime(s, duration_min || 15);
      return { time24: s, time12: fmt12(s), end24, end12: fmt12(end24), range12: `${fmt12(s)}–${fmt12(end24)}` };
    }),
    all_slots_count: filtered.length,
  };
}

async function getNextAvailableDays({ start_date, days = 7, duration_min, groomer_id, pet_slot_weight = 1 }) {
  const normalizedDays = Math.max(1, Math.min(Number(days) || 7, 21));
  const results = [];
  const unavailableSummary = { vacation: 0, not_working: 0, full: 0, other: 0 };

  for (let i = 0; i < normalizedDays; i++) {
    const date = addDays(start_date, i);
    const info = await getAvailabilityForDate({ date, duration_min, groomer_id, pet_slot_weight });
    if (info.available) {
      results.push({
        date,
        date_label: formatDateLong(date),
        duration_min: info.duration_min,
        slots: (info.slots || []).slice(0, 3),
      });
    } else {
      const bucket = info.unavailable_type || "other";
      unavailableSummary[bucket] = (unavailableSummary[bucket] || 0) + 1;
    }
  }

  return {
    start_date,
    days_checked: normalizedDays,
    available_days: results.slice(0, 5),
    unavailable_summary: unavailableSummary,
  };
}

/* ─────────────────────────────────────────
   TOOL DEFINITIONS
───────────────────────────────────────── */
const tools = [
  {
    name: "lookup_client",
    description: "Look up a client by their phone number. Returns client info and their pets. ALWAYS call this first on every new conversation using the exact phone number provided in the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "The client's phone number in E.164 format e.g. +18145554321" },
      },
      required: ["phone"],
    },
  },
  {
    name: "get_available_slots",
    description: "Get available appointment time slots for a specific date. Use pet_slot_weight as the total combined slot weight needed. For two pets at the same time, pass the sum of both pets' slot weights.",
    input_schema: {
      type: "object",
      properties: {
        date:            { type: "string", description: "Date in YYYY-MM-DD format" },
        duration_min:    { type: "number", description: "Appointment duration in minutes (15, 30, 45, 60, 75, 90, 120)" },
        groomer_id:      { type: "string", description: "The groomer's UUID" },
        pet_slot_weight: { type: "number", description: "Total slot weight needed. For one pet use that pet's slot weight. For multiple pets together, use the combined slot weight." },
      },
      required: ["date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "get_next_available_days",
    description: "Check the next several days starting from a given date and return available days with sample time options. Use pet_slot_weight as the total combined slot weight needed.",
    input_schema: {
      type: "object",
      properties: {
        start_date:      { type: "string", description: "Starting date in YYYY-MM-DD format" },
        days:            { type: "number", description: "How many days ahead to scan, usually 7 to 10" },
        duration_min:    { type: "number", description: "Appointment duration in minutes" },
        groomer_id:      { type: "string", description: "The groomer's UUID" },
        pet_slot_weight: { type: "number", description: "Total slot weight needed." },
      },
      required: ["start_date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "book_appointment",
    description: "Book a single-pet appointment. Only call this after confirming the date, time, duration, and services with the client.",
    input_schema: {
      type: "object",
      properties: {
        pet_id:        { type: "string", description: "The pet's UUID" },
        groomer_id:    { type: "string", description: "The groomer's UUID" },
        date:          { type: "string", description: "Date in YYYY-MM-DD format" },
        time:          { type: "string", description: "Time in HH:MM format (24hr)" },
        duration_min:  { type: "number", description: "Duration in minutes" },
        services:      { type: "array", items: { type: "string" }, description: "List of services e.g. ['Bath', 'Full Groom', 'Nails']" },
        slot_weight:   { type: "number", description: "Pet's slot weight (1, 2, or 3)" },
        notes:         { type: "string", description: "Any notes from the client" },
        client_name:   { type: "string", description: "Client's full name for notification" },
        pet_name:      { type: "string", description: "Pet's name for notification" },
        groomer_email: { type: "string", description: "Groomer's email for notification" },
      },
      required: ["pet_id", "groomer_id", "date", "time", "duration_min", "services", "slot_weight"],
    },
  },
  {
    name: "book_multi_appointment",
    description: "Book two or more pets at the same date and time for the same client.",
    input_schema: {
      type: "object",
      properties: {
        pet_ids:       { type: "array", items: { type: "string" }, description: "Array of pet UUIDs to book together" },
        groomer_id:    { type: "string" },
        date:          { type: "string", description: "YYYY-MM-DD" },
        time:          { type: "string", description: "HH:MM 24hr" },
        duration_min:  { type: "number", description: "Duration in minutes for each pet" },
        services:      { type: "array", items: { type: "string" }, description: "Services applying to each pet" },
        notes:         { type: "string" },
        client_name:   { type: "string" },
        pet_names:     { type: "array", items: { type: "string" }, description: "Pet names in same order as pet_ids" },
        groomer_email: { type: "string" },
      },
      required: ["pet_ids", "groomer_id", "date", "time", "duration_min", "services"],
    },
  },
  {
    name: "reschedule_appointment",
    description: "Reschedule an existing appointment to a new date and time by updating it in place. Only use after confirming the new date and time with the client. The tool validates the new slot before making any changes. The 24hr policy applies to the existing appointment's current date and time.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "The existing appointment UUID to reschedule" },
        pet_id:         { type: "string", description: "The pet's UUID" },
        groomer_id:     { type: "string", description: "The groomer's UUID" },
        new_date:       { type: "string", description: "New date in YYYY-MM-DD format" },
        new_time:       { type: "string", description: "New time in HH:MM 24hr format" },
        duration_min:   { type: "number", description: "Duration in minutes — omit to keep the existing duration" },
        services:       { type: "array", items: { type: "string" }, description: "Services — omit to keep existing services" },
        slot_weight:    { type: "number", description: "Pet slot weight (1, 2, or 3) — omit to keep existing" },
        notes:          { type: "string", description: "Notes — omit to keep existing notes" },
        client_name:    { type: "string" },
        pet_name:       { type: "string" },
        groomer_email:  { type: "string" },
      },
      required: ["appointment_id", "groomer_id", "new_date", "new_time"],
    },
  },
  {
    name: "toggle_reminder",
    description: "Enable or disable SMS reminders for a specific upcoming appointment. Use when a client asks to stop or start reminders for an appointment.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id:   { type: "string", description: "The appointment UUID" },
        groomer_id:       { type: "string", description: "The groomer's UUID" },
        reminder_enabled: { type: "boolean", description: "true to enable reminders, false to disable" },
      },
      required: ["appointment_id", "groomer_id", "reminder_enabled"],
    },
  },
  {
    name: "get_upcoming_appointments",
    description: "Get all upcoming appointments for a client's pets.",
    input_schema: {
      type: "object",
      properties: {
        client_id:  { type: "string", description: "The client's UUID" },
        groomer_id: { type: "string", description: "The groomer's UUID" },
      },
      required: ["client_id", "groomer_id"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel an appointment. Will fail if within 24 hours — tell the client to call directly.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "The appointment UUID to cancel" },
        groomer_id:     { type: "string", description: "The groomer's UUID" },
        groomer_email:  { type: "string", description: "Groomer email for cancellation notification" },
        pet_name:       { type: "string" },
        client_name:    { type: "string" },
        date:           { type: "string" },
        time:           { type: "string" },
        services:       { type: "string" },
      },
      required: ["appointment_id", "groomer_id"],
    },
  },
];

/* ─────────────────────────────────────────
   TOOL IMPLEMENTATIONS
───────────────────────────────────────── */
async function executeTool(name, input) {
  try {
    switch (name) {

      case "lookup_client": {
        const { data: clients, error: clientErr } = await supabase
          .from("clients")
          .select("id, full_name, phone, email, groomer_id, pets(id, name, slot_weight, tags, notes)")
          .eq("phone", input.phone);

        log.info("lookup_client count:", clients?.length, clientErr?.message);

        if (clientErr) return { found: false, message: "Database error: " + clientErr.message };
        if (!clients?.length) return { found: false, message: "Client not found in system." };

        const validMatches = [];
        for (const c of clients) {
          const { data: groomer, error: gErr } = await supabase
            .from("groomers")
            .select("id, full_name, email, sms_bot_enabled, time_zone, max_parallel")
            .eq("id", c.groomer_id).single();
          log.info(`Groomer for ${c.full_name}: sms_bot_enabled=${groomer?.sms_bot_enabled}`);
          if (!gErr && groomer?.sms_bot_enabled === true) validMatches.push({ client: c, groomer });
        }

        if (!validMatches.length) return { found: false, message: "No active bot groomer found for this client." };

        validMatches.sort((a, b) => {
          const diff = (b.client.pets?.length || 0) - (a.client.pets?.length || 0);
          return diff !== 0 ? diff : b.client.id.localeCompare(a.client.id);
        });

        const { client: mc, groomer: mg } = validMatches[0];
        return {
          found: true,
          client_id: mc.id,
          client_name: mc.full_name,
          client_email: mc.email,
          groomer_id: mg.id,
          groomer_name: mg.full_name,
          groomer_email: mg.email,
          groomer_time_zone: mg.time_zone || "America/New_York",
          pets: (mc.pets || []).map((p) => ({
            id: p.id, name: p.name, slot_weight: p.slot_weight || 1,
            tags: p.tags || [], notes: p.notes || "",
          })),
        };
      }

      case "get_available_slots": {
        const { date, duration_min, groomer_id, pet_slot_weight = 1 } = input;
        return await getAvailabilityForDate({ date, duration_min, groomer_id, pet_slot_weight });
      }

      case "get_next_available_days": {
        const { start_date, days = 7, duration_min, groomer_id, pet_slot_weight = 1 } = input;
        return await getNextAvailableDays({ start_date, days, duration_min, groomer_id, pet_slot_weight });
      }

      case "book_appointment": {
        const { pet_id, groomer_id, date, time, duration_min, services, slot_weight, notes, client_name, pet_name, groomer_email } = input;

        const { data: groomerData } = await supabase.from("groomers").select("service_pricing").eq("id", groomer_id).single();
        const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };
        const sz = slot_weight || 1;
        const amount = computeAmountForServices(pricing, services, sz);

        const { data: appt, error } = await supabase
          .from("appointments")
          .insert({ pet_id, groomer_id, date, time, duration_min, services, slot_weight: sz,
                    amount: amount > 0 ? amount : null, notes: notes || "",
                    confirmed: false, no_show: false, paid: false, reminder_enabled: true })
          .select("id").single();

        if (error) return { success: false, error: error.message };

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `New booking (SMS) — ${pet_name || "a pet"} on ${date}`,
              template: "groomer_notification",
              data: { pet_name: pet_name || "—", client_name: client_name || "—", date, time, duration_min,
                      services: services.join(", "), amount: amount > 0 ? `$${amount.toFixed(2)}` : "—", notes: notes || "" },
            }),
          }).catch(() => {});
        }

        return { success: true, appointment_id: appt.id, date, time12: fmt12(time),
                 end12: fmt12(addMinutesToTime(time, duration_min)), duration_min, services,
                 amount: amount > 0 ? `$${amount.toFixed(2)}` : null };
      }

      case "book_multi_appointment": {
        const { pet_ids, groomer_id, date, time, duration_min, services, notes, client_name, pet_names, groomer_email } = input;

        if (!Array.isArray(pet_ids) || pet_ids.length < 2)
          return { success: false, error: "book_multi_appointment requires at least 2 pet_ids." };

        const { data: pets, error: petsErr } = await supabase.from("pets").select("id, name, slot_weight").in("id", pet_ids);
        if (petsErr) return { success: false, error: petsErr.message };
        if (!pets || pets.length !== pet_ids.length) return { success: false, error: "Could not load all selected pets." };

        const petMap = new Map(pets.map((p) => [p.id, p]));
        const orderedPets = pet_ids.map((id) => petMap.get(id)).filter(Boolean);

        const { data: groomerData } = await supabase.from("groomers").select("service_pricing").eq("id", groomer_id).single();
        const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };

        const rows = orderedPets.map((pet) => {
          const sz = pet.slot_weight || 1;
          const amount = computeAmountForServices(pricing, services, sz);
          return { pet_id: pet.id, groomer_id, date, time, duration_min, services, slot_weight: sz,
                   amount: amount > 0 ? amount : null, notes: notes || "",
                   confirmed: false, no_show: false, paid: false, reminder_enabled: true };
        });

        const { data: inserted, error: insertErr } = await supabase.from("appointments").insert(rows).select("id");
        if (insertErr) return { success: false, error: insertErr.message };

        if (groomer_email) {
          const names = pet_names || orderedPets.map((p) => p.name);
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `New multi-pet booking (SMS) — ${names.join(", ")} on ${date}`,
              template: "groomer_notification",
              data: { pet_name: names.join(", "), client_name: client_name || "—", date, time, duration_min,
                      services: services.join(", "),
                      amount: `$${rows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2)}`,
                      notes: notes || "" },
            }),
          }).catch(() => {});
        }

        return { success: true, appointment_ids: (inserted || []).map((r) => r.id),
                 pet_names: pet_names || orderedPets.map((p) => p.name),
                 date, time12: fmt12(time), end12: fmt12(addMinutesToTime(time, duration_min)),
                 duration_min, services };
      }

      case "reschedule_appointment": {
        const { appointment_id, pet_id, groomer_id, new_date, new_time, duration_min,
                services, slot_weight, notes, client_name, pet_name, groomer_email } = input;

        // Load existing appointment — need old date/time for 24hr check and return payload
        const { data: existing, error: fetchErr } = await supabase
          .from("appointments")
          .select("id, date, time, slot_weight, duration_min, services, notes")
          .eq("id", appointment_id)
          .eq("groomer_id", groomer_id)
          .single();

        if (fetchErr || !existing) {
          return { success: false, error: "Could not find that appointment." };
        }

        // 24hr cutoff on the EXISTING appointment
        const [ey, emo, ed] = existing.date.split("-").map(Number);
        const [eh, em] = existing.time.slice(0, 5).split(":").map(Number);
        if (new Date(ey, emo - 1, ed, eh, em).getTime() - Date.now() < 24 * 60 * 60 * 1000) {
          return { success: false, within_cutoff: true,
                   message: "This appointment is within 24 hours and cannot be changed online. Please call your groomer directly." };
        }

        // Validate the new slot BEFORE touching anything.
        // Pass exclude_appointment_id so the existing appointment doesn't
        // count against capacity on its old date (relevant when same-day reschedule).
        const sz = slot_weight || existing.slot_weight || 1;
        const check = await getAvailabilityForDate({
          date: new_date,
          duration_min: duration_min || existing.duration_min,
          groomer_id,
          pet_slot_weight: sz,
          exclude_appointment_id: appointment_id,
        });

        if (!check.available) {
          return { success: false, slot_unavailable: true,
                   reason: check.reason || "No availability on the requested date.",
                   unavailable_type: check.unavailable_type };
        }

        const newTime5 = new_time.slice(0, 5);
        const slotOk = check.slots?.some((s) => s.time24 === newTime5);
        if (!slotOk) {
          const alts = check.slots?.slice(0, 3).map((s) => s.range12).join(", ") || "none";
          return { success: false, slot_taken: true,
                   message: `That exact time isn't available. Other openings: ${alts}.` };
        }

        // Slot is valid — UPDATE the existing row in place (atomic, no orphan risk)
        const { data: groomerData } = await supabase
          .from("groomers").select("service_pricing").eq("id", groomer_id).single();
        const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };

        // Fallback to existing values when Claude omits optional fields
        const resolvedServices  = (services  && services.length  > 0) ? services  : existing.services;
        const resolvedNotes     = notes !== undefined                  ? notes     : existing.notes;
        const resolvedDuration  = duration_min                        || existing.duration_min;

        // Amount must be computed from resolvedServices, not raw services
        const resolvedServicesArr = Array.isArray(resolvedServices) ? resolvedServices : [];
        const amount = computeAmountForServices(pricing, resolvedServicesArr, sz);

        const { error: updateErr } = await supabase
          .from("appointments")
          .update({
            date: new_date,
            time: new_time,
            duration_min: resolvedDuration,
            services: resolvedServicesArr,
            slot_weight: sz,
            amount: amount > 0 ? amount : null,
            notes: resolvedNotes || "",
            confirmed: false, // reset confirmation for the new time
          })
          .eq("id", appointment_id)
          .eq("groomer_id", groomer_id);

        if (updateErr) {
          return { success: false, error: `Could not update appointment: ${updateErr.message}` };
        }

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `Appointment rescheduled (SMS) — ${pet_name || "a pet"} to ${new_date}`,
              template: "groomer_notification",
              data: { pet_name: pet_name || "—", client_name: client_name || "—",
                      date: new_date, time: new_time,
                      duration_min: resolvedDuration,
                      services: resolvedServicesArr.join(", "),
                      amount: amount > 0 ? `$${amount.toFixed(2)}` : "—",
                      notes: `RESCHEDULED from ${existing.date} ${existing.time}. ${notes || ""}` },
            }),
          }).catch(() => {});
        }

        return {
          success: true,
          old_date: existing.date,
          old_time12: fmt12(existing.time),
          new_date,
          time12: fmt12(new_time),
          end12: fmt12(addMinutesToTime(new_time, resolvedDuration)),
          duration_min: resolvedDuration,
          services: resolvedServicesArr,
          amount: amount > 0 ? `$${amount.toFixed(2)}` : null,
        };
      }

      case "toggle_reminder": {
        const { appointment_id, groomer_id, reminder_enabled } = input;
        const { error } = await supabase
          .from("appointments")
          .update({ reminder_enabled: !!reminder_enabled })
          .eq("id", appointment_id)
          .eq("groomer_id", groomer_id);
        if (error) return { success: false, error: error.message };
        return { success: true, reminder_enabled: !!reminder_enabled };
      }

      case "get_upcoming_appointments": {
        const { client_id, groomer_id } = input;
        const { data: pets } = await supabase
          .from("pets").select("id, name").eq("client_id", client_id).eq("groomer_id", groomer_id);
        if (!pets?.length) return { appointments: [] };

        const today = new Date().toISOString().slice(0, 10);
        const { data: appts } = await supabase
          .from("appointments")
          .select("id, date, time, duration_min, services, reminder_enabled, pets(name)")
          .eq("groomer_id", groomer_id)
          .in("pet_id", pets.map((p) => p.id))
          .gte("date", today)
          .or("no_show.is.null,no_show.eq.false")
          .order("date", { ascending: true })
          .order("time", { ascending: true });

        return {
          appointments: (appts || []).map((a) => ({
            id: a.id,
            pet_name: a.pets?.name || "—",
            date: a.date,
            time12: fmt12(a.time),
            time24: (a.time || "").slice(0, 5),
            duration_min: a.duration_min,
            end12: fmt12(addMinutesToTime((a.time || "").slice(0, 5), a.duration_min || 15)),
            services: Array.isArray(a.services) ? a.services.join(", ") : a.services,
            reminder_enabled: a.reminder_enabled,
          })),
        };
      }

      case "cancel_appointment": {
        const { appointment_id, groomer_id, groomer_email, pet_name, client_name, date, time, services } = input;

        if (date && time) {
          const [y, mo, d] = date.split("-").map(Number);
          const [h, m] = (time || "00:00").slice(0, 5).split(":").map(Number);
          const apptMs = new Date(y, mo - 1, d, h, m).getTime();
          if (apptMs - Date.now() < 24 * 60 * 60 * 1000) {
            return { success: false, within_cutoff: true,
                     message: "This appointment is within 24 hours and cannot be cancelled online. Please call or text your groomer directly." };
          }
        }

        const { error } = await supabase
          .from("appointments").delete().eq("id", appointment_id).eq("groomer_id", groomer_id);
        if (error) return { success: false, error: error.message };

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `Appointment cancelled (SMS) — ${pet_name || "a pet"} on ${date}`,
              template: "groomer_cancellation",
              data: { pet_name: pet_name || "—", client_name: client_name || "—",
                      date: date || "—", time: time || "—", duration_min: "",
                      services: services || "—", notes: "" },
            }),
          }).catch(() => {});
        }

        return { success: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    log.error(`Tool error [${name}]:`, err.message);
    return { error: err.message };
  }
}

/* ─────────────────────────────────────────
   TRIM TOOL RESULTS
   Caps slots at 8 (was 6) to give Claude
   a better spread across the day.
───────────────────────────────────────── */
function trimToolResult(toolName, result) {
  switch (toolName) {
    case "lookup_client":
      if (!result.found) return result;
      return { found: true, client_id: result.client_id, client_name: result.client_name,
               groomer_id: result.groomer_id, groomer_email: result.groomer_email,
               groomer_time_zone: result.groomer_time_zone, pets: result.pets };

    case "get_available_slots":
      return { available: result.available, date: result.date, duration_min: result.duration_min,
               // Use pickRepresentativeSlots to spread across the day (not just first N)
               slots: pickRepresentativeSlots(result.slots || [], 8),
               reason: result.reason, unavailable_type: result.unavailable_type };

    case "get_next_available_days":
      return { start_date: result.start_date, days_checked: result.days_checked,
               available_days: result.available_days, unavailable_summary: result.unavailable_summary };

    case "book_appointment":
      return { success: result.success, date: result.date, time12: result.time12, end12: result.end12,
               duration_min: result.duration_min, services: result.services, amount: result.amount,
               error: result.error };

    case "book_multi_appointment":
      return { success: result.success, pet_names: result.pet_names, date: result.date,
               time12: result.time12, end12: result.end12, duration_min: result.duration_min,
               services: result.services, error: result.error };

    case "reschedule_appointment":
      return { success: result.success, old_date: result.old_date, old_time12: result.old_time12,
               new_date: result.new_date, time12: result.time12, end12: result.end12,
               duration_min: result.duration_min, services: result.services, amount: result.amount,
               within_cutoff: result.within_cutoff, slot_taken: result.slot_taken,
               slot_unavailable: result.slot_unavailable, message: result.message,
               reason: result.reason, error: result.error };

    case "toggle_reminder":
      return { success: result.success, reminder_enabled: result.reminder_enabled, error: result.error };

    case "get_upcoming_appointments":
      return { appointments: result.appointments?.slice(0, 5) };

    case "cancel_appointment":
      return { success: result.success, within_cutoff: result.within_cutoff,
               message: result.message, error: result.error };

    default:
      return result;
  }
}

/* ─────────────────────────────────────────
   CONVERSATION PERSISTENCE
───────────────────────────────────────── */
async function loadConversation(phone) {
  const { data } = await supabase
    .from("sms_conversations")
    .select("id, messages, client_context, groomer_id, last_message_at")
    .eq("phone", phone)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  if (Date.now() - new Date(data.last_message_at).getTime() > CONVERSATION_TIMEOUT_MS) return null;

  return { ...data, messages: toSafeHistory(data.messages) };
}

async function saveConversation({ phone, groomerId, clientId, messages, existingId, clientContext }) {
  const payload = {
    messages,
    client_id: clientId || null,
    client_context: clientContext || null,
    groomer_id: groomerId || null,
    last_message_at: new Date().toISOString(),
  };
  if (existingId) {
    await supabase.from("sms_conversations").update(payload).eq("id", existingId);
  } else {
    await supabase.from("sms_conversations").insert({ phone, ...payload });
  }
}

/* ─────────────────────────────────────────
   RATE LIMITER — 30 messages/phone/day
───────────────────────────────────────── */
async function isRateLimited(phone) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("sms_conversations")
    .select("messages")
    .eq("phone", phone)
    .gte("last_message_at", startOfDay.toISOString())
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const count = data?.messages?.length || 0;
  if (count >= 30) { log.warn(`Rate limit hit for ${maskPhone(phone)}: ${count} messages`); return true; }
  return false;
}

/* ─────────────────────────────────────────
   OPT-OUT CHECK
   Checks sms_opt_in flag on clients table.
   telnyxWebhook sets it to false on STOP.
───────────────────────────────────────── */
async function isOptedOut(phone) {
  const { data } = await supabase
    .from("clients")
    .select("sms_opt_in")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  // If we find a client record and they've explicitly opted out, block
  if (data && data.sms_opt_in === false) return true;
  return false;
}

/* ─────────────────────────────────────────
   SYSTEM PROMPT
   Static portions use Anthropic prompt
   caching (cache_control: ephemeral) to
   reduce input token cost by ~90%.
───────────────────────────────────────── */
function buildSystemPrompt(fromPhone, cachedContext) {
  const today = new Date().toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const clientInfo = cachedContext
    ? `Client already identified: ${JSON.stringify(cachedContext)}. Do NOT call lookup_client — you already have the client info above.`
    : `FIRST: Call lookup_client with phone="${fromPhone}" immediately. Never ask for their name.`;

  return `SMS scheduling assistant for a dog grooming business. Today is ${dayName}, ${today}. Client phone: ${fromPhone}

${clientInfo}

TASKS: Book appointments, view upcoming appointments, reschedule appointments, cancel appointments (24hr policy), toggle reminders.

BOOKING FLOW:
1. Confirm pet if multiple pets exist.
2. If the client wants 2 or more pets at the same time, gather all pet names first.
3. Ask for date/day and services if missing.
4. Convert requested services into duration.
5. For one pet, call get_available_slots with that pet's slot_weight.
6. For multiple pets together, add their slot_weight values and call get_available_slots with the COMBINED total slot weight.
7. If get_available_slots says unavailable for ANY reason, do NOT stop there.
8. If unavailable, call get_next_available_days starting from the requested date for 7-10 days and offer 1-3 nearby alternatives.
9. When offering times, show the range (e.g. 3:00–4:00 PM). Show slots closest to what the client asked for.
10. Only after a valid slot exists should you confirm the exact time, duration, and time range before booking.
11. For one pet call book_appointment. For multiple pets call book_multi_appointment.

RESCHEDULING:
- Use get_upcoming_appointments to find the appointment, confirm new date/time with the client, then call reschedule_appointment.
- Rescheduling respects the 24hr policy on the existing appointment.

REMINDERS:
- If a client asks to turn reminders on or off for an appointment, use toggle_reminder.

IMPORTANT SCHEDULING RULES:
- Never make up availability.
- Never say a day is unavailable without giving alternatives when tools can provide them.
- If the client gives a weekday like "Tuesday next week," use that exact requested day first.
- When confirming a booking say the duration clearly: "That's a 60-min appointment. I have 3:00–4:00 PM. Want me to book it?"
- For multiple pets, only offer a slot if the combined slot weight fits within capacity.

SERVICES: Bath, Full Groom, Nails, Teeth, Deshed, Anal Glands, Puppy Trim, Other
DURATIONS: Full Groom=60min, Bath=30min, Nails=15min, Teeth=15min, Deshed=60min, Anal Glands=15min, Puppy Trim=60min, Other=30min. Multiple services add up, max 90min.

CANCELLATION: Always call get_upcoming_appointments first to get real appointment IDs. Never invent or guess appointment_id values — only use IDs returned by get_upcoming_appointments. Confirm with client before cancelling, then call cancel_appointment once per appointment using the exact UUID from the tool result. Within 24hrs → tell them to call directly.

STYLE: Short SMS replies, max 3 sentences, friendly. If client not found, tell them to contact their groomer.`;
}

/* ─────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────── */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Invalid JSON" }; }

  const fromPhone   = body?.data?.payload?.from?.phone_number;
  const incomingText = body?.data?.payload?.text?.trim();

  if (!fromPhone || !incomingText) return { statusCode: 200, body: "Ignored" };

  log.sms(fromPhone, incomingText);

  if (incomingText.toUpperCase() === "STOP") return { statusCode: 200, body: "STOP handled elsewhere" };

  // Persistent opt-out compliance check
  if (await isOptedOut(fromPhone)) {
    log.info(`Ignoring message from opted-out number ${maskPhone(fromPhone)}`);
    return { statusCode: 200, body: "Opted out" };
  }

  // Rate limit
  if (await isRateLimited(fromPhone)) {
    await sendSms(fromPhone, "You've reached the daily message limit. Please call your groomer directly, or try again tomorrow.");
    return { statusCode: 200, body: "Rate limited" };
  }

  try {
    const existing      = await loadConversation(fromPhone);
    const conversationId = existing?.id || null;
    const messages      = Array.isArray(existing?.messages) ? [...existing.messages] : [];
    const cachedContext = existing?.client_context || null;
    const groomerId     = existing?.groomer_id || cachedContext?.groomer_id || null;
    const clientId      = cachedContext?.client_id || null;

    // Deduplicate: if the last user message is identical and within 30 seconds, drop it.
    // Prevents double-tap / duplicate webhook from firing twice.
    if (existing?.last_message_at) {
      const lastUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0];
      const ageMs = Date.now() - new Date(existing.last_message_at).getTime();
      if (lastUserMsg?.content === incomingText && ageMs < 30_000) {
        log.warn("Duplicate message dropped", { ageMs });
        return { statusCode: 200, body: "Duplicate ignored" };
      }
    }

    messages.push({ role: "user", content: incomingText });

    let finalResponse    = null;
    let currentMessages  = [...messages];
    let iterations       = 0;
    let newClientContext = cachedContext;

    while (iterations < 10) {
      iterations++;

      // Use Anthropic prompt caching on the system prompt to reduce input token cost
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(fromPhone, newClientContext),
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        messages: currentMessages,
        // betas: ["prompt-caching-2024-07-31"], // enable only if on an Anthropic plan that supports prompt caching
      });

      log.info(`Claude iteration ${iterations}, stop_reason: ${response.stop_reason}`);

      if (response.stop_reason === "end_turn") {
        const tb = response.content.find((b) => b.type === "text");
        finalResponse = tb?.text || "Sorry, something went wrong. Please try again.";
        currentMessages.push({ role: "assistant", content: response.content });
        break;
      }

      if (response.stop_reason === "tool_use") {
        currentMessages.push({ role: "assistant", content: response.content });
        const toolResults = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          log.tool(block.name, block.input);

          const result = await executeTool(block.name, block.input);

          if (block.name === "lookup_client" && result.found) {
            newClientContext = {
              client_id:        result.client_id,
              client_name:      result.client_name,
              groomer_id:       result.groomer_id,
              groomer_name:     result.groomer_name,
              groomer_email:    result.groomer_email,
              groomer_time_zone: result.groomer_time_zone,
              pets:             result.pets,
            };
          }

          const trimmed = trimToolResult(block.name, result);
          log.tool(`${block.name}:result`, trimmed);

          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(trimmed) });
        }

        currentMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // max_tokens: extract whatever text Claude managed to write rather than failing
      if (response.stop_reason === "max_tokens") {
        const tb = response.content.find((b) => b.type === "text");
        finalResponse = tb?.text
          ? tb.text.trim() + " (reply cut short — please ask again if needed)"
          : "Sorry, my reply was too long. Could you ask one thing at a time?";
        log.warn("max_tokens hit", { iteration: iterations });
        break;
      }

      log.error("Unexpected stop_reason:", response.stop_reason);
      finalResponse = "Sorry, I had trouble with that. Please try again.";
      break;
    }

    if (!finalResponse) finalResponse = "Sorry, something went wrong. Please try again or call us directly.";

    const trimmedMessages = toSafeHistory([
      ...messages.slice(0, -1),
      { role: "user",      content: incomingText },
      { role: "assistant", content: finalResponse },
    ]);

    await saveConversation({
      phone:      fromPhone,
      groomerId:  groomerId  || newClientContext?.groomer_id || null,
      clientId:   clientId   || newClientContext?.client_id  || null,
      messages:   trimmedMessages,
      existingId: conversationId,
      clientContext: newClientContext,
    });

    log.info("Final response:", finalResponse);
    await sendSms(fromPhone, finalResponse);
    return { statusCode: 200, body: "OK" };

  } catch (err) {
    log.error("smsBot fatal error:", err.message);
    try { await sendSms(fromPhone, "Sorry, I'm having trouble right now. Please call your groomer directly."); }
    catch {}
    return { statusCode: 200, body: "Error handled" };
  }
};