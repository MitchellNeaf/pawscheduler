// netlify/functions/telnyxWebhook.js
const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 200, body: "Ignored" };
  }

  const text = body?.data?.payload?.text?.trim() || "";
  const from = body?.data?.payload?.from?.phone_number;
  const to   = body?.data?.payload?.to?.[0]?.phone_number;

  if (!from) {
    return { statusCode: 200, body: "Ignored" };
  }

  // ── STOP opt-out (always handle first) ──
  if (text.toUpperCase() === "STOP") {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from("clients")
      .update({ sms_opt_in: false })
      .eq("phone", from);

    return { statusCode: 200, body: "STOP processed" };
  }

  // ── Route to SMS bot if message came to the bot number ──
  const botNumber = process.env.TELNYX_BOT_PHONE_NUMBER;

  if (botNumber && to === botNumber) {
    // Forward to smsBot function
    // We call it internally by re-using the same event body
    try {
      const baseUrl = process.env.URL || "https://app.pawscheduler.app";
      const res = await fetch(`${baseUrl}/.netlify/functions/smsBot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: event.body, // pass through the original Telnyx payload
      });

      console.log("smsBot response status:", res.status);
    } catch (err) {
      console.error("Failed to forward to smsBot:", err);
    }

    return { statusCode: 200, body: "Routed to smsBot" };
  }

  // ── Default: not a bot message, ignore ──
  return { statusCode: 200, body: "OK" };
};