// netlify/functions/telnyxWebhook.js
const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");

const STOP_KEYWORDS  = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "UNSTOP"]);

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

  const upper = text.toUpperCase();

  // ── STOP opt-out (handle all carrier-required keywords) ──
  if (STOP_KEYWORDS.has(upper)) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from("clients")
      .update({ sms_opt_in: false })
      .eq("phone", from);

    console.log(`STOP received from ${from} — opted out`);
    return { statusCode: 200, body: "STOP processed" };
  }

  // ── START opt-in ──
  if (START_KEYWORDS.has(upper)) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from("clients")
      .update({ sms_opt_in: true })
      .eq("phone", from);

    console.log(`START received from ${from} — opted back in`);
    // smsBot will send the re-opt-in confirmation reply when it processes this message
  }

  // ── Route to SMS bot if message came to the bot number ──
  const botNumber = process.env.TELNYX_BOT_PHONE_NUMBER;
  const baseUrl   = process.env.URL || "https://app.pawscheduler.app";

  if (botNumber && to === botNumber) {
    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/smsBot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: event.body,
      });
      console.log("smsBot response status:", res.status);
    } catch (err) {
      console.error("Failed to forward to smsBot:", err.message);
    }

    return { statusCode: 200, body: "Routed to smsBot" };
  }

  return { statusCode: 200, body: "OK" };
};