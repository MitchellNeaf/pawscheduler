// netlify/functions/confirmAppointmentSms.js
// Client clicks link in SMS → appointment marked confirmed
// URL: /api/confirmSms?token=<uuid>

const { createClient } = require("@supabase/supabase-js");

// Format a 24-hour "HH:MM" string as 12-hour with AM/PM
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;
  const id = event.queryStringParameters?.id;

  if (!token && !id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Invalid confirmation link.</h2>
        <p>This link is missing a token. Please contact your groomer.</p>
      </body></html>`,
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Find appointment by token OR by id
  let query = supabase
    .from("appointments")
    .select(`
      id, confirmed, date, time, groomer_id,
      pets ( name, clients ( full_name ) )
    `);

  if (token) {
    query = query.eq("confirm_token", token);
  } else {
    query = query.eq("id", id);
  }

  const { data: appt, error } = await query.maybeSingle();

  if (error || !appt) {
    console.error("Confirm lookup failed:", error, "id:", id, "token:", token);
    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Appointment not found</h2>
        <p>This confirmation link may have expired or already been used.</p>
      </body></html>`,
    };
  }

  // Load groomer name separately
  const { data: groomerData } = await supabase
    .from("groomers")
    .select("full_name")
    .eq("id", appt.groomer_id)
    .maybeSingle();
  const groomerName = groomerData?.full_name || "your groomer";

  // Already confirmed
  if (appt.confirmed) {
    const petName = appt.pets?.name || "your pet";
    const [y, m, d] = appt.date.split("-").map(Number);
    const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric"
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<html><body style="font-family:sans-serif;text-align:center;padding:40px;max-width:480px;margin:0 auto">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h2 style="color:#16a34a">Already confirmed!</h2>
        <p style="color:#374151">${petName}'s appointment on ${dateStr} at ${fmtTime(appt.time)} with ${groomerName} is confirmed.</p>
        <p style="color:#6b7280;font-size:14px;margin-top:24px">Powered by PawScheduler</p>
      </body></html>`,
    };
  }

  // Mark confirmed and invalidate token
  const { error: updateError } = await supabase
    .from("appointments")
    .update({ confirmed: true, confirm_token: null })
    .eq("id", appt.id);

  if (updateError) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Something went wrong</h2>
        <p>Please contact your groomer directly to confirm.</p>
      </body></html>`,
    };
  }

  const petName = appt.pets?.name || "your pet";
  const [y, m, d] = appt.date.split("-").map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric"
  });

  // Notify groomer — fire and forget
  if (appt.groomer_id) {
    const clientFirst = (appt.pets?.clients?.full_name || "").split(" ")[0];
    fetch(`${process.env.URL || "https://app.pawscheduler.app"}/.netlify/functions/sendPushNotification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groomerId: appt.groomer_id,
        title: "Appointment Confirmed ✅",
        message: `${clientFirst ? clientFirst + " confirmed " : ""}${petName}'s appointment on ${dateStr} at ${fmtTime(appt.time)}.`,
        url: "https://app.pawscheduler.app/schedule",
      }),
    }).catch(() => {});
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `<html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Appointment Confirmed</title>
    </head>
    <body style="font-family:-apple-system,sans-serif;text-align:center;padding:40px 20px;max-width:480px;margin:0 auto;background:#f9fafb">
      <div style="background:white;border-radius:20px;padding:40px 32px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <div style="font-size:56px;margin-bottom:16px">🐾</div>
        <h1 style="color:#16a34a;font-size:24px;margin-bottom:8px">You're confirmed!</h1>
        <p style="color:#374151;font-size:16px;margin-bottom:24px">
          ${petName}'s appointment is all set.
        </p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px;text-align:left;margin-bottom:24px">
          <div style="font-size:14px;color:#166534;margin-bottom:6px"><strong>📅 Date:</strong> ${dateStr}</div>
          <div style="font-size:14px;color:#166534;margin-bottom:6px"><strong>⏰ Time:</strong> ${fmtTime(appt.time)}</div>
          <div style="font-size:14px;color:#166534"><strong>✂️ With:</strong> ${groomerName}</div>
        </div>
        <p style="color:#6b7280;font-size:13px">See you then! Reply to your groomer's text if you need to make any changes.</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Powered by PawScheduler</p>
    </body>
    </html>`,
  };
};