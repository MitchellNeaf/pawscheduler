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

/* ─────────────────────────────────────────
   TIME SLOTS (module-level, built once)
───────────────────────────────────────── */
const TIME_SLOTS = [];
for (let h = 6; h <= 20; h++) {
  for (const min of [0, 15, 30, 45]) {
    TIME_SLOTS.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
}

/* ─────────────────────────────────────────
   SEND SMS
───────────────────────────────────────── */
async function sendSms(to, text) {
  console.log(`Sending SMS to ${to}: ${text}`);
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
   PURE HELPERS
───────────────────────────────────────── */
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addMinutesToTime(time24, minutesToAdd) {
  const [h, m] = time24.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + (Number(minutesToAdd) || 0);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getWeekdayUTC(dateStr) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function formatDateLong(dateStr) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function computeAmount(pricing, services, slotWeight) {
  const sz = slotWeight || 1;
  return (services || [])
    .filter((s) => s !== "Other")
    .reduce((sum, svc) => {
      const row = pricing?.[svc];
      return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
    }, 0);
}

// Strip tool blocks — only keep plain text turns for history
function toSafeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  const safe = [];
  for (const msg of messages) {
    if (!msg?.role) continue;
    if (typeof msg.content === "string") {
      safe.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text.trim())
        .filter(Boolean)
        .join("\n");
      if (text) safe.push({ role: msg.role, content: text });
    }
  }
  return safe.slice(-12);
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
   SHARED AVAILABILITY HELPER
   Used by both get_available_slots tool
   AND the pre-insert re-validation in bookPets().
   Single source of truth for slot logic.
───────────────────────────────────────── */
async function getAvailabilityForDate({ date, duration_min, groomer_id, combined_slot_weight = 1 }) {
  // 1. groomer capacity
  const { data: groomer, error: gErr } = await supabase
    .from("groomers").select("max_parallel").eq("id", groomer_id).single();
  if (gErr) return { available: false, reason: `Groomer load error: ${gErr.message}` };
  const maxParallel = groomer?.max_parallel || 1;

  // 2. vacation
  const { data: vacs } = await supabase
    .from("vacation_days").select("date, start_time, end_time")
    .eq("groomer_id", groomer_id).eq("date", date);
  if (vacs?.some((v) => !v.start_time && !v.end_time)) {
    return { available: false, reason: "Groomer is on vacation this day.", type: "vacation" };
  }

  // 3. working hours
  const weekday = getWeekdayUTC(date);
  const { data: hours } = await supabase
    .from("working_hours").select("start_time, end_time")
    .eq("groomer_id", groomer_id).eq("weekday", weekday).maybeSingle();
  if (!hours?.start_time || !hours?.end_time) {
    return { available: false, reason: "Groomer is not working this day.", type: "not_working" };
  }

  const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
  const endIdx   = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    return { available: false, reason: "Working hours misconfigured." };
  }
  const workingSlots = TIME_SLOTS.slice(startIdx, endIdx);

  // 4. breaks (exclusive end)
  const { data: breaks } = await supabase
    .from("working_breaks").select("break_start, break_end")
    .eq("groomer_id", groomer_id).eq("weekday", weekday);
  const breakSet = new Set();
  (breaks || []).forEach((b) => {
    const bi = TIME_SLOTS.indexOf((b.break_start || "").slice(0, 5));
    const ei = TIME_SLOTS.indexOf((b.break_end   || "").slice(0, 5));
    if (bi >= 0 && ei > bi) TIME_SLOTS.slice(bi, ei).forEach((s) => breakSet.add(s));
  });
  // partial vacation blocks
  (vacs || []).forEach((v) => {
    if (!v.start_time || !v.end_time) return;
    const vi = TIME_SLOTS.indexOf(v.start_time.slice(0, 5));
    const vj = TIME_SLOTS.indexOf(v.end_time.slice(0, 5));
    if (vi >= 0 && vj > vi) TIME_SLOTS.slice(vi, vj).forEach((s) => breakSet.add(s));
  });

  // 5. existing appointments load
  const { data: appts } = await supabase
    .from("appointments").select("time, duration_min, slot_weight, no_show")
    .eq("groomer_id", groomer_id).eq("date", date);

  const loadAt = (slot) => {
    let total = 0;
    (appts || []).forEach((a) => {
      if (a.no_show === true) return;
      const idx = TIME_SLOTS.indexOf((a.time || "").slice(0, 5));
      if (idx < 0) return;
      const occupied = TIME_SLOTS.slice(idx, idx + Math.ceil((a.duration_min || 15) / 15));
      if (occupied.includes(slot)) total += a.slot_weight ?? 1;
    });
    return total;
  };

  // 6. find valid start slots
  const blocks = Math.ceil((duration_min || 15) / 15);
  const open = [];
  workingSlots.forEach((slot, i) => {
    if (breakSet.has(slot)) return;
    const window = workingSlots.slice(i, i + blocks);
    if (window.length < blocks) return;
    if (window.some((s) => breakSet.has(s))) return;
    if (window.some((s) => loadAt(s) + combined_slot_weight > maxParallel)) return;
    open.push(slot);
  });

  // Only show :00 and :30 to keep SMS clean
  const filtered = open.filter((s) => s.endsWith(":00") || s.endsWith(":30"));

  if (!filtered.length) {
    return { available: false, reason: "No openings on this day.", type: "full" };
  }

  return {
    available: true,
    date,
    slots: filtered.slice(0, 6).map((s) => ({
      time24: s,
      time12: fmt12(s),
      end12:  fmt12(addMinutesToTime(s, duration_min)),
      range12: `${fmt12(s)}–${fmt12(addMinutesToTime(s, duration_min))}`,
    })),
  };
}

/* ─────────────────────────────────────────
   SHARED BOOKING FUNCTION
   Handles 1 or more pets atomically:
   - re-validates capacity with combined weight
   - inserts all rows or none (fails fast)
   Used by book_appointment tool only.
───────────────────────────────────────── */
async function bookPets({ pets, groomer_id, date, time, duration_min, services, notes,
                          client_name, groomer_email }) {
  if (!Array.isArray(pets) || pets.length === 0) {
    return { success: false, error: "No pets provided." };
  }

  const combinedWeight = pets.reduce((sum, p) => sum + (p.slot_weight || 1), 0);

  // Re-validate slot is still open with combined weight
  const recheck = await getAvailabilityForDate({
    date, duration_min, groomer_id, combined_slot_weight: combinedWeight,
  });

  if (!recheck.available) {
    return { success: false, slot_taken: true, error: `Slot no longer available: ${recheck.reason}` };
  }

  const slotOk = recheck.slots?.some((s) => s.time24 === time.slice(0, 5));
  if (!slotOk) {
    const alts = recheck.slots?.slice(0, 3).map((s) => s.time12).join(", ") || "none";
    return {
      success: false, slot_taken: true,
      error: `That exact time was just taken. Other available times: ${alts}.`,
    };
  }

  // Load groomer pricing once
  const { data: groomerData } = await supabase
    .from("groomers").select("service_pricing").eq("id", groomer_id).single();
  const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };

  // Build one row per pet
  const rows = pets.map((pet) => {
    const sz = pet.slot_weight || 1;
    const amount = computeAmount(pricing, services, sz);
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

  const { data: inserted, error } = await supabase
    .from("appointments").insert(rows).select("id");

  if (error) return { success: false, error: error.message };

  const petNames = pets.map((p) => p.name).join(", ");
  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // Groomer notification email (fire-and-forget)
  if (groomer_email) {
    fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: groomer_email,
        subject: `New SMS booking — ${petNames} on ${date}`,
        template: "groomer_notification",
        data: {
          pet_name: petNames,
          client_name: client_name || "—",
          date,
          time,
          duration_min,
          services: services.join(", "),
          amount: totalAmount > 0 ? `$${totalAmount.toFixed(2)}` : "—",
          notes: notes || "",
        },
      }),
    }).catch(() => {});
  }

  return {
    success: true,
    appointment_ids: (inserted || []).map((r) => r.id),
    pet_names: petNames,
    date,
    time12: fmt12(time),
    end12: fmt12(addMinutesToTime(time, duration_min)),
    services,
    amount: totalAmount > 0 ? `$${totalAmount.toFixed(2)}` : null,
  };
}

/* ─────────────────────────────────────────
   TOOL DEFINITIONS
   book_appointment handles 1 OR multiple pets.
   get_available_slots uses combined_slot_weight.
───────────────────────────────────────── */
const tools = [
  {
    name: "lookup_client",
    description: "Look up a client by phone number. Returns client info and pets. Call this first on every new conversation.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "E.164 phone number e.g. +18145554321" },
      },
      required: ["phone"],
    },
  },
  {
    name: "get_available_slots",
    description: "Get available slots for a date. Pass combined_slot_weight as the SUM of all pets being booked together. Returns open times with ranges.",
    input_schema: {
      type: "object",
      properties: {
        date:                { type: "string", description: "YYYY-MM-DD" },
        duration_min:        { type: "number", description: "Total appointment duration in minutes" },
        groomer_id:          { type: "string", description: "Groomer UUID" },
        combined_slot_weight: { type: "number", description: "Sum of slot weights for all pets being booked. 1 pet S/M=1, Large=2, XL=3. 2 pets S/M=2." },
      },
      required: ["date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "get_next_available_days",
    description: "Scan the next N days from start_date and return days that have open slots. Use when a requested day has no availability.",
    input_schema: {
      type: "object",
      properties: {
        start_date:          { type: "string", description: "YYYY-MM-DD to start scanning from" },
        days:                { type: "number", description: "How many days to scan (max 14)" },
        duration_min:        { type: "number", description: "Duration in minutes" },
        groomer_id:          { type: "string", description: "Groomer UUID" },
        combined_slot_weight: { type: "number", description: "Combined slot weight for all pets" },
      },
      required: ["start_date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "book_appointment",
    description: "Book one OR more pets at the same date and time. Pass an array of pet objects. Re-validates capacity before inserting. Only call after client confirms all details.",
    input_schema: {
      type: "object",
      properties: {
        pets: {
          type: "array",
          description: "Array of pets to book. Each must have id, name, slot_weight.",
          items: {
            type: "object",
            properties: {
              id:          { type: "string" },
              name:        { type: "string" },
              slot_weight: { type: "number" },
            },
            required: ["id", "name", "slot_weight"],
          },
        },
        groomer_id:   { type: "string" },
        date:         { type: "string", description: "YYYY-MM-DD" },
        time:         { type: "string", description: "HH:MM 24hr" },
        duration_min: { type: "number" },
        services:     { type: "array", items: { type: "string" }, description: "e.g. ['Full Groom', 'Nails']" },
        notes:        { type: "string" },
        client_name:  { type: "string" },
        groomer_email: { type: "string" },
      },
      required: ["pets", "groomer_id", "date", "time", "duration_min", "services"],
    },
  },
  {
    name: "get_upcoming_appointments",
    description: "Get all upcoming appointments for a client.",
    input_schema: {
      type: "object",
      properties: {
        client_id:  { type: "string" },
        groomer_id: { type: "string" },
      },
      required: ["client_id", "groomer_id"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel an appointment. Enforces 24hr policy.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string" },
        groomer_id:     { type: "string" },
        groomer_email:  { type: "string" },
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

        console.log("lookup_client:", JSON.stringify({ count: clients?.length, clientErr }));

        if (clientErr) return { found: false, message: "DB error: " + clientErr.message };
        if (!clients?.length) return { found: false, message: "Client not found." };

        const matches = [];
        for (const c of clients) {
          const { data: gr } = await supabase
            .from("groomers")
            .select("id, full_name, email, sms_bot_enabled, time_zone")
            .eq("id", c.groomer_id).single();
          console.log(`Groomer for ${c.full_name}: sms_bot_enabled=${gr?.sms_bot_enabled}`);
          if (gr?.sms_bot_enabled) matches.push({ client: c, groomer: gr });
        }

        if (!matches.length) return { found: false, message: "No active bot groomer for this client." };

        // Prefer client with most pets
        matches.sort((a, b) => (b.client.pets?.length || 0) - (a.client.pets?.length || 0));
        const { client: mc, groomer: mg } = matches[0];

        return {
          found: true,
          client_id: mc.id,
          client_name: mc.full_name,
          groomer_id: mg.id,
          groomer_name: mg.full_name,
          groomer_email: mg.email,
          groomer_time_zone: mg.time_zone || "America/New_York",
          pets: (mc.pets || []).map((p) => ({
            id: p.id,
            name: p.name,
            slot_weight: p.slot_weight || 1,
            tags: p.tags || [],
            notes: p.notes || "",
          })),
        };
      }

      case "get_available_slots": {
        const { date, duration_min, groomer_id, combined_slot_weight = 1 } = input;
        return await getAvailabilityForDate({ date, duration_min, groomer_id, combined_slot_weight });
      }

      case "get_next_available_days": {
        const { start_date, days = 7, duration_min, groomer_id, combined_slot_weight = 1 } = input;
        const limit = Math.min(Number(days) || 7, 14);
        const found = [];
        const summary = { vacation: 0, not_working: 0, full: 0 };

        for (let i = 0; i < limit; i++) {
          const date = addDays(start_date, i);
          const info = await getAvailabilityForDate({ date, duration_min, groomer_id, combined_slot_weight });
          if (info.available) {
            found.push({ date, date_label: formatDateLong(date), slots: info.slots.slice(0, 3) });
            if (found.length >= 5) break;
          } else {
            summary[info.type || "full"] = (summary[info.type || "full"] || 0) + 1;
          }
        }

        return { start_date, days_checked: limit, available_days: found, unavailable_summary: summary };
      }

      case "book_appointment": {
        // Single unified booking path for 1 or more pets
        return await bookPets({
          pets:         input.pets,
          groomer_id:   input.groomer_id,
          date:         input.date,
          time:         input.time,
          duration_min: input.duration_min,
          services:     input.services,
          notes:        input.notes,
          client_name:  input.client_name,
          groomer_email: input.groomer_email,
        });
      }

      case "get_upcoming_appointments": {
        const { client_id, groomer_id } = input;
        const { data: pets } = await supabase
          .from("pets").select("id").eq("client_id", client_id).eq("groomer_id", groomer_id);
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
            end12: fmt12(addMinutesToTime((a.time || "").slice(0, 5), a.duration_min || 15)),
            services: Array.isArray(a.services) ? a.services.join(", ") : a.services,
          })),
        };
      }

      case "cancel_appointment": {
        const { appointment_id, groomer_id, groomer_email, pet_name, client_name, date, time, services } = input;

        // 24hr check
        if (date && time) {
          const [y, mo, d] = date.split("-").map(Number);
          const [h, m] = (time || "00:00").slice(0, 5).split(":").map(Number);
          if (new Date(y, mo - 1, d, h, m).getTime() - Date.now() < 24 * 60 * 60 * 1000) {
            return {
              success: false, within_cutoff: true,
              message: "Within 24 hours — please call or text your groomer directly.",
            };
          }
        }

        const { error } = await supabase
          .from("appointments").delete()
          .eq("id", appointment_id).eq("groomer_id", groomer_id);

        if (error) return { success: false, error: error.message };

        if (groomer_email) {
          fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: groomer_email,
              subject: `Appointment cancelled (SMS) — ${pet_name || "a pet"} on ${date}`,
              template: "groomer_cancellation",
              data: { pet_name: pet_name || "—", client_name: client_name || "—",
                      date: date || "—", time: time || "—", duration_min: "", services: services || "—", notes: "" },
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
   TRIM TOOL RESULTS (reduce tokens sent to Claude)
───────────────────────────────────────── */
function trimResult(name, result) {
  switch (name) {
    case "lookup_client":
      return result.found
        ? { found: true, client_id: result.client_id, client_name: result.client_name,
            groomer_id: result.groomer_id, groomer_email: result.groomer_email,
            groomer_time_zone: result.groomer_time_zone, pets: result.pets }
        : result;
    case "get_available_slots":
      return { available: result.available, date: result.date,
               slots: result.slots?.slice(0, 6), reason: result.reason, type: result.type };
    case "get_next_available_days":
      return { available_days: result.available_days, unavailable_summary: result.unavailable_summary };
    case "book_appointment":
      return { success: result.success, pet_names: result.pet_names, date: result.date,
               time12: result.time12, end12: result.end12, services: result.services,
               amount: result.amount, slot_taken: result.slot_taken, error: result.error };
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
   RATE LIMITER — 30 messages per phone per day
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
  if (count >= 30) {
    console.log(`Rate limit hit for ${phone}: ${count} messages today`);
    return true;
  }
  return false;
}

/* ─────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────── */
function buildSystemPrompt(fromPhone, cachedContext) {
  const today = new Date().toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const clientInfo = cachedContext
    ? `Client already identified: ${JSON.stringify(cachedContext)}. Do NOT call lookup_client — you already have everything above.`
    : `FIRST: Call lookup_client with phone="${fromPhone}" immediately. Do not ask for their name.`;

  return `SMS scheduling assistant for a dog grooming business. Today is ${dayName}, ${today}.

${clientInfo}

TASKS: Book appointments · View upcoming appointments · Cancel appointments (24hr policy)

BOOKING FLOW:
1. Confirm which pet(s). If multiple pets at once, gather all names.
2. Ask date and services if not given.
3. Duration: Full Groom=60, Bath=30, Nails=15, Teeth=15, Deshed=60, Anal Glands=15, Puppy Trim=60. Add durations, max 90min.
4. Call get_available_slots with combined_slot_weight = sum of all pets' slot weights.
5. If unavailable, call get_next_available_days and offer alternatives. Never dead-end.
6. Confirm pet(s), date, time range, services, and duration before booking.
7. Call book_appointment with pets array (works for 1 or more pets).

SERVICES: Bath, Full Groom, Nails, Teeth, Deshed, Anal Glands, Puppy Trim, Other

CANCELLATION: get_upcoming_appointments → confirm which → cancel_appointment. Within 24hrs → tell them to call directly.

STYLE: Short replies, max 3 sentences. Show time ranges not just start times. Never invent availability. Never book without confirmation.`;
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

  console.log(`SMS from ${fromPhone}: ${incomingText}`);

  if (incomingText.toUpperCase() === "STOP") return { statusCode: 200, body: "STOP handled elsewhere" };

  // Rate limit check
  if (await isRateLimited(fromPhone)) {
    await sendSms(fromPhone, "You've reached the daily message limit. Please call your groomer directly, or try again tomorrow.");
    return { statusCode: 200, body: "Rate limited" };
  }

  try {
    // Load conversation by phone only — no pre-lookup needed
    const existing    = await loadConversation(fromPhone);
    const conversationId = existing?.id || null;
    const messages    = Array.isArray(existing?.messages) ? [...existing.messages] : [];
    const cachedContext = existing?.client_context || null;
    const groomerId   = existing?.groomer_id || cachedContext?.groomer_id || null;
    const clientId    = cachedContext?.client_id || null;

    messages.push({ role: "user", content: incomingText });

    let finalResponse   = null;
    let currentMessages = [...messages];
    let iterations      = 0;
    let newClientContext = cachedContext;

    while (iterations < 10) {
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
          console.log(`Tool call: ${block.name}`, JSON.stringify(block.input).slice(0, 400));

          const result = await executeTool(block.name, block.input);

          // Cache client context after first successful lookup
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

          const trimmed = trimResult(block.name, result);
          console.log(`Tool result: ${block.name}`, JSON.stringify(trimmed).slice(0, 400));

          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(trimmed) });
        }

        currentMessages.push({ role: "user", content: toolResults });
        continue;
      }

      console.error("Unexpected stop_reason:", response.stop_reason);
      finalResponse = "Sorry, I had trouble with that. Please try again.";
      break;
    }

    if (!finalResponse) finalResponse = "Sorry, something went wrong. Please try again or call us directly.";

    // Save only clean text history, last 12 turns
    const trimmedMessages = toSafeHistory([
      ...messages.slice(0, -1),
      { role: "user",      content: incomingText },
      { role: "assistant", content: finalResponse },
    ]);

    await saveConversation({
      phone: fromPhone,
      groomerId:  groomerId  || newClientContext?.groomer_id || null,
      clientId:   clientId   || newClientContext?.client_id  || null,
      messages:   trimmedMessages,
      existingId: conversationId,
      clientContext: newClientContext,
    });

    console.log("Final response:", finalResponse);
    await sendSms(fromPhone, finalResponse);
    return { statusCode: 200, body: "OK" };

  } catch (err) {
    console.error("smsBot fatal error:", err);
    try { await sendSms(fromPhone, "Sorry, I'm having trouble right now. Please call your groomer directly."); }
    catch {}
    return { statusCode: 200, body: "Error handled" };
  }
};