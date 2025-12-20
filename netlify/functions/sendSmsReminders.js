const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    // -------------------------------------------------
    // 🔐 SECURITY: protect endpoint from random hits
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
    // Supabase service client (server-side only)
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
    // Fetch appointments needing SMS reminders
    // (EXPLICIT FK JOINS — this is the key fix)
    // -------------------------------------------------
    const { data: appts, error } = await supabase
      .from("appointments")
      .select(`
        id,
        date,
        time,
        sms_reminder_enabled,
        sms_reminder_sent_at,
        pets:appointments_pet_id_fkey!inner (
          name,
          clients:pets_client_id_fkey!inner (
            phone,
            sms_opt_in,
            full_name
          )
        )
      `)
      .eq("date", tomorrow)
      .eq("sms_reminder_enabled", true)
      .is("sms_reminder_sent_at", null);

    if (error) throw error;

    // TEMP DEBUG — remove later
    console.log("SMS QUERY RESULT:", JSON.stringify(appts, null, 2));

    if (!appts || appts.length === 0) {
      return {
        statusCode: 200,
        body: "No SMS reminders to send."
      };
    }

    // -------------------------------------------------
    // Send SMS reminders
    // -------------------------------------------------
    for (const a of appts) {
      const client = a.pets.clients;

      if (!client.phone) continue;
      if (!client.sms_opt_in) continue;

      const message = `Hi ${client.full_name || ""}, reminder that ${
        a.pets.name || "your pet"
      } has a grooming appointment tomorrow at ${a.time.slice(
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
          to: client.phone,
          text: message
        })
      });

      if (!res.ok) {
        console.error(
          "Telnyx error:",
          await res.text(),
          "Appointment:",
          a.id
        );
        continue;
      }

      // -------------------------------------------------
      // Mark reminder as sent (idempotency)
      // -------------------------------------------------
      await supabase
        .from("appointments")
        .update({
          sms_reminder_sent_at: new Date().toISOString()
        })
        .eq("id", a.id);
    }

    return {
      statusCode: 200,
      body: "SMS reminders sent successfully."
    };

  } catch (err) {
    console.error("SMS Reminder Error:", err);
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
