const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    // -------------------------------------------------
    // 🔐 SECURITY — cron protection
    // -------------------------------------------------
    const secret =
      event.headers["x-cron-secret"] ||
      event.headers["X-Cron-Secret"];

    if (secret !== process.env.CRON_SECRET) {
      return {
        statusCode: 401,
        body: "Unauthorized"
      };
    }

    // -------------------------------------------------
    // Supabase (service role)
    // -------------------------------------------------
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // -------------------------------------------------
    // 📅 Calculate TOMORROW in America/New_York
    // -------------------------------------------------
    const now = new Date();
    const estNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    estNow.setDate(estNow.getDate() + 1);
    const tomorrow = estNow.toISOString().slice(0, 10);

    // -------------------------------------------------
    // 🔍 Fetch SMS candidates via RPC (FLAT DATA)
    // -------------------------------------------------
    const { data: appts, error } = await supabase.rpc(
      "sms_reminder_candidates",
      { target_date: tomorrow }
    );

    if (error) {
      console.error("RPC Error:", error);
      throw error;
    }

    if (!appts || appts.length === 0) {
      return {
        statusCode: 200,
        body: "No SMS reminders to send."
      };
    }

    // -------------------------------------------------
    // 📤 Send SMS reminders
    // -------------------------------------------------
    for (const a of appts) {
      const message = `Hi ${a.client_name}, reminder that ${
        a.pet_name
      } has a grooming appointment tomorrow at ${a.appt_time.slice(
        0,
        5
      )}. Reply STOP to opt out.`;

      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: process.env.TELNYX_PHONE_NUMBER,
          to: a.phone,
          text: message
        })
      });

      if (!res.ok) {
        console.error("Telnyx send failed:", await res.text());
        continue;
      }

      // -------------------------------------------------
      // Mark appointment as SMS sent (idempotent)
      // -------------------------------------------------
      await supabase
        .from("appointments")
        .update({
          sms_reminder_sent_at: new Date().toISOString()
        })
        .eq("id", a.appointment_id);
    }

    return {
      statusCode: 200,
      body: "SMS reminders sent successfully."
    };

  } catch (err) {
    console.error("SMS Reminder Fatal Error:", err);
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
