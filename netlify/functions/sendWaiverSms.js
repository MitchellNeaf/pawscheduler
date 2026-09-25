/**
 * sendWaiverSms.js — Netlify function
 *
 * Sends a waiver signing link to a client via text instead of email.
 * Requires a real dedicated sms_number — no shared-number fallback,
 * matching the same principle established elsewhere tonight. If the
 * groomer doesn't have one yet, falls back to email automatically
 * rather than failing outright.
 *
 * POST body:
 *   { clientId: string }
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = (event.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let clientId;
  try {
    ({ clientId } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: "clientId required" }) };
  }

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, full_name, email, phone, sms_opt_in")
    .eq("id", clientId)
    .eq("groomer_id", user.id)
    .single();

  if (clientErr || !client) {
    return { statusCode: 404, body: JSON.stringify({ error: "Client not found" }) };
  }

  const { data: groomer } = await supabase
    .from("groomers")
    .select("id, slug, full_name, business_name, sms_number")
    .eq("id", user.id)
    .single();

  if (!groomer?.slug) {
    return { statusCode: 500, body: JSON.stringify({ error: "Groomer slug not configured." }) };
  }

  const groomerName = groomer.business_name || groomer.full_name || "Your groomer";
  const siteUrl = process.env.URL || "https://app.pawscheduler.app";
  const waiverUrl = `${siteUrl}/waiver/${groomer.slug}?cid=${client.id}`;

  // No dedicated number, or client hasn't opted into texting — fall
  // back to email rather than fail outright.
  const canText = !!(groomer.sms_number && client.phone && client.sms_opt_in);

  if (!canText) {
    if (!client.email) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: "No dedicated texting number set up, and no email on file for this client either." }),
      };
    }

    const res = await fetch(`${siteUrl}/.netlify/functions/sendWaiverEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Fallback sendWaiverEmail error:", err);
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to send waiver. Please try again." }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        channel: "email",
        note: groomer.sms_number
          ? "This client hasn't opted in to texting, so this was sent by email instead."
          : "You don't have a dedicated texting number set up yet, so this was sent by email instead.",
      }),
    };
  }

  const message = `Hi ${(client.full_name || "").split(" ")[0] || "there"}, please sign your grooming waiver with ${groomerName} here: ${waiverUrl}`;

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
        text: message,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Telnyx send failed:", err);
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to send text. Please try again." }) };
    }

    let telnyxMsgId = null;
    try { telnyxMsgId = (await res.json())?.data?.id || null; } catch {}

    await supabase.from("sms_messages").insert({
      groomer_id: groomer.id,
      client_id: client.id,
      client_phone: client.phone,
      direction: "outbound",
      body: message,
      telnyx_msg_id: telnyxMsgId,
      message_type: "waiver_request",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, channel: "sms" }),
    };
  } catch (err) {
    console.error("sendWaiverSms error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Something went wrong." }) };
  }
};
