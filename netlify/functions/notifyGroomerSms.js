/**
 * notifyGroomerSms.js — Netlify function
 *
 * Sends an SMS to the groomer's business_phone when a new booking
 * is submitted from their booking page.
 *
 * POST body:
 *   { slug, petName, clientName, date, time, requiresApproval }
 *
 * No auth required — called from the public booking page.
 * Uses slug (already public) instead of internal groomerId.
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let slug, petName, clientName, date, time, requiresApproval;
  try {
    ({ slug, petName, clientName, date, time, requiresApproval } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!slug) {
    return { statusCode: 400, body: "Missing slug" };
  }

  // Load groomer by slug (public identifier, already in booking URL)
  const { data: groomer } = await supabase
    .from("groomers")
    .select("id, business_phone, sms_number, full_name")
    .eq("slug", slug)
    .single();

  if (!groomer) {
    return { statusCode: 404, body: "Groomer not found" };
  }

  // Basic rate limit — max 20 booking notifications per groomer per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("groomer_id", groomer.id)
    .eq("message_type", "booking_notify")
    .gte("created_at", oneHourAgo);

  if (count >= 20) {
    console.warn(`Rate limit hit for groomer ${groomer.id} — ${count} booking notifications in last hour`);
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "Rate limit" }) };
  }

  const toPhone = groomer.business_phone;
  const fromNumber = groomer.sms_number || process.env.TELNYX_PHONE_NUMBER;

  if (!toPhone || !fromNumber) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "No phone configured" }) };
  }

  const action = requiresApproval ? "booking request" : "booking";
  const message = `PawScheduler: New ${action} from ${clientName} for ${petName} on ${date} at ${fmtTime(time)}.${requiresApproval ? " Approval needed." : ""}`;

  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify({ from: fromNumber, to: toPhone, text: message }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("SMS notify failed:", err);
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "Telnyx error" }) };
  }

  // Log to sms_messages for rate limiting and usage tracking
  await supabase.from("sms_messages").insert({
    groomer_id:   groomer.id,
    client_phone: null,
    direction:    "outbound",
    body:         message,
    message_type: "booking_notify",
  }).catch(() => {}); // non-blocking

  return { statusCode: 200, body: JSON.stringify({ sent: true }) };
};