/**
 * notifyGroomerSms.js — Netlify function
 *
 * Sends an SMS to the groomer's business_phone when a new booking
 * is submitted from their booking page.
 *
 * POST body:
 *   { groomerId, petName, clientName, date, time, requiresApproval }
 *
 * No auth required — this is called from the public booking page.
 * Rate-limiting is handled by Telnyx.
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

  let groomerId, petName, clientName, date, time, requiresApproval;
  try {
    ({ groomerId, petName, clientName, date, time, requiresApproval } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!groomerId) {
    return { statusCode: 400, body: "Missing groomerId" };
  }

  // Load groomer phone number
  const { data: groomer } = await supabase
    .from("groomers")
    .select("business_phone, sms_number, full_name")
    .eq("id", groomerId)
    .single();

  // Need a phone to text and a from number
  const toPhone = groomer?.business_phone;
  const fromNumber = groomer?.sms_number || process.env.TELNYX_PHONE_NUMBER;

  if (!toPhone || !fromNumber) {
    // No phone on file — silently succeed, email already sent
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
    body: JSON.stringify({
      from: fromNumber,
      to: toPhone,
      text: message,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("SMS notify failed:", err);
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "Telnyx error" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ sent: true }) };
};