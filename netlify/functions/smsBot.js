// netlify/functions/smsBot.js
const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONVERSATION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const BOT_NUMBER = process.env.TELNYX_BOT_PHONE_NUMBER;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

const TIME_SLOTS = [];
for (let h = 6; h <= 20; h++) {
  for (const min of [0, 15, 30, 45]) {
    TIME_SLOTS.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
}

/* ─────────────────────────────────────────
   SEND SMS via Telnyx
───────────────────────────────────────── */
async function sendSms(to, text) {
  console.log(`Sending SMS to ${to}: ${text}`);
  console.log(`From: ${BOT_NUMBER}, API key set: ${!!TELNYX_API_KEY}`);

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
    console.error("Telnyx send failed:", res.status, responseText);
  } else {
    console.log("Telnyx send success:", res.status);
  }
}

/* ─────────────────────────────────────────
   HELPERS
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
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function addMinutesToTime(time24, minutesToAdd) {
  const [h, m] = time24.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + (Number(minutesToAdd) || 0);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function pickRepresentativeSlots(slots, max = 6) {
  if (!Array.isArray(slots) || slots.length <= max) return slots || [];

  const picked = [];
  const used = new Set();
  const lastIndex = slots.length - 1;

  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * lastIndex) / (max - 1));
    if (!used.has(idx)) {
      picked.push(slots[idx]);
      used.add(idx);
    }
  }

  return picked;
}

function toSafeHistory(messages) {
  if (!Array.isArray(messages)) return [];

  const safe = [];

  for (const msg of messages) {
    if (!msg || !msg.role) continue;

    if (typeof msg.content === "string") {
      safe.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text.trim())
        .filter(Boolean);

      if (textParts.length) {
        safe.push({
          role: msg.role,
          content: textParts.join("\n"),
        });
      }
    }
  }

  return safe.slice(-12);
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

/* ─────────────────────────────────────────
   AVAILABILITY
───────────────────────────────────────── */
async function getAvailabilityForDate({ date, duration_min, groomer_id, pet_slot_weight = 1 }) {
  const { data: groomer, error: groomerErr } = await supabase
    .from("groomers")
    .select("max_parallel")
    .eq("id", groomer_id)
    .single();

  if (groomerErr) {
    return { available: false, date, reason: `Could not load groomer: ${groomerErr.message}` };
  }

  const maxParallel = groomer?.max_parallel || 1;

  const { data: vacs, error: vacErr } = await supabase
    .from("vacation_days")
    .select("date, start_time, end_time")
    .eq("groomer_id", groomer_id)
    .eq("date", date);

  if (vacErr) {
    return { available: false, date, reason: `Could not load vacation: ${vacErr.message}` };
  }

  if (vacs?.some((v) => !v.start_time && !v.end_time)) {
    return {
      available: false,
      date,
      reason: "Groomer is on vacation this day.",
      unavailable_type: "vacation",
    };
  }

  const weekday = getWeekdayFromDate(date);

  const { data: hours, error: hoursErr } = await supabase
    .from("working_hours")
    .select("start_time, end_time")
    .eq("groomer_id", groomer_id)
    .eq("weekday", weekday)
    .maybeSingle();

  if (hoursErr) {
    return { available: false, date, reason: `Could not load working hours: ${hoursErr.message}` };
  }

  if (!hours?.start_time || !hours?.end_time) {
    return {
      available: false,
      date,
      reason: "Groomer is not working this day.",
      unavailable_type: "not_working",
    };
  }

  const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
  const endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));

  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    return {
      available: false,
      date,
      reason: "Working hours are not configured correctly.",
      unavailable_type: "config_error",
    };
  }

  const workingSlots = TIME_SLOTS.slice(startIdx, endIdx + 1);

  const { data: breaks, error: breaksErr } = await supabase
    .from("working_breaks")
    .select("break_start, break_end")
    .eq("groomer_id", groomer_id)
    .eq("weekday", weekday);

  if (breaksErr) {
    return { available: false, date, reason: `Could not load breaks: ${breaksErr.message}` };
  }

  const breakSet = new Set();

  // break_end should be exclusive
  (breaks || []).forEach((b) => {
    const bi = TIME_SLOTS.indexOf((b.break_start || "").slice(0, 5));
    const ei = TIME_SLOTS.indexOf((b.break_end || "").slice(0, 5));
    if (bi !== -1 && ei !== -1 && ei > bi) {
      TIME_SLOTS.slice(bi, ei).forEach((s) => breakSet.add(s));
    }
  });

  // partial vacation end should also be exclusive
  (vacs || []).forEach((v) => {
    if (!v.start_time || !v.end_time) return;
    const vi = TIME_SLOTS.indexOf(v.start_time.slice(0, 5));
    const vj = TIME_SLOTS.indexOf(v.end_time.slice(0, 5));
    if (vi !== -1 && vj !== -1 && vj > vi) {
      TIME_SLOTS.slice(vi, vj).forEach((s) => breakSet.add(s));
    }
  });

  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("time, duration_min, slot_weight, no_show")
    .eq("groomer_id", groomer_id)
    .eq("date", date);

  if (apptErr) {
    return { available: false, date, reason: `Could not load appointments: ${apptErr.message}` };
  }

  const loadForSlot = (slot) => {
    let total = 0;

    (appts || []).forEach((a) => {
      if (a.no_show === true) return;
      const start = (a.time || "").slice(0, 5);
      const idx = TIME_SLOTS.indexOf(start);
      if (idx < 0) return;

      const blocks = Math.ceil((a.duration_min || 15) / 15);
      const slots = TIME_SLOTS.slice(idx, idx + blocks);
      if (slots.includes(slot)) total += a.slot_weight ?? 1;
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

  if (!filtered.length) {
    return {
      available: false,
      date,
      reason: "No openings remain on this day.",
      unavailable_type: "full",
      slots: [],
      all_slots_count: 0,
    };
  }

  const displaySlots = pickRepresentativeSlots(filtered, 6);

  return {
    available: true,
    date,
    duration_min: duration_min || 15,
    slots: displaySlots.map((s) => {
      const end24 = addMinutesToTime(s, duration_min || 15);
      return {
        time24: s,
        time12: fmt12(s),
        end24,
        end12: fmt12(end24),
        range12: `${fmt12(s)}–${fmt12(end24)}`,
      };
    }),
    all_slots_count: filtered.length,
  };
}

async function getNextAvailableDays({
  start_date,
  days = 7,
  duration_min,
  groomer_id,
  pet_slot_weight = 1,
}) {
  const normalizedDays = Math.max(1, Math.min(Number(days) || 7, 21));
  const results = [];
  const unavailableSummary = { vacation: 0, not_working: 0, full: 0, other: 0 };

  for (let i = 0; i < normalizedDays; i++) {
    const date = addDays(start_date, i);
    const info = await getAvailabilityForDate({
      date,
      duration_min,
      groomer_id,
      pet_slot_weight,
    });

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
   TOOL DEFINITIONS for Claude
───────────────────────────────────────── */
const tools = [
  {
    name: "lookup_client",
    description:
      "Look up a client by their phone number. Returns client info and their pets. ALWAYS call this first on every new conversation using the exact phone number provided in the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description:
            "The client's phone number exactly as provided in the system prompt in E.164 format e.g. +18145554321",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "get_available_slots",
    description:
      "Get available appointment time slots for a specific date. Use pet_slot_weight as the total combined slot weight needed. For two pets at the same time, pass the sum of both pets' slot weights.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format",
        },
        duration_min: {
          type: "number",
          description: "Appointment duration in minutes (15, 30, 45, 60, 75, 90, 120)",
        },
        groomer_id: {
          type: "string",
          description: "The groomer's UUID",
        },
        pet_slot_weight: {
          type: "number",
          description:
            "Total slot weight needed. For one pet use that pet's slot weight. For multiple pets together, use the combined slot weight.",
        },
      },
      required: ["date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "get_next_available_days",
    description:
      "Check the next several days starting from a given date and return the next available days with sample time options. Use pet_slot_weight as the total combined slot weight needed.",
    input_schema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Starting date in YYYY-MM-DD format",
        },
        days: {
          type: "number",
          description: "How many days ahead to scan, usually 7 to 10",
        },
        duration_min: {
          type: "number",
          description: "Appointment duration in minutes",
        },
        groomer_id: {
          type: "string",
          description: "The groomer's UUID",
        },
        pet_slot_weight: {
          type: "number",
          description:
            "Total slot weight needed. For one pet use that pet's slot weight. For multiple pets together, use the combined slot weight.",
        },
      },
      required: ["start_date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book a single-pet appointment. Only call this after confirming the date, time, duration, and services with the client.",
    input_schema: {
      type: "object",
      properties: {
        pet_id: { type: "string", description: "The pet's UUID" },
        groomer_id: { type: "string", description: "The groomer's UUID" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "Time in HH:MM format (24hr)" },
        duration_min: { type: "number", description: "Duration in minutes" },
        services: {
          type: "array",
          items: { type: "string" },
          description: "List of services e.g. ['Bath', 'Full Groom', 'Nails']",
        },
        slot_weight: {
          type: "number",
          description: "Pet's slot weight (1, 2, or 3)",
        },
        notes: { type: "string", description: "Any notes from the client" },
        client_name: { type: "string", description: "Client's full name for notification" },
        pet_name: { type: "string", description: "Pet's name for notification" },
        groomer_email: { type: "string", description: "Groomer's email for notification" },
      },
      required: ["pet_id", "groomer_id", "date", "time", "duration_min", "services", "slot_weight"],
    },
  },
  {
    name: "book_multi_appointment",
    description:
      "Book two or more pets at the same date and time for the same client. Use this when the client wants multiple pets scheduled together. This creates one appointment row per pet at the same start time.",
    input_schema: {
      type: "object",
      properties: {
        pet_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of pet UUIDs to book together",
        },
        groomer_id: { type: "string", description: "The groomer's UUID" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "Time in HH:MM format (24hr)" },
        duration_min: { type: "number", description: "Duration in minutes for each pet appointment" },
        services: {
          type: "array",
          items: { type: "string" },
          description: "List of services that apply to each pet",
        },
        notes: { type: "string", description: "Any notes from the client" },
        client_name: { type: "string", description: "Client's full name for notification" },
        pet_names: {
          type: "array",
          items: { type: "string" },
          description: "Pet names in the same order as pet_ids",
        },
        groomer_email: { type: "string", description: "Groomer's email for notification" },
      },
      required: ["pet_ids", "groomer_id", "date", "time", "duration_min", "services"],
    },
  },
  {
    name: "get_upcoming_appointments",
    description: "Get all upcoming appointments for a client's pets.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        groomer_id: { type: "string", description: "The groomer's UUID" },
      },
      required: ["client_id", "groomer_id"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel an appointment. Will fail if the appointment is within 24 hours — in that case tell the client to call directly.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "The appointment UUID to cancel" },
        groomer_id: { type: "string", description: "The groomer's UUID" },
        groomer_email: { type: "string", description: "Groomer email for cancellation notification" },
        pet_name: { type: "string" },
        client_name: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        services: { type: "string" },
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
          .select(`
            id, full_name, phone, email, groomer_id,
            pets ( id, name, slot_weight, tags, notes )
          `)
          .eq("phone", input.phone);

        console.log("lookup_client clients:", JSON.stringify({ clients, clientErr }));

        if (clientErr) {
          return { found: false, message: "Database error: " + clientErr.message };
        }

        if (!clients || clients.length === 0) {
          return { found: false, message: "Client not found in system." };
        }

        const validMatches = [];

        for (const c of clients) {
          const { data: groomer, error: gErr } = await supabase
            .from("groomers")
            .select("id, full_name, email, sms_bot_enabled, time_zone, max_parallel")
            .eq("id", c.groomer_id)
            .single();

          console.log(`Groomer for client ${c.full_name}:`, JSON.stringify({ groomer, gErr }));

          if (!gErr && groomer?.sms_bot_enabled === true) {
            validMatches.push({ client: c, groomer });
          }
        }

        if (validMatches.length === 0) {
          return { found: false, message: "No active bot groomer found for this client." };
        }

        validMatches.sort((a, b) => {
          const aPets = a.client.pets?.length || 0;
          const bPets = b.client.pets?.length || 0;
          if (bPets !== aPets) return bPets - aPets;
          return b.client.id.localeCompare(a.client.id);
        });

        const { client: matchedClient, groomer: matchedGroomer } = validMatches[0];

        return {
          found: true,
          client_id: matchedClient.id,
          client_name: matchedClient.full_name,
          client_email: matchedClient.email,
          groomer_id: matchedGroomer.id,
          groomer_name: matchedGroomer.full_name,
          groomer_email: matchedGroomer.email,
          groomer_time_zone: matchedGroomer.time_zone || "America/New_York",
          pets: (matchedClient.pets || []).map((p) => ({
            id: p.id,
            name: p.name,
            slot_weight: p.slot_weight || 1,
            tags: p.tags || [],
            notes: p.notes || "",
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
        const {
          pet_id,
          groomer_id,
          date,
          time,
          duration_min,
          services,
          slot_weight,
          notes,
          client_name,
          pet_name,
          groomer_email,
        } = input;

        const DEFAULT_PRICING = {
          Bath: { 1: 25, 2: 40, 3: 60 },
          "Full Groom": { 1: 45, 2: 65, 3: 90 },
          Nails: { 1: 15, 2: 15, 3: 20 },
          Teeth: { 1: 15, 2: 15, 3: 20 },
          Deshed: { 1: 35, 2: 55, 3: 75 },
          "Anal Glands": { 1: 15, 2: 15, 3: 20 },
          "Puppy Trim": { 1: 40, 2: 55, 3: 75 },
          Other: { 1: 0, 2: 0, 3: 0 },
        };

        const { data: groomerData } = await supabase
          .from("groomers")
          .select("service_pricing")
          .eq("id", groomer_id)
          .single();

        const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };
        const sz = slot_weight || 1;
        const amount = computeAmountForServices(pricing, services, sz);

        const { data: appt, error } = await supabase
          .from("appointments")
          .insert({
            pet_id,
            groomer_id,
            date,
            time,
            duration_min,
            services,
            slot_weight: sz,
            amount: amount > 0 ? amount : null,
            notes: notes || "",
            confirmed: false,
            no_show: false,
            paid: false,
            reminder_enabled: true,
          })
          .select("id")
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `New booking (SMS) — ${pet_name || "a pet"} on ${date}`,
              template: "groomer_notification",
              data: {
                pet_name: pet_name || "—",
                client_name: client_name || "—",
                date,
                time,
                duration_min,
                services: services.join(", "),
                amount: amount > 0 ? `$${amount.toFixed(2)}` : "—",
                notes: notes || "",
              },
            }),
          }).catch(() => {});
        }

        return {
          success: true,
          appointment_id: appt.id,
          date,
          time12: fmt12(time),
          end12: fmt12(addMinutesToTime(time, duration_min)),
          duration_min,
          services,
          amount: amount > 0 ? `$${amount.toFixed(2)}` : null,
        };
      }

      case "book_multi_appointment": {
        const {
          pet_ids,
          groomer_id,
          date,
          time,
          duration_min,
          services,
          notes,
          client_name,
          pet_names,
          groomer_email,
        } = input;

        if (!Array.isArray(pet_ids) || pet_ids.length < 2) {
          return { success: false, error: "book_multi_appointment requires at least 2 pet_ids." };
        }

        const { data: pets, error: petsErr } = await supabase
          .from("pets")
          .select("id, name, slot_weight")
          .in("id", pet_ids);

        if (petsErr) {
          return { success: false, error: petsErr.message };
        }

        if (!pets || pets.length !== pet_ids.length) {
          return { success: false, error: "Could not load all selected pets." };
        }

        const petMap = new Map(pets.map((p) => [p.id, p]));
        const orderedPets = pet_ids.map((id) => petMap.get(id)).filter(Boolean);

        const DEFAULT_PRICING = {
          Bath: { 1: 25, 2: 40, 3: 60 },
          "Full Groom": { 1: 45, 2: 65, 3: 90 },
          Nails: { 1: 15, 2: 15, 3: 20 },
          Teeth: { 1: 15, 2: 15, 3: 20 },
          Deshed: { 1: 35, 2: 55, 3: 75 },
          "Anal Glands": { 1: 15, 2: 15, 3: 20 },
          "Puppy Trim": { 1: 40, 2: 55, 3: 75 },
          Other: { 1: 0, 2: 0, 3: 0 },
        };

        const { data: groomerData } = await supabase
          .from("groomers")
          .select("service_pricing")
          .eq("id", groomer_id)
          .single();

        const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };

        const rows = orderedPets.map((pet) => {
          const sz = pet.slot_weight || 1;
          const amount = computeAmountForServices(pricing, services, sz);
          return {
            pet_id: pet.id,
            groomer_id,
            date,
            time,
            duration_min,
            services,
            slot_weight: sz,
            amount: amount > 0 ? amount : null,
            notes: notes || "",
            confirmed: false,
            no_show: false,
            paid: false,
            reminder_enabled: true,
          };
        });

        const { data: inserted, error: insertErr } = await supabase
          .from("appointments")
          .insert(rows)
          .select("id");

        if (insertErr) {
          return { success: false, error: insertErr.message };
        }

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `New multi-pet booking (SMS) — ${(pet_names || orderedPets.map((p) => p.name)).join(", ")} on ${date}`,
              template: "groomer_notification",
              data: {
                pet_name: (pet_names || orderedPets.map((p) => p.name)).join(", "),
                client_name: client_name || "—",
                date,
                time,
                duration_min,
                services: services.join(", "),
                amount: rows
                  .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
                  .toFixed(2),
                notes: notes || "",
              },
            }),
          }).catch(() => {});
        }

        return {
          success: true,
          appointment_ids: (inserted || []).map((r) => r.id),
          pet_names: pet_names || orderedPets.map((p) => p.name),
          date,
          time12: fmt12(time),
          end12: fmt12(addMinutesToTime(time, duration_min)),
          duration_min,
          services,
        };
      }

      case "get_upcoming_appointments": {
        const { client_id, groomer_id } = input;

        const { data: pets } = await supabase
          .from("pets")
          .select("id, name")
          .eq("client_id", client_id)
          .eq("groomer_id", groomer_id);

        if (!pets?.length) return { appointments: [] };

        const today = new Date().toISOString().slice(0, 10);

        const { data: appts } = await supabase
          .from("appointments")
          .select("id, date, time, duration_min, services, pets(name)")
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
          })),
        };
      }

      case "cancel_appointment": {
        const {
          appointment_id,
          groomer_id,
          groomer_email,
          pet_name,
          client_name,
          date,
          time,
          services,
        } = input;

        if (date && time) {
          const [y, mo, d] = date.split("-").map(Number);
          const [h, m] = (time || "00:00").slice(0, 5).split(":").map(Number);
          const apptMs = new Date(y, mo - 1, d, h, m).getTime();

          if (apptMs - Date.now() < 24 * 60 * 60 * 1000) {
            return {
              success: false,
              within_cutoff: true,
              message:
                "This appointment is within 24 hours and cannot be cancelled online. Please call or text your groomer directly.",
            };
          }
        }

        const { error } = await supabase
          .from("appointments")
          .delete()
          .eq("id", appointment_id)
          .eq("groomer_id", groomer_id);

        if (error) {
          return { success: false, error: error.message };
        }

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `Appointment cancelled (SMS) — ${pet_name || "a pet"} on ${date}`,
              template: "groomer_cancellation",
              data: {
                pet_name: pet_name || "—",
                client_name: client_name || "—",
                date: date || "—",
                time: time || "—",
                duration_min: "",
                services: services || "—",
                notes: "",
              },
            }),
          }).catch(() => {});
        }

        return { success: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`Tool error [${name}]:`, err);
    return { error: err.message };
  }
}

/* ─────────────────────────────────────────
   TRIM TOOL RESULTS — only send what Claude needs
───────────────────────────────────────── */
function trimToolResult(toolName, result) {
  switch (toolName) {
    case "lookup_client":
      if (!result.found) return result;
      return {
        found: true,
        client_id: result.client_id,
        client_name: result.client_name,
        groomer_id: result.groomer_id,
        groomer_email: result.groomer_email,
        groomer_time_zone: result.groomer_time_zone,
        pets: result.pets,
      };

    case "get_available_slots":
      return {
        available: result.available,
        date: result.date,
        duration_min: result.duration_min,
        slots: result.slots?.slice(0, 6),
        reason: result.reason,
        unavailable_type: result.unavailable_type,
      };

    case "get_next_available_days":
      return {
        start_date: result.start_date,
        days_checked: result.days_checked,
        available_days: result.available_days,
        unavailable_summary: result.unavailable_summary,
      };

    case "book_appointment":
      return {
        success: result.success,
        date: result.date,
        time12: result.time12,
        end12: result.end12,
        duration_min: result.duration_min,
        services: result.services,
        amount: result.amount,
        error: result.error,
      };

    case "book_multi_appointment":
      return {
        success: result.success,
        pet_names: result.pet_names,
        date: result.date,
        time12: result.time12,
        end12: result.end12,
        duration_min: result.duration_min,
        services: result.services,
        error: result.error,
      };

    case "get_upcoming_appointments":
      return {
        appointments: result.appointments?.slice(0, 5),
      };

    case "cancel_appointment":
      return {
        success: result.success,
        within_cutoff: result.within_cutoff,
        message: result.message,
        error: result.error,
      };

    default:
      return result;
  }
}

/* ─────────────────────────────────────────
   LOAD CONVERSATION
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

  const lastMsg = new Date(data.last_message_at).getTime();
  if (Date.now() - lastMsg > CONVERSATION_TIMEOUT_MS) {
    return null;
  }

  return {
    ...data,
    messages: toSafeHistory(data.messages),
  };
}

/* ─────────────────────────────────────────
   SAVE CONVERSATION
───────────────────────────────────────── */
async function saveConversation({ phone, groomerId, clientId, messages, existingId, clientContext }) {
  if (existingId) {
    await supabase
      .from("sms_conversations")
      .update({
        messages,
        client_id: clientId || null,
        client_context: clientContext || null,
        groomer_id: groomerId || null,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", existingId);
  } else {
    await supabase.from("sms_conversations").insert({
      phone,
      groomer_id: groomerId || null,
      client_id: clientId || null,
      client_context: clientContext || null,
      messages,
      last_message_at: new Date().toISOString(),
    });
  }
}

/* ─────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────── */
function buildSystemPrompt(fromPhone, cachedContext) {
  const today = new Date().toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const clientInfo = cachedContext
    ? `Client already identified: ${JSON.stringify(cachedContext)}. Do NOT call lookup_client — you already have the client info above.`
    : `FIRST: Call lookup_client with phone="${fromPhone}" immediately. Never ask for their name.`;

  return `SMS scheduling assistant for a dog grooming business. Today is ${dayName}, ${today}. Client phone: ${fromPhone}

${clientInfo}

TASKS: Book appointments, view upcoming appointments, cancel appointments (24hr policy).

BOOKING FLOW:
1. Confirm pet if multiple pets exist.
2. If the client wants 2 or more pets at the same time, gather all pet names first.
3. Ask for date/day and services if missing.
4. Convert requested services into duration.
5. For one pet, call get_available_slots with that pet's slot_weight.
6. For multiple pets together, add their slot_weight values and call get_available_slots with the COMBINED total slot weight.
7. If get_available_slots says unavailable for ANY reason, do NOT stop there.
8. If unavailable because of vacation, not working, or no openings, call get_next_available_days starting from the requested date for 7-10 days and offer 1-3 nearby alternatives.
9. If the client asks for a specific time like "Anything at 3?" after alternatives were offered, treat that as interest in 3:00 PM on one of the offered dates and answer using the tool results or re-check availability for that date.
10. Only after a valid slot exists should you confirm the exact time, duration, and time range before booking.
11. For one pet, call book_appointment.
12. For multiple pets together, call book_multi_appointment.

IMPORTANT SCHEDULING RULES:
- Never make up availability.
- Never say a day is unavailable without giving alternatives when tools can provide them.
- If the whole checked window is vacation or closed, say so plainly and ask what later week works.
- If the client gives a weekday like "Tuesday next week," use that exact requested day first.
- When offering times, mention the time range, not just the start time.
- When confirming a booking, say the duration clearly. Example: "That will be a 60-minute appointment. I can do 9:00–10:00 AM. Want me to book it?"
- For multiple pets at the same time, only offer a slot if the combined slot weight fits within the groomer's capacity.

SERVICES: Bath, Full Groom, Nails, Teeth, Deshed, Anal Glands, Puppy Trim, Other
DURATIONS: Full Groom=60min, Bath=30min, Nails=15min, Teeth=15min, Deshed=60min, Anal Glands=15min, Puppy Trim=60min, Other=30min default. Multiple services add up, max 90min unless client explicitly asks for more.

CANCELLATION: get_upcoming_appointments first → confirm which one → cancel_appointment. Within 24hrs = tell them to call directly.

STYLE:
- Short SMS replies, max 3 sentences, friendly.
- Prefer specific days/times over vague wording.
- If client not found, tell them to contact their groomer.`;
}

/* ─────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────── */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const fromPhone = body?.data?.payload?.from?.phone_number;
  const incomingText = body?.data?.payload?.text?.trim();

  if (!fromPhone || !incomingText) {
    return { statusCode: 200, body: "Ignored" };
  }

  console.log(`SMS from ${fromPhone}: ${incomingText}`);

  if (incomingText.toUpperCase() === "STOP") {
    return { statusCode: 200, body: "STOP handled elsewhere" };
  }

  try {
    const existing = await loadConversation(fromPhone);
    const conversationId = existing?.id || null;
    const messages = Array.isArray(existing?.messages) ? [...existing.messages] : [];
    const cachedContext = existing?.client_context || null;

    const groomerId = existing?.groomer_id || cachedContext?.groomer_id || null;
    const clientId = cachedContext?.client_id || null;

    messages.push({ role: "user", content: incomingText });

    let finalResponse = null;
    let currentMessages = [...messages];
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let newClientContext = cachedContext;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: buildSystemPrompt(fromPhone, newClientContext),
        tools,
        messages: currentMessages,
      });

      console.log(`Claude iteration ${iterations}, stop_reason: ${response.stop_reason}`);

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        finalResponse = textBlock?.text || "Sorry, something went wrong. Please try again.";
        currentMessages.push({ role: "assistant", content: response.content });
        break;
      }

      if (response.stop_reason === "tool_use") {
        currentMessages.push({ role: "assistant", content: response.content });

        const toolResults = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          console.log(`Tool call: ${block.name}`, JSON.stringify(block.input).slice(0, 500));

          const result = await executeTool(block.name, block.input);

          if (block.name === "lookup_client" && result.found) {
            newClientContext = {
              client_id: result.client_id,
              client_name: result.client_name,
              groomer_id: result.groomer_id,
              groomer_name: result.groomer_name,
              groomer_email: result.groomer_email,
              groomer_time_zone: result.groomer_time_zone,
              pets: result.pets,
            };
          }

          const trimmedResult = trimToolResult(block.name, result);

          console.log(`Tool result: ${block.name}`, JSON.stringify(trimmedResult).slice(0, 500));

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(trimmedResult),
          });
        }

        currentMessages.push({ role: "user", content: toolResults });
        continue;
      }

      console.error("Unexpected stop_reason:", response.stop_reason);
      finalResponse = "Sorry, I had trouble with that. Please try again.";
      break;
    }

    if (!finalResponse) {
      finalResponse = "Sorry, something went wrong. Please try again or call us directly.";
    }

    const trimmedMessages = toSafeHistory([
      ...messages.slice(0, -1),
      { role: "user", content: incomingText },
      { role: "assistant", content: finalResponse },
    ]);

    const resolvedClientId = clientId || newClientContext?.client_id || null;
    const resolvedGroomerId = groomerId || newClientContext?.groomer_id || null;

    await saveConversation({
      phone: fromPhone,
      groomerId: resolvedGroomerId,
      clientId: resolvedClientId,
      messages: trimmedMessages,
      existingId: conversationId,
      clientContext: newClientContext,
    });

    console.log("Final response to send:", finalResponse);
    await sendSms(fromPhone, finalResponse);

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("smsBot fatal error:", err);

    try {
      await sendSms(
        fromPhone,
        "Sorry, I'm having trouble right now. Please call or text your groomer directly."
      );
    } catch (sendErr) {
      console.error("Failed to send fallback:", sendErr);
    }

    return { statusCode: 200, body: "Error handled" };
  }
};