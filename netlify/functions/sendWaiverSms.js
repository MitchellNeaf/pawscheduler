/**
 * sendWaiverSms.js — Netlify function
 *
 * Sends a waiver signing link to a client via Telnyx SMS.
 *
 * POST body:
 *   { clientId: string }
 *
 * Flow:
 *   1. Verify groomer is authenticated
 *   2. Load client — confirm they belong to this groomer and have sms_opt_in
 *   3. Load groomer slug
 *   4. Send SMS with waiver link via Telnyx
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

  // ── Auth ────────────────────────────────────────────────
  const token = (event.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  // ── Parse body ──────────────────────────────────────────
  let clientId;
  try {
    ({ clientId } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: "clientId required" }) };
  }

  // ── Load client ─────────────────────────────────────────
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, full_name, phone, sms_opt_in")
    .eq("id", clientId)
    .eq("groomer_id", user.id) // security: only own clients
    .single();

  if (clientErr || !client) {
    return { statusCode: 404, body: JSON.stringify({ error: "Client not found" }) };
  }

  if (!client.phone) {
    return { statusCode: 422, body: JSON.stringify({ error: "No phone number on file for this client." }) };
  }

  if (!client.sms_opt_in) {
    return { statusCode: 422, body: JSON.stringify({ error: "Client has not opted in to SMS." }) };
  }

  // ── Load groomer slug ───────────────────────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("slug, full_name, business_name")
    .eq("id", user.id)
    .single();

  if (!groomer?.slug) {
    return { statusCode: 500, body: JSON.stringify({ error: "Groomer slug not configured." }) };
  }

  const groomerName = groomer.business_name || groomer.full_name || "Your groomer";
  const firstName = client.full_name.split(" ")[0];

  // Include client_id so the waiver page can store it on sign
  const siteUrl = process.env.URL || "https://app.pawscheduler.app";
  const waiverUrl = `${siteUrl}/waiver/${groomer.slug}?cid=${client.id}`;

  const message = `Hi ${firstName}! ${groomerName} has sent you a grooming waiver to sign before your appointment. Please review and sign here: ${waiverUrl}`;

  // ── Send via Telnyx ─────────────────────────────────────
  const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.TELNYX_PHONE_NUMBER,
      to: client.phone,
      text: message,
    }),
  });

  if (!telnyxRes.ok) {
    const err = await telnyxRes.text();
    console.error("Telnyx error:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to send SMS. Please try again." }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};