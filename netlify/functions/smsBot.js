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
   SEND SMS via Telnyx
───────────────────────────────────────── */
async function sendSms(to, text) {
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: BOT_NUMBER, to, text }),
  });

  if (!res.ok) {
    console.error("Telnyx send failed:", await res.text());
  }
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
          description: "The client's phone number exactly as provided in the system prompt in E.164 format e.g. +18145554321",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "get_available_slots",
    description:
      "Get available appointment time slots for a specific date. Returns open slots based on the groomer's working hours, breaks, vacation days, and existing appointments.",
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
          description: "The pet's slot weight (1=S/M, 2=Large, 3=XL)",
        },
      },
      required: ["date", "duration_min", "groomer_id"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment for a pet. Only call this after confirming the date, time, and services with the client.",
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
        // Step 1: Find client by phone
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

        // Step 2: For each client, check their groomer has bot enabled
        let matchedClient = null;
        let matchedGroomer = null;

        for (const c of clients) {
          const { data: groomer, error: gErr } = await supabase
            .from("groomers")
            .select("id, full_name, email, sms_bot_enabled, time_zone, max_parallel")
            .eq("id", c.groomer_id)
            .single();

          console.log(`Groomer for client ${c.full_name}:`, JSON.stringify({ groomer, gErr }));

          if (!gErr && groomer?.sms_bot_enabled === true) {
            matchedClient = c;
            matchedGroomer = groomer;
            break;
          }
        }

        if (!matchedClient || !matchedGroomer) {
          return { found: false, message: "No active bot groomer found for this client." };
        }

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

        // Get groomer capacity
        const { data: groomer } = await supabase
          .from("groomers")
          .select("max_parallel")
          .eq("id", groomer_id)
          .single();

        const maxParallel = groomer?.max_parallel || 1;

        // Check vacation
        const { data: vacs } = await supabase
          .from("vacation_days")
          .select("*")
          .eq("groomer_id", groomer_id)
          .eq("date", date);

        if (vacs?.some((v) => !v.start_time && !v.end_time)) {
          return { available: false, reason: "Groomer is on vacation this day." };
        }

        // Get weekday (UTC safe)
        const [y, m, d] = date.split("-").map(Number);
        const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

        // Working hours
        const { data: hours } = await supabase
          .from("working_hours")
          .select("*")
          .eq("groomer_id", groomer_id)
          .eq("weekday", weekday)
          .maybeSingle();

        if (!hours) {
          return { available: false, reason: "Groomer is not working this day." };
        }

        // Build time slots (15 min increments)
        const TIME_SLOTS = [];
        for (let h = 6; h <= 20; h++) {
          for (let min of [0, 15, 30, 45]) {
            TIME_SLOTS.push(
              `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
            );
          }
        }

        const startIdx = TIME_SLOTS.indexOf(hours.start_time.slice(0, 5));
        const endIdx = TIME_SLOTS.indexOf(hours.end_time.slice(0, 5));
        const workingSlots = TIME_SLOTS.slice(startIdx, endIdx + 1);

        // Get breaks
        const { data: breaks } = await supabase
          .from("working_breaks")
          .select("*")
          .eq("groomer_id", groomer_id)
          .eq("weekday", weekday);

        const breakSet = new Set();
        (breaks || []).forEach((b) => {
          const bi = TIME_SLOTS.indexOf(b.break_start.slice(0, 5));
          const ei = TIME_SLOTS.indexOf(b.break_end.slice(0, 5));
          if (bi !== -1 && ei !== -1) {
            TIME_SLOTS.slice(bi, ei + 1).forEach((s) => breakSet.add(s));
          }
        });

        // Get existing appointments
        const { data: appts } = await supabase
          .from("appointments")
          .select("time, duration_min, slot_weight")
          .eq("groomer_id", groomer_id)
          .eq("date", date);

        // Calculate load per slot
        const loadForSlot = (slot) => {
          let total = 0;
          (appts || []).forEach((a) => {
            const start = (a.time || "").slice(0, 5);
            const idx = TIME_SLOTS.indexOf(start);
            if (idx < 0) return;
            const blocks = Math.ceil((a.duration_min || 15) / 15);
            const slots = TIME_SLOTS.slice(idx, idx + blocks);
            if (slots.includes(slot)) total += a.slot_weight ?? 1;
          });
          return total;
        };

        // Find valid start slots
        const blocks = Math.ceil(duration_min / 15);
        const available = [];

        workingSlots.forEach((slot, idx) => {
          if (breakSet.has(slot)) return;
          const window = workingSlots.slice(idx, idx + blocks);
          if (window.length < blocks) return;
          if (window.some((s) => breakSet.has(s))) return;
          if (window.some((s) => loadForSlot(s) + pet_slot_weight > maxParallel)) return;
          available.push(slot);
        });

        // Format nicely — only show on-the-hour and half-hour to reduce noise
        const filtered = available.filter((s) => s.endsWith(":00") || s.endsWith(":30"));

        // Format to 12hr
        const fmt12 = (t) => {
          const [h, m] = t.split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
        };

        return {
          available: filtered.length > 0,
          date,
          slots: filtered.slice(0, 6).map((s) => ({ time24: s, time12: fmt12(s) })),
          all_slots_count: filtered.length,
        };
      }

      case "book_appointment": {
        const {
          pet_id, groomer_id, date, time, duration_min,
          services, slot_weight, notes,
          client_name, pet_name, groomer_email,
        } = input;

        // Compute amount from services + slot_weight
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

        // Try to get groomer pricing
        const { data: groomerData } = await supabase
          .from("groomers")
          .select("service_pricing")
          .eq("id", groomer_id)
          .single();

        const pricing = { ...DEFAULT_PRICING, ...(groomerData?.service_pricing || {}) };
        const sz = slot_weight || 1;
        const amount = services
          .filter((s) => s !== "Other")
          .reduce((sum, svc) => {
            const row = pricing[svc];
            return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
          }, 0);

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

        // Fire groomer notification email
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

        // Format 12hr time for confirmation
        const [h, m] = time.split(":").map(Number);
        const ampm = h >= 12 ? "PM" : "AM";
        const time12 = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;

        return {
          success: true,
          appointment_id: appt.id,
          date,
          time12,
          duration_min,
          services,
          amount: amount > 0 ? `$${amount.toFixed(2)}` : null,
        };
      }

      case "get_upcoming_appointments": {
        const { client_id, groomer_id } = input;

        // Get pet IDs for this client
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

        const fmt12 = (t) => {
          if (!t) return "";
          const [h, m] = t.slice(0, 5).split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
        };

        return {
          appointments: (appts || []).map((a) => ({
            id: a.id,
            pet_name: a.pets?.name || "—",
            date: a.date,
            time12: fmt12(a.time),
            time24: (a.time || "").slice(0, 5),
            duration_min: a.duration_min,
            services: Array.isArray(a.services) ? a.services.join(", ") : a.services,
          })),
        };
      }

      case "cancel_appointment": {
        const { appointment_id, groomer_id, groomer_email, pet_name, client_name, date, time, services } = input;

        // Check 24hr cutoff
        if (date && time) {
          const [y, mo, d] = date.split("-").map(Number);
          const [h, m] = (time || "00:00").slice(0, 5).split(":").map(Number);
          const apptMs = new Date(y, mo - 1, d, h, m).getTime();
          if (apptMs - Date.now() < 24 * 60 * 60 * 1000) {
            return {
              success: false,
              within_cutoff: true,
              message: "This appointment is within 24 hours and cannot be cancelled online. Please call or text your groomer directly.",
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

        // Fire groomer cancellation email
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
   LOAD CONVERSATION
───────────────────────────────────────── */
async function loadConversation(phone, groomerId) {
  const { data } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone", phone)
    .eq("groomer_id", groomerId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Check timeout
  const lastMsg = new Date(data.last_message_at).getTime();
  if (Date.now() - lastMsg > CONVERSATION_TIMEOUT_MS) {
    return null; // Treat as fresh conversation
  }

  return data;
}

/* ─────────────────────────────────────────
   SAVE CONVERSATION
───────────────────────────────────────── */
async function saveConversation({ phone, groomerId, clientId, messages, existingId }) {
  if (existingId) {
    await supabase
      .from("sms_conversations")
      .update({
        messages,
        client_id: clientId || null,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", existingId);
  } else {
    await supabase.from("sms_conversations").insert({
      phone,
      groomer_id: groomerId,
      client_id: clientId || null,
      messages,
      last_message_at: new Date().toISOString(),
    });
  }
}

/* ─────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────── */
function buildSystemPrompt(fromPhone) {
  const today = new Date().toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return `You are a friendly SMS scheduling assistant for a dog grooming business powered by PawScheduler.

Today is ${dayName}, ${today}.
The client texting you is from phone number: ${fromPhone}

FIRST MESSAGE INSTRUCTIONS:
On the very first message, immediately call lookup_client with phone="${fromPhone}" to identify who is texting. Do not ask for their name or phone — you already have it. Use it directly.

Your job is to help clients:
1. Book grooming appointments
2. View their upcoming appointments  
3. Cancel appointments (24hr policy applies)

PERSONALITY:
- Warm, friendly, and concise — this is SMS, keep replies SHORT
- Use emojis sparingly (🐾 ✅ 📅 are fine)
- Never write more than 3-4 short sentences per message
- Sound like a helpful human, not a robot

BOOKING FLOW:
1. Always call lookup_client first to identify who is texting
2. If client not found, apologize and ask them to contact the groomer to get set up
3. Confirm the pet (if they have multiple, ask which one)
4. Ask what date they want
5. Ask what services they need
6. Calculate duration based on services (Full Groom=60min, Bath=30min, Nails=15min, Teeth=15min, Deshed=60min, multiple services add up, max 90min)
7. Call get_available_slots with the correct duration
8. Offer up to 3 time options
9. Confirm all details before booking
10. Call book_appointment only after client confirms

SERVICES (use these exact names):
Bath, Full Groom, Nails, Teeth, Deshed, Anal Glands, Puppy Trim, Other

CANCELLATION RULES:
- Always get upcoming appointments first with get_upcoming_appointments
- If only one upcoming appointment, confirm it's the right one before cancelling
- If multiple, show them and ask which to cancel
- 24hr policy: cannot cancel online within 24hrs, tell them to call directly

IMPORTANT:
- Never make up available times — always call get_available_slots
- Never book without explicit client confirmation
- If something goes wrong, apologize briefly and suggest calling the groomer
- Keep the conversation moving — don't ask for info you don't need`;
}

/* ─────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────── */
exports.handler = async (event) => {
  // Only handle POST
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
  const toPhone = body?.data?.payload?.to?.[0]?.phone_number;
  const incomingText = body?.data?.payload?.text?.trim();

  if (!fromPhone || !incomingText) {
    return { statusCode: 200, body: "Ignored" };
  }

  console.log(`SMS from ${fromPhone}: ${incomingText}`);

  // STOP is handled by telnyxWebhook — but double check here too
  if (incomingText.toUpperCase() === "STOP") {
    return { statusCode: 200, body: "STOP handled elsewhere" };
  }

  try {
    // ── Step 1: Identify the client + groomer ──
    // First do a quick lookup to find the groomer_id so we can load conversation
    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, groomer_id, groomers(sms_bot_enabled)")
      .eq("phone", fromPhone);

    const activeClient = clientRows?.find((c) => c.groomers?.sms_bot_enabled);

    // If no active client found, we still try — Claude will handle it gracefully
    const groomerId = activeClient?.groomer_id || "unknown";
    const clientId = activeClient?.id || null;

    // ── Step 2: Load conversation history ──
    const existing = await loadConversation(fromPhone, groomerId);
    const conversationId = existing?.id || null;
    const messages = existing?.messages || [];

    // Add new user message
    messages.push({ role: "user", content: incomingText });

    // ── Step 3: Run Claude with tool use loop ──
    let finalResponse = null;
    let currentMessages = [...messages];
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: buildSystemPrompt(fromPhone),
        tools,
        messages: currentMessages,
      });

      console.log(`Claude iteration ${iterations}, stop_reason: ${response.stop_reason}`);

      // If Claude is done talking (no more tool calls)
      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        finalResponse = textBlock?.text || "Sorry, something went wrong. Please try again.";
        currentMessages.push({ role: "assistant", content: response.content });
        break;
      }

      // If Claude wants to use tools
      if (response.stop_reason === "tool_use") {
        currentMessages.push({ role: "assistant", content: response.content });

        const toolResults = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          console.log(`Tool call: ${block.name}`, JSON.stringify(block.input).slice(0, 200));

          const result = await executeTool(block.name, block.input);

          console.log(`Tool result: ${block.name}`, JSON.stringify(result).slice(0, 200));

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        currentMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // Unexpected stop reason
      console.error("Unexpected stop_reason:", response.stop_reason);
      finalResponse = "Sorry, I had trouble with that. Please try again.";
      break;
    }

    if (!finalResponse) {
      finalResponse = "Sorry, something went wrong. Please try again or call us directly.";
    }

    // ── Step 4: Save updated conversation ──
    // Only save last 20 messages to keep the context manageable
    const trimmedMessages = currentMessages.slice(-20);

    await saveConversation({
      phone: fromPhone,
      groomerId: groomerId !== "unknown" ? groomerId : null,
      clientId,
      messages: trimmedMessages,
      existingId: conversationId,
    });

    // ── Step 5: Send reply ──
    await sendSms(fromPhone, finalResponse);

    return { statusCode: 200, body: "OK" };

  } catch (err) {
    console.error("smsBot fatal error:", err);

    // Try to send a fallback message
    try {
      await sendSms(fromPhone, "Sorry, I'm having trouble right now. Please call or text your groomer directly.");
    } catch (sendErr) {
      console.error("Failed to send fallback:", sendErr);
    }

    return { statusCode: 200, body: "Error handled" }; // Always 200 to Telnyx
  }
};