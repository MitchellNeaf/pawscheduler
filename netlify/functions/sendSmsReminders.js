const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    // -------------------------------------------------
    // 🔐 SECURITY — cron protection
    // -------------------------------------------------
    const secret =
      event.headers["x-cron-secret"] || event.headers["X-Cron-Secret"];
    if (secret !== process.env.CRON_SECRET) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    // -------------------------------------------------
    // Supabase (service role)
    // -------------------------------------------------
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // -------------------------------------------------
    // ✅ Optional DRY RUN (prevents real SMS sends)
    // Set Netlify env var: DRY_RUN_SMS=true
    // -------------------------------------------------
    const DRY_RUN = process.env.DRY_RUN_SMS === "true";

    // -------------------------------------------------
    // ✅ Fetch SMS candidates via RPC
    // RPC computes "tomorrow" per groomer using groomers.time_zone
    // -------------------------------------------------
    const { data: appts, error } = await supabase.rpc("sms_reminder_candidates");

    if (error) {
      console.error("RPC Error:", error);
      throw error;
    }

    if (!appts || appts.length === 0) {
      return { statusCode: 200, body: "No SMS reminders to send." };
    }

    let sentCount = 0;
    let dryRunCount = 0;
    let failCount = 0;

    // -------------------------------------------------
    // 📤 Send SMS reminders
    // -------------------------------------------------
    for (const a of appts) {
      // Safety guard (RPC should already filter this, but keep it defensive)
      if (!a.phone) continue;

      const timeStr = (a.appt_time || "").slice(0, 5); // "HH:MM"
      const message = `Hi ${a.client_name}, reminder that ${a.pet_name} has a grooming appointment tomorrow at ${timeStr}. Reply STOP to opt out.`;

      if (DRY_RUN) {
        console.log("DRY RUN SMS:", {
          appointment_id: a.appointment_id,
          to: a.phone,
          message,
        });
        dryRunCount += 1;
        continue;
      }

      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.TELNYX_PHONE_NUMBER,
          to: a.phone,
          text: message,
        }),
      });

      if (!res.ok) {
        failCount += 1;
        console.error("Telnyx send failed:", {
          appointment_id: a.appointment_id,
          status: res.status,
          body: await res.text(),
        });
        continue;
      }

      // -------------------------------------------------
      // Mark appointment as SMS sent (idempotent-ish)
      // If this fails, you may resend next run — log loudly.
      // -------------------------------------------------
      const { error: markErr } = await supabase
        .from("appointments")
        .update({ sms_reminder_sent_at: new Date().toISOString() })
        .eq("id", a.appointment_id);

      if (markErr) {
        failCount += 1;
        console.error("Failed to mark sms_reminder_sent_at:", {
          appointment_id: a.appointment_id,
          error: markErr,
        });
        continue;
      }

      sentCount += 1;
    }

    const summary = DRY_RUN
      ? `DRY RUN complete. Would send ${dryRunCount} SMS.`
      : `SMS reminders complete. Sent ${sentCount}. Failed ${failCount}.`;

    return { statusCode: 200, body: summary };
  } catch (err) {
    console.error("SMS Reminder Fatal Error:", err);
    return { statusCode: 500, body: err.message };
  }
};
