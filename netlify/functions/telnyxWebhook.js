// netlify/functions/telnyxWebhook.js

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function verifyTelnyxSignature(payload, signature, timestamp, publicKey) {
  try {
    if (!signature || !timestamp || !publicKey) return false;
    const message = `${timestamp}|${payload}`;
    const sigBuffer = Buffer.from(signature, "base64");
    const keyBuffer = Buffer.from(publicKey, "base64");

    const key = crypto.createPublicKey({
      key: keyBuffer,
      format: "der",
      type: "spki",
    });

    return crypto.verify(null, Buffer.from(message), key, sigBuffer);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const telnyxPublicKey = process.env.TELNYX_PUBLIC_KEY;

  if (telnyxPublicKey) {
    const signature = event.headers["telnyx-signature-ed25519"];
    const timestamp = event.headers["telnyx-timestamp"];

    if (!verifyTelnyxSignature(event.body, signature, timestamp, telnyxPublicKey)) {
      console.error("Invalid Telnyx signature — rejecting webhook");
      return { statusCode: 403, body: "Invalid signature" };
    }
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

  if (eventType === "message.received") {
    const msg = payload.data.payload;
    const fromPhone = msg?.from?.phone_number;
    const toPhone = msg?.to?.[0]?.phone_number;
    const body = msg?.text || "";
    const telnyxMsgId = payload.data.id;

    if (!fromPhone || !toPhone) {
      return { statusCode: 200, body: "Missing phone numbers" };
    }

    const normalized = body.trim().toUpperCase();

    if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalized)) {
      await supabase
        .from("clients")
        .update({ sms_opt_in: false })
        .eq("phone", fromPhone);

      console.log(`STOP received from ${fromPhone} — opted out`);
      return { statusCode: 200, body: "Opt-out processed" };
    }

    let groomerId = null;

    const { data: groomerByDedicatedNum } = await supabase
      .from("groomers")
      .select("id")
      .eq("sms_number", toPhone)
      .single();

    if (groomerByDedicatedNum) {
      groomerId = groomerByDedicatedNum.id;
    } else {
      const { data: clientMatch } = await supabase
        .from("clients")
        .select("groomer_id")
        .eq("phone", fromPhone)
        .single();

      if (clientMatch) groomerId = clientMatch.groomer_id;
    }

    if (!groomerId) {
      console.log(`Could not find groomer for inbound message from ${fromPhone} to ${toPhone}`);
      return { statusCode: 200, body: "No groomer found" };
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("phone", fromPhone)
      .eq("groomer_id", groomerId)
      .single();

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

    const { error: insertError } = await supabase
      .from("sms_messages")
      .insert({
        groomer_id: groomerId,
        client_phone: fromPhone,
        client_id: client?.id || null,
        direction: "inbound",
        body,
        telnyx_msg_id: telnyxMsgId || null,
        media_url: msg?.media?.[0]?.url || null,
      });

    if (insertError) {
      console.error("Failed to store inbound SMS:", insertError);
      return { statusCode: 500, body: "Failed to store message" };
    }

    console.log(`Stored inbound SMS from ${fromPhone} to groomer ${groomerId}`);

    const pushMessage = body.length > 80 ? body.slice(0, 80) + "…" : body;
    const apiKey = (process.env.ONESIGNAL_API_KEY || "").trim();

    try {
      console.log("Using OneSignal App ID:", "8c3bc536-e526-40ac-9ecd-19701c76b735");
      console.log("Push key prefix:", apiKey.slice(0, 10));
      console.log("Push key last 4:", apiKey.slice(-4));
      console.log("Push key length:", apiKey.length);
      console.log(
        "Push key hash:",
        crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 12)
      );

      const pushRes = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: "8c3bc536-e526-40ac-9ecd-19701c76b735",
          include_aliases: {
            external_id: [groomerId],
          },
          target_channel: "push",
          headings: { en: "New Message" },
          contents: { en: pushMessage },
          url: "https://app.pawscheduler.app/inbox",
        }),
      });

      const pushText = await pushRes.text();

      console.log("Push status:", pushRes.status);
      console.log("Push response:", pushText);
    } catch (e) {
      console.error("Push failed:", e.message);
    }

    return { statusCode: 200, body: "Message stored" };
  }

  if (eventType === "message.finalized") {
    const status = payload.data.payload?.to?.[0]?.status;
    const msgId = payload.data.id;
    console.log(`Message ${msgId} finalized with status: ${status}`);
    return { statusCode: 200, body: "Receipt acknowledged" };
  }

  return { statusCode: 200, body: "Event acknowledged" };
};