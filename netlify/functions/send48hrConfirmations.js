// netlify/functions/send48hrConfirmations.js
// Fires ~48 hours before appointment to ask client to confirm
// - SMS if client has sms_opt_in AND groomer has sms_number
// - Email otherwise
// - If confirmed via link → confirmed = true, 24hr reminder skips them
//
// Setup: Add to cron-job.org, fire daily at 9 AM
// URL: https://app.pawscheduler.app/.netlify/functions/send48hrConfirmations
// Header: x-cron-secret: <your CRON_SECRET>

const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

async function alertAdmin(jobName, error) {
  try {
    await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
        to: [{ email: "pawscheduler@gmail.com" }],
        subject: `⚠️ PawScheduler: ${jobName} failed`,
        text: `The nightly job "${jobName}" failed at ${new Date().toISOString()}\n\nError: ${error?.message || String(error)}`,
      }),
    });
  } catch (e) {
    console.error("Failed to send admin alert:", e);
  }
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dateIn48Hours() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  try {
    // ── Security ──────────────────────────────────────────────
    const secret = event.headers["x-cron-secret"] || event.headers["X-Cron-Secret"];
    if (secret !== process.env.CRON_SECRET) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const targetDate = dateIn48Hours();
    console.log(`send48hrConfirmations: targeting date ${targetDate}`);

    // ── Fetch appointments 48hrs out that aren't confirmed yet ─
    const { data: appts, error: apptErr } = await supabase
      .from("appointments")
      .select(`
        id, date, time, duration_min, services, confirmed, confirm_token,
        reminder_enabled, sms_reminder_enabled, groomer_id,
        pets (
          id, name,
          clients ( id, full_name, email, phone, sms_opt_in )
        )
      `)
      .eq("date", targetDate)
      .eq("confirmed", false)
      .is("confirmation_sent_at", null)
      .or("no_show.is.null,no_show.eq.false");

    if (apptErr) {
      console.error("Query error:", apptErr);
      await alertAdmin("send48hrConfirmations", apptErr);
      return { statusCode: 500, body: apptErr.message };
    }

    if (!appts?.length) {
      console.log("No unconfirmed appointments 48hrs out.");
      return { statusCode: 200, body: JSON.stringify({ sent: 0, skipped: 0 }) };
    }

    // Load groomer data separately

    let sent = 0;
    let skipped = 0;

    for (const appt of appts) {
      const groomer = groomerMap[appt.groomer_id];
      const pet = appt.pets;
      const client = appt.pets?.clients;
      const petName = pet?.name || "your pet";

      // Skip if groomer is not on a paid plan
      const paid = ["basic", "growth", "pro"].includes(groomer?.plan_tier);
      if (!paid) { skipped++; continue; }

      // Skip if reminders disabled on appointment
      if (!appt.reminder_enabled) { skipped++; continue; }

      // Skip if no client contact info
      if (!client?.email && !client?.phone) { skipped++; continue; }

      const groomerName = groomer?.business_name || groomer?.full_name || "your groomer";

      // Format date nicely
      const [y, m, d] = appt.date.split("-").map(Number);
      const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric"
      });
      const timeStr = fmtTime(appt.time);

      // Build confirm link using existing confirm_token
      const confirmLink = appt.confirm_token
        ? `https://app.pawscheduler.app/.netlify/functions/confirmAppointmentSms?token=${appt.confirm_token}`
        : null;

      const useSms = client?.sms_opt_in && client?.phone && groomer?.sms_number;

      if (useSms) {
        // ── Send SMS ─────────────────────────────────────────
        const message = confirmLink
          ? `Hi ${client.full_name?.split(" ")[0] || "there"}! This is a reminder that ${petName} has a grooming appointment with ${groomerName} on ${dateStr} at ${timeStr}. Please confirm here: ${confirmLink}`
          : `Hi ${client.full_name?.split(" ")[0] || "there"}! This is a reminder that ${petName} has a grooming appointment with ${groomerName} on ${dateStr} at ${timeStr}. Reply CONFIRM to confirm.`;

        try {
          const res = await fetch("https://api.telnyx.com/v2/messages", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: groomer.sms_number,
              to: client.phone,
              text: message,
            }),
          });

          if (res.ok) {
            sent++;
            console.log(`48hr SMS sent to ${client.phone} for appt ${appt.id}`);
            await supabase.from("appointments")
              .update({ confirmation_sent_at: new Date().toISOString() })
              .eq("id", appt.id);
          } else {
            const body = await res.text();
            console.error(`Telnyx error for ${appt.id}:`, body);
            skipped++;
          }
        } catch (e) {
          console.error(`SMS send failed for ${appt.id}:`, e);
          skipped++;
        }

      } else if (client?.email) {
        // ── Send Email ───────────────────────────────────────
        const confirmHtml = confirmLink
          ? `<div style="text-align:center;margin:24px 0">
              <a href="${confirmLink}"
                style="display:inline-block;padding:14px 32px;background:#16a34a;color:white;
                  font-weight:700;font-size:16px;border-radius:12px;text-decoration:none">
                ✓ Confirm My Appointment
              </a>
             </div>`
          : "";

        const html = `
          <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px">
            <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
              <div style="text-align:center;font-size:48px;margin-bottom:16px">🐾</div>
              <h2 style="text-align:center;color:#111827;margin-bottom:8px">Appointment Reminder</h2>
              <p style="color:#374151;margin-bottom:20px">
                Hi <strong>${client.full_name?.split(" ")[0] || "there"}</strong>,<br/>
                Just a reminder that <strong>${petName}</strong> has a grooming appointment coming up!
              </p>
              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px;margin-bottom:20px">
                <div style="font-size:14px;color:#166534;margin-bottom:6px"><strong>📅 Date:</strong> ${dateStr}</div>
                <div style="font-size:14px;color:#166534;margin-bottom:6px"><strong>⏰ Time:</strong> ${timeStr}</div>
                <div style="font-size:14px;color:#166534"><strong>✂️ With:</strong> ${groomerName}</div>
              </div>
              ${confirmHtml}
              <p style="color:#6b7280;font-size:13px;text-align:center">
                Need to cancel? Please let us know at least 24 hours in advance.
              </p>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
              Powered by PawScheduler
            </p>
          </div>`;

        try {
          const res = await fetch("https://api.mailersend.com/v1/email", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: { email: "noreply@pawscheduler.app", name: groomerName },
              to: [{ email: client.email, name: client.full_name || "" }],
              subject: `Reminder: ${petName}'s grooming appointment on ${dateStr}`,
              html,
            }),
          });

          if (res.ok) {
            sent++;
            console.log(`48hr email sent to ${client.email} for appt ${appt.id}`);
            await supabase.from("appointments")
              .update({ confirmation_sent_at: new Date().toISOString() })
              .eq("id", appt.id);
          } else {
            const body = await res.text();
            console.error(`MailerSend error for ${appt.id}:`, body);
            skipped++;
          }
        } catch (e) {
          console.error(`Email send failed for ${appt.id}:`, e);
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    console.log(`send48hrConfirmations done. Sent: ${sent}, Skipped: ${skipped}`);
    return { statusCode: 200, body: JSON.stringify({ sent, skipped, targetDate }) };

  } catch (err) {
    console.error("send48hrConfirmations fatal error:", err);
    await alertAdmin("send48hrConfirmations", err);
    return { statusCode: 500, body: err.message };
  }
};