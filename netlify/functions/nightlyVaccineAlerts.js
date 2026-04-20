/**
 * nightlyVaccineAlerts.js — Netlify scheduled function
 *
 * Runs nightly. Finds pets with Rabies or Bordetella records
 * expiring in exactly 30 or 7 days and texts the client.
 *
 * Schedule: set in netlify.toml (e.g. "0 10 * * *" = 10am UTC daily)
 *
 * Alert windows:
 *   30 days out — first warning
 *    7 days out — final warning
 *
 * Deduplication: alert_30_sent_at / alert_7_sent_at columns on
 * pet_shot_records prevent repeat texts for the same record.
 *
 * Client eligibility:
 *   - Must have a phone number
 *   - Must have sms_opt_in = true
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vaccines that trigger alerts
const ALERT_SHOT_TYPES = ["Rabies", "Bordetella"];

// Format YYYY-MM-DD date string for display
function fmtDate(dateStr) {
  if (!dateStr) return "soon";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// Get YYYY-MM-DD for a date N days from now (UTC)
function dateInDays(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function sendAlert({ phone, petName, clientFirstName, shotType, expiresDate, groomerName, daysOut }) {
  const urgency = daysOut === 7 ? "⚠️ URGENT:" : "📋 Reminder:";
  const message = `${urgency} Hi ${clientFirstName}! ${petName}'s ${shotType} vaccination expires on ${fmtDate(expiresDate)} (in ${daysOut} days). Please update their records before their next grooming appointment with ${groomerName}. Questions? Reply to this message.`;

  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.TELNYX_PHONE_NUMBER,
      to: phone,
      text: message,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Telnyx error for ${phone}:`, err);
    return false;
  }

  return true;
}

exports.handler = async (event) => {
  // ── Security — matches sendSmsReminders pattern ─────────
  const secret =
    event.headers["x-cron-secret"] || event.headers["X-Cron-Secret"];
  if (secret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }
  console.log("nightlyVaccineAlerts: starting run at", new Date().toISOString());

  const target30 = dateInDays(30);
  const target7  = dateInDays(7);

  // ── Load all shot records expiring in 30 or 7 days ─────
  // for the alert shot types, with client phone + opt-in
  const { data: records, error } = await supabase
    .from("pet_shot_records")
    .select(`
      id,
      shot_type,
      date_expires,
      alert_30_sent_at,
      alert_7_sent_at,
      pets (
        id,
        name,
        groomer_id,
        clients (
          id,
          full_name,
          phone,
          sms_opt_in
        )
      )
    `)
    .in("shot_type", ALERT_SHOT_TYPES)
    .in("date_expires", [target30, target7])
    .not("date_expires", "is", null);

  if (error) {
    console.error("Query error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (!records?.length) {
    console.log("No expiring vaccines today.");
    return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
  }

  // ── Load groomer names for each unique groomer_id ───────
  const groomerIds = [...new Set(records.map(r => r.pets?.groomer_id).filter(Boolean))];
  const { data: groomers } = await supabase
    .from("groomers")
    .select("id, full_name, business_name")
    .in("id", groomerIds);

  const groomerMap = {};
  (groomers || []).forEach(g => {
    groomerMap[g.id] = g.business_name || g.full_name || "your groomer";
  });

  let sent = 0;
  let skipped = 0;

  for (const record of records) {
    const client = record.pets?.clients;
    const pet    = record.pets;

    // Skip if no eligible client
    if (!client?.phone || !client?.sms_opt_in) {
      skipped++;
      continue;
    }

    const daysOut     = record.date_expires === target7 ? 7 : 30;
    const alertField  = daysOut === 7 ? "alert_7_sent_at" : "alert_30_sent_at";
    const alreadySent = record[alertField];

    // Skip if already sent this alert for this record
    if (alreadySent) {
      skipped++;
      continue;
    }

    const groomerName   = groomerMap[pet.groomer_id] || "your groomer";
    const clientFirst   = client.full_name.split(" ")[0];

    const ok = await sendAlert({
      phone:          client.phone,
      petName:        pet.name,
      clientFirstName: clientFirst,
      shotType:       record.shot_type,
      expiresDate:    record.date_expires,
      groomerName,
      daysOut,
    });

    if (ok) {
      // Stamp the sent timestamp so we don't resend
      await supabase
        .from("pet_shot_records")
        .update({ [alertField]: new Date().toISOString() })
        .eq("id", record.id);

      sent++;
      console.log(`Sent ${daysOut}-day alert for ${pet.name} (${record.shot_type}) to ${client.phone}`);
    }
  }

  console.log(`nightlyVaccineAlerts: done. Sent: ${sent}, Skipped: ${skipped}`);
  return {
    statusCode: 200,
    body: JSON.stringify({ sent, skipped }),
  };
};