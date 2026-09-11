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
        clients ( id, full_name, phone, email, sms_opt_in )
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

  // ── Load groomer for business name, tier, and from number ───────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("full_name, business_name, sms_number, plan_tier")
    .eq("id", user.id)
    .single();

  const groomerName = groomer?.business_name || groomer?.full_name || "Your groomer";
  const isBasic = groomer?.plan_tier === "basic";

  if (isBasic) {
    // ── Basic: email instead of SMS, no shared-number dependency ──
    if (!client?.email) {
      return { statusCode: 422, body: JSON.stringify({ error: "No email on file for this client." }) };
    }

    const services = Array.isArray(appt.services) ? appt.services.join(", ") : appt.services || "";
    const dateStr = fmtDate(appt.date);
    const timeStr = fmtTime(appt.time);

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px">
        <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
          <div style="text-align:center;font-size:48px;margin-bottom:16px">🐾</div>
          <h2 style="text-align:center;color:#111827;margin-bottom:8px">Appointment Reminder</h2>
          <p style="color:#374151;margin-bottom:20px">
            Hi <strong>${client.full_name?.split(" ")[0] || "there"}</strong>,<br/>
            This is a reminder that <strong>${pet.name}</strong>'s grooming appointment with ${groomerName} is coming up!
          </p>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px;margin-bottom:20px">
            <div style="font-size:14px;color:#166534;margin-bottom:6px"><strong>📅 Date:</strong> ${dateStr}</div>
            <div style="font-size:14px;color:#166534;margin-bottom:6px"><strong>⏰ Time:</strong> ${timeStr}</div>
            ${services ? `<div style="font-size:14px;color:#166534"><strong>✂️ Services:</strong> ${services}</div>` : ""}
          </div>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Powered by PawScheduler</p>
      </div>`;

    const mailRes = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "noreply@pawscheduler.app", name: groomerName },
        to: [{ email: client.email, name: client.full_name || "" }],
        subject: `Reminder: ${pet.name}'s grooming appointment on ${dateStr}`,
        html,
      }),
    });

    if (!mailRes.ok) {
      const err = await mailRes.text();
      console.error("MailerSend error:", err);
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to send email. Please try again." }) };
    }

    await supabase
      .from("appointments")
      .update({ sms_reminder_sent_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("groomer_id", user.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: `Reminder emailed to ${client.full_name}.` }),
    };
  }

  // ── Check SMS eligibility ───────────────────────────────────────
  if (!client?.phone) {
    return { statusCode: 422, body: JSON.stringify({ error: "No phone number on file for this client." }) };
  }

  if (!client?.sms_opt_in) {
    return { statusCode: 422, body: JSON.stringify({ error: "Client has not opted in to SMS reminders." }) };
  }

  const fromNumber = groomer?.sms_number || process.env.TELNYX_PHONE_NUMBER;

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
      from: fromNumber,
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

  // Track sent message for usage reporting
  let telnyxMsgId = null;
  try { telnyxMsgId = (await telnyxRes.json())?.data?.id || null; } catch {}
  await supabase.from("sms_messages").insert({
    groomer_id: user.id,
    client_phone: client.phone,
    client_id: client.id || null,
    direction: "outbound",
    body: message,
    telnyx_msg_id: telnyxMsgId,
    message_type: "manual",
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: `Reminder sent to ${client.full_name}.` }),
  };
};