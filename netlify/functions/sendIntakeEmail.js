/**
 * sendIntakeEmail.js — Netlify function
 *
 * Sends an intake form link to a client via email.
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

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, email")
    .eq("id", clientId)
    .eq("groomer_id", user.id)
    .single();

  if (!client?.email) {
    return { statusCode: 422, body: JSON.stringify({ error: "No email on file for this client." }) };
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
  const firstName   = client.full_name.split(" ")[0];
  const siteUrl     = process.env.URL || "https://app.pawscheduler.app";
  const intakeUrl   = `${siteUrl}/intake/${groomer.slug}`;

  const res = await fetch(`${siteUrl}/.netlify/functions/sendEmail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: client.email,
      subject: `Welcome! Please complete your new client intake — ${groomerName}`,
      template: "intake_email",
      data: {
        groomer_id:        groomer.id,
        groomer_name:      groomerName,
        client_first_name: firstName,
        intake_url:        intakeUrl,
        logo_url:          groomer.logo_url || "",
        logo_url_img:      groomer.logo_url
          ? `<img src="${groomer.logo_url}" alt="${groomerName}" width="64" height="64" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:3px solid rgba(255,255,255,0.4);display:block;margin-left:auto;margin-right:auto;" />`
          : "",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("sendEmail error:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to send email." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};