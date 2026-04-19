/**
 * signWaiver.js — Netlify function
 *
 * POST body:
 *   { slug: string, signerName: string, clientId?: string }
 *
 * Flow:
 *   1. Load groomer by slug
 *   2. Insert waiver signature
 *   3. Email groomer notification
 *   4. Return success
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

  let slug, signerName, clientId;
  try {
    ({ slug, signerName, clientId } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!slug || !signerName?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "slug and signerName are required" }) };
  }

  // ── Load groomer by slug ────────────────────────────────
  const { data: groomer, error: groomerErr } = await supabase
    .from("groomers")
    .select("id, full_name, email, slug")
    .eq("slug", slug)
    .single();

  if (groomerErr || !groomer) {
    return { statusCode: 404, body: JSON.stringify({ error: "Groomer not found" }) };
  }

  // ── Get IP address ──────────────────────────────────────
  const ip =
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    "unknown";

  // ── Insert signature ────────────────────────────────────
  const { error: insertErr } = await supabase
    .from("waiver_signatures")
    .insert({
      groomer_id:  groomer.id,
      client_id:   clientId || null,
      signer_name: signerName.trim(),
      ip_address:  ip,
      groomer_slug: slug,
    });

  if (insertErr) {
    console.error("Insert error:", insertErr);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not save signature" }) };
  }

  // ── Email groomer notification (fire-and-forget) ────────
  if (groomer.email) {
    fetch(`${process.env.URL}/.netlify/functions/sendEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: groomer.email,
        subject: `✍️ ${signerName.trim()} signed your grooming waiver`,
        template: "groomer_notification",
        data: {
          pet_name: "—",
          client_name: signerName.trim(),
          date: new Date().toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric", year: "numeric",
          }),
          time: new Date().toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit",
          }),
          duration_min: "—",
          services: "Waiver signed",
          amount: "—",
          notes: `IP: ${ip}`,
        },
      }),
    }).catch(() => {});
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};