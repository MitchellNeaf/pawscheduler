/**
 * sendManualSmsReminder.js
 *
 * Netlify function — sends a one-off SMS reminder for a single appointment.
 * Called from the Schedule page "Send Reminder" button.
 *
 * POST body:
 *   { appointmentId: string }
 *
 * Flow:
 *   1. Verify the groomer is authenticated (reads Authorization header)
 *   2. Load appointment + pet + client + groomer from Supabase
 *   3. Check client has a phone and sms_opt_in = true
 *   4. Send SMS via Telnyx
 *   5. Update sms_reminder_sent_at on the appointment
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Format HH:MM → 12-hour time
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Format YYYY-MM-DD → "Mon, Apr 18"
function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ── Auth: extract groomer from JWT ──────────────────────────────
  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  // ── Parse body ──────────────────────────────────────────────────
  let appointmentId;
  try {
    ({ appointmentId } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!appointmentId) {
    return { statusCode: 400, body: JSON.stringify({ error: "appointmentId required" }) };
  }

  // ── Load appointment ────────────────────────────────────────────
  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select(`
      id, date, time, duration_min, services, amount,
      pets (
        id, name,
        clients ( id, full_name, phone, sms_opt_in )
      )
    `)
    .eq("id", appointmentId)
    .eq("groomer_id", user.id)  // security: groomer can only remind their own appts
    .single();

  if (apptErr || !appt) {
    return { statusCode: 404, body: JSON.stringify({ error: "Appointment not found" }) };
  }

  const client = appt.pets?.clients;
  const pet    = appt.pets;

  // ── Check SMS eligibility ───────────────────────────────────────
  if (!client?.phone) {
    return { statusCode: 422, body: JSON.stringify({ error: "No phone number on file for this client." }) };
  }

  if (!client?.sms_opt_in) {
    return { statusCode: 422, body: JSON.stringify({ error: "Client has not opted in to SMS reminders." }) };
  }

  // ── Load groomer for business name + from number ────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("full_name, business_name, business_phone")
    .eq("id", user.id)
    .single();

  const groomerName = groomer?.business_name || groomer?.full_name || "Your groomer";

  // ── Build message ───────────────────────────────────────────────
  const services = Array.isArray(appt.services) ? appt.services.join(", ") : appt.services || "";
  const message = [
    `Hi ${client.full_name.split(" ")[0]}! This is a reminder from ${groomerName}.`,
    `${pet.name}'s grooming appointment is on ${fmtDate(appt.date)} at ${fmtTime(appt.time)}.`,
    services ? `Services: ${services}.` : null,
    `Reply STOP to opt out.`,
  ]
    .filter(Boolean)
    .join(" ");

  // ── Send via Telnyx ─────────────────────────────────────────────
  const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.TELNYX_PHONE_NUMBER,
      to: client.phone,
      text: message,
    }),
  });

  if (!telnyxRes.ok) {
    const err = await telnyxRes.text();
    console.error("Telnyx error:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to send SMS. Please try again." }) };
  }

  // ── Update appointment: stamp sent time ─────────────────────────
  await supabase
    .from("appointments")
    .update({ sms_reminder_sent_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .eq("groomer_id", user.id);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: `Reminder sent to ${client.full_name}.` }),
  };
};