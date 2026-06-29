// netlify/functions/sendSmsReminders.js
// Cron: runs every hour (e.g. cron-job.org hitting /.netlify/functions/sendSmsReminders)
// Reads each groomer's reminder_rules (array of hours, e.g. [48, 2]) and sends
// an SMS reminder for any appointment whose start time falls within a ±15min window
// of the scheduled reminder time.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ── Token interpolation ──────────────────────────────────── */
function interpolate(template, vars) {
  return template
    .replace(/%first_name%/g, vars.first_name || "")
    .replace(/%pet%/g, vars.pet || "")
    .replace(/%date%/g, vars.date || "")
    .replace(/%time%/g, vars.time || "")
    .replace(/%services%/g, vars.services || "")
    .replace(/%confirm_link%/g, vars.confirm_link || "")
    .replace(/%business_name%/g, vars.business_name || "")
    // Legacy placeholders
    .replace(/\{client\}/g, vars.first_name || "")
    .replace(/\{pet\}/g, vars.pet || "")
    .replace(/\{time\}/g, vars.time || "")
    .replace(/\{confirm_link\}/g, vars.confirm_link || "");
}

/* ── Format helpers ───────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* ── Default reminder message ─────────────────────────────── */
const DEFAULT_REMINDER = `Hi %first_name%, just a reminder that %pet% has a grooming appointment on %date% at %time%. Reply STOP to opt out.`;

/* ── Default confirmation message ────────────────────────── */
const DEFAULT_CONFIRMATION = `Hi %first_name%, please confirm %pet%'s appointment on %date% at %time%: %confirm_link%`;

/* ── Ensure confirm_token exists ─────────────────────────── */
async function ensureConfirmToken(appointmentId) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const { data } = await supabase
    .from("appointments")
    .update({ confirm_token: token })
    .eq("id", appointmentId)
    .is("confirm_token", null)
    .select("confirm_token")
    .single();

  if (data?.confirm_token) return data.confirm_token;

  // Token already existed — fetch it
  const { data: existing } = await supabase
    .from("appointments")
    .select("confirm_token")
    .eq("id", appointmentId)
    .single();

  return existing?.confirm_token || null;
}

/* ── Main handler ─────────────────────────────────────────── */
exports.handler = async (event) => {
  // Verify cron secret
  const secret = event.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const now = new Date();
  const WINDOW = 29; // ±29 minutes — pairs with 30-min cron to catch any appointment time

  try {
    // Load all active groomers with SMS numbers and reminder rules
    const { data: groomers, error: gErr } = await supabase
      .from("groomers")
      .select("id, full_name, sms_number, time_zone, reminder_message_template, sms_confirmation_template, reminder_rules, subscription_status, plan_tier")
      .not("sms_number", "is", null)
      .in("subscription_status", ["active", "trial"]);

    if (gErr) throw gErr;

    console.log(`sendSmsReminders: found ${(groomers || []).length} groomer(s) with SMS numbers`);

    let sent = 0;
    let skipped = 0;

    for (const groomer of (groomers || [])) {
      // Must be basic+ for reminders
      if (groomer.plan_tier === "free") {
        console.log(`Skipping groomer ${groomer.id} — free plan`);
        skipped++; continue;
      }

      const rules = Array.isArray(groomer.reminder_rules) && groomer.reminder_rules.length
        ? groomer.reminder_rules
        : [48];

      const tz = groomer.time_zone || "America/New_York";
      console.log(`Processing groomer ${groomer.id} (${groomer.full_name}) — rules: ${JSON.stringify(rules)}, tz: ${tz}`);

      for (const hoursAhead of rules) {
        const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
        const targetDateStr = targetTime.toLocaleDateString("en-CA", { timeZone: tz });
        const targetHour = targetTime.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
        const [th, tm] = targetHour.split(":").map(Number);
        const targetMinutesInDay = th * 60 + tm;

        console.log(`  Rule ${hoursAhead}hr: targeting ${targetDateStr} at ${targetHour} (${targetMinutesInDay} min)`);

        const { data: appts } = await supabase
          .from("appointments")
          .select(`
            id, date, time, duration_min, services, confirmed, confirm_token,
            sms_reminder_sent_at,
            pets ( name, clients ( full_name, phone, sms_opt_in ) )
          `)
          .eq("groomer_id", groomer.id)
          .eq("date", targetDateStr)
          .eq("reminder_enabled", true)
          .or("no_show.is.null,no_show.eq.false");

        console.log(`  Found ${(appts || []).length} appointment(s) on ${targetDateStr} with reminder_enabled`);

        for (const appt of (appts || [])) {
          const client = appt.pets?.clients;
          if (!client?.phone || !client?.sms_opt_in) {
            console.log(`  Skipping appt ${appt.id} — no phone or sms_opt_in false (phone: ${client?.phone}, opt_in: ${client?.sms_opt_in})`);
            skipped++; continue;
          }

          // Check time window match
          const [ah, am] = (appt.time || "00:00").slice(0, 5).split(":").map(Number);
          const apptMinutes = ah * 60 + am;
          const diff = Math.abs(apptMinutes - targetMinutesInDay);
          if (diff > WINDOW) {
            console.log(`  Skipping appt ${appt.id} at ${appt.time} — outside window (diff: ${diff} min, max: ${WINDOW})`);
            skipped++; continue;
          }

          // Check dedup
          if (appt.sms_reminder_sent_at) {
            const lastSent = new Date(appt.sms_reminder_sent_at);
            const hoursSinceLastSent = (now - lastSent) / 3600000;
            if (hoursSinceLastSent < hoursAhead - 1) {
              console.log(`  Skipping appt ${appt.id} — already sent ${hoursSinceLastSent.toFixed(1)}hr ago`);
              skipped++; continue;
            }
          }

          console.log(`  ✓ Sending reminder for appt ${appt.id} (${appt.pets?.name}, ${appt.date} ${appt.time}) to ${client.phone}`);

          // Build confirm link
          const token = await ensureConfirmToken(appt.id);
          const confirmLink = token
            ? `${process.env.URL || "https://app.pawscheduler.app"}/confirm/${token}`
            : "";

          // Build token vars
          const firstName = (client.full_name || "").split(" ")[0];
          const services = Array.isArray(appt.services) ? appt.services.join(", ") : appt.services || "";

          const vars = {
            first_name: firstName,
            pet: appt.pets?.name || "",
            date: fmtDate(appt.date),
            time: fmtTime(appt.time),
            services,
            confirm_link: confirmLink,
            business_name: groomer.full_name || "",
          };

          // Use custom template or default
          const template = groomer.reminder_message_template || DEFAULT_REMINDER;
          const body = interpolate(template, vars);

          // Send via Telnyx REST API
          try {
            const res = await fetch("https://api.telnyx.com/v2/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.TELNYX_API_KEY}`,
              },
              body: JSON.stringify({
                from: groomer.sms_number,
                to: client.phone,
                text: body,
              }),
            });

            if (!res.ok) {
              const err = await res.text();
              console.error(`SMS failed for appt ${appt.id}:`, err);
              skipped++;
              continue;
            }

            // Stamp sent time
            await supabase
              .from("appointments")
              .update({ sms_reminder_sent_at: now.toISOString() })
              .eq("id", appt.id);

            console.log(`  ✅ SMS sent successfully for appt ${appt.id}`);
            sent++;
          } catch (smsErr) {
            console.error(`SMS failed for appt ${appt.id}:`, smsErr.message);
            skipped++;
          }
        }
      }
    }

    console.log(`sendSmsReminders complete — sent: ${sent}, skipped: ${skipped}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ sent, skipped }),
    };
  } catch (err) {
    console.error("sendSmsReminders error:", err);
    return { statusCode: 500, body: err.message };
  }
};