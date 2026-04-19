/**
 * sendWaiverEmail.js — Netlify function
 *
 * Sends a waiver signing link to a client via email.
 * Delegates to sendEmail.js for template rendering + MailerSend delivery.
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
    .select("id, full_name, email")
    .eq("id", clientId)
    .eq("groomer_id", user.id)
    .single();

  if (clientErr || !client) {
    return { statusCode: 404, body: JSON.stringify({ error: "Client not found" }) };
  }

  if (!client.email) {
    return { statusCode: 422, body: JSON.stringify({ error: "No email address on file for this client." }) };
  }

  const { data: groomer } = await supabase
    .from("groomers")
    .select("id, slug, full_name, business_name, logo_url")
    .eq("id", user.id)
    .single();

  if (!groomer?.slug) {
    return { statusCode: 500, body: JSON.stringify({ error: "Groomer slug not configured." }) };
  }

  const groomerName = groomer.business_name || groomer.full_name || "Your groomer";
  const firstName = client.full_name.split(" ")[0];
  const siteUrl = process.env.URL || "https://app.pawscheduler.app";
  const waiverUrl = `${siteUrl}/waiver/${groomer.slug}?cid=${client.id}`;

  const res = await fetch(
    `${siteUrl}/.netlify/functions/sendEmail`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: client.email,
        subject: `Please sign your grooming waiver — ${groomerName}`,
        template: "waiver_request",
        data: {
          groomer_id:        groomer.id,
          groomer_name:      groomerName,
          client_first_name: firstName,
          waiver_url:        waiverUrl,
          logo_url:          groomer.logo_url || "",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("sendEmail error:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to send email. Please try again." }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};