// netlify/functions/telnyxWebhook.js
// Handles inbound SMS from Telnyx
// Stores messages in sms_messages table
// Handles STOP opt-outs

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const eventType = payload?.data?.event_type;

  // ── Handle inbound messages ──────────────────────────────
  if (eventType === "message.received") {
    const msg = payload.data.payload;
    const fromPhone = msg?.from?.phone_number;
    const toPhone   = msg?.to?.[0]?.phone_number;
    const body      = msg?.text || "";
    const telnyxMsgId = payload.data.id;

    if (!fromPhone || !toPhone) {
      return { statusCode: 200, body: "Missing phone numbers" };
    }

    // ── STOP opt-out handling ────────────────────────────────
    const normalized = body.trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalized)) {
      await supabase
        .from("clients")
        .update({ sms_opt_in: false })
        .eq("phone", fromPhone);

      console.log(`STOP received from ${fromPhone} — opted out`);
      return { statusCode: 200, body: "Opt-out processed" };
    }

    // ── Find which groomer owns this number ─────────────────
    // Check groomer's dedicated number first, fall back to shared number
    let groomerId = null;

    const { data: groomerByDedicatedNum } = await supabase
      .from("groomers")
      .select("id")
      .eq("sms_number", toPhone)
      .single();

    if (groomerByDedicatedNum) {
      groomerId = groomerByDedicatedNum.id;
    } else {
      // Shared number — try to find groomer by matching client phone
      const { data: clientMatch } = await supabase
        .from("clients")
        .select("groomer_id")
        .eq("phone", fromPhone)
        .single();

      if (clientMatch) {
        groomerId = clientMatch.groomer_id;
      }
    }

    if (!groomerId) {
      console.log(`Could not find groomer for inbound message from ${fromPhone} to ${toPhone}`);
      return { statusCode: 200, body: "No groomer found" };
    }

    // ── Find client record ───────────────────────────────────
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("phone", fromPhone)
      .eq("groomer_id", groomerId)
      .single();

    // ── Deduplicate ──────────────────────────────────────────
    if (telnyxMsgId) {
      const { data: existing } = await supabase
        .from("sms_messages")
        .select("id")
        .eq("telnyx_msg_id", telnyxMsgId)
        .single();

      if (existing) {
        return { statusCode: 200, body: "Duplicate — already stored" };
      }
    }

    // ── Store message ────────────────────────────────────────
    const { error: insertError } = await supabase
      .from("sms_messages")
      .insert({
        groomer_id:   groomerId,
        client_phone: fromPhone,
        client_id:    client?.id || null,
        direction:    "inbound",
        body:         body,
        telnyx_msg_id: telnyxMsgId || null,
        media_url:    msg?.media?.[0]?.url || null,
      });

    if (insertError) {
      console.error("Failed to store inbound SMS:", insertError);
      return { statusCode: 500, body: "Failed to store message" };
    }

    console.log(`Stored inbound SMS from ${fromPhone} to groomer ${groomerId}`);
    return { statusCode: 200, body: "Message stored" };
  }

  // ── Handle delivery receipts (just log) ──────────────────
  if (eventType === "message.finalized") {
    const status = payload.data.payload?.to?.[0]?.status;
    const msgId  = payload.data.id;
    console.log(`Message ${msgId} finalized with status: ${status}`);
    return { statusCode: 200, body: "Receipt acknowledged" };
  }

  // All other event types
  return { statusCode: 200, body: "Event acknowledged" };
};