/**
 * sendReportCard.js — Netlify function
 *
 * Saves a report card (before/after photos, mood tags, notes) for an
 * appointment and sends the client a link to view it, via SMS + email.
 *
 * POST body:
 *   {
 *     appointmentId: string,
 *     beforePhotoUrl?: string,
 *     afterPhotoUrl?: string,
 *     moodTags?: string[],
 *     notes?: string
 *   }
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
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { appointmentId, beforePhotoUrl, afterPhotoUrl, moodTags, notes } = body;

  if (!appointmentId) {
    return { statusCode: 400, body: JSON.stringify({ error: "appointmentId required" }) };
  }

  try {
    // ── Load appointment + pet + client ─────────────────────
    const { data: appt } = await supabase
      .from("appointments")
      .select(`
        id, date, groomer_id, pet_id,
        pets ( id, name, clients ( id, full_name, email, phone, sms_opt_in ) )
      `)
      .eq("id", appointmentId)
      .eq("groomer_id", user.id)
      .single();

    if (!appt) {
      return { statusCode: 404, body: JSON.stringify({ error: "Appointment not found" }) };
    }

    const client = appt.pets?.clients;
    if (!client) {
      return { statusCode: 422, body: JSON.stringify({ error: "This appointment has no client on file." }) };
    }

    // ── Load groomer ────────────────────────────────────────
    const { data: groomer } = await supabase
      .from("groomers")
      .select("full_name, business_name, logo_url, sms_number, plan_tier")
      .eq("id", user.id)
      .single();

    if (groomer?.plan_tier !== "growth" && groomer?.plan_tier !== "pro") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Report cards are a Growth and Pro feature. Upgrade your plan to use this." }),
      };
    }

    const groomerName = groomer?.business_name || groomer?.full_name || "Your groomer";
    const petName     = appt.pets?.name || "Your pet";
    const clientFirst = client.full_name?.split(" ")[0] || "there";
    const siteUrl     = process.env.URL || "https://app.pawscheduler.app";

    // ── Upsert the report card (one per appointment) ────────
    const { data: existing, error: existingErr } = await supabase
      .from("report_cards")
      .select("id, view_token")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (existingErr) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Could not read report_cards table: ${existingErr.message}. Have you run report_cards_schema.sql in Supabase yet?`,
        }),
      };
    }

    let viewToken = existing?.view_token;

    const row = {
      appointment_id: appointmentId,
      groomer_id: user.id,
      pet_id: appt.pet_id,
      before_photo_url: beforePhotoUrl || null,
      after_photo_url: afterPhotoUrl || null,
      mood_tags: Array.isArray(moodTags) ? moodTags : [],
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updateErr } = await supabase.from("report_cards").update(row).eq("id", existing.id);
      if (updateErr) {
        return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("report_cards")
        .insert(row)
        .select("view_token")
        .single();
      if (insertErr) {
        return { statusCode: 500, body: JSON.stringify({ error: insertErr.message }) };
      }
      viewToken = inserted.view_token;
    }

    const viewUrl = `${siteUrl}/report/${viewToken}`;

    // ── Mark sent_at ─────────────────────────────────────────
    await supabase
      .from("report_cards")
      .update({ sent_at: new Date().toISOString() })
      .eq("appointment_id", appointmentId);

    const results = { smsSent: false, emailSent: false };

    // ── Send SMS ────────────────────────────────────────────
    if (client.phone && client.sms_opt_in) {
      const smsText = `Hi ${clientFirst}! 🐾 ${petName}'s report card from ${groomerName} is ready: ${viewUrl}`;

      const smsRes = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        },
        body: JSON.stringify({
          from: groomer?.sms_number || process.env.TELNYX_PHONE_NUMBER,
          to: client.phone,
          text: smsText,
        }),
      });

      results.smsSent = smsRes.ok;
      if (!smsRes.ok) console.error("SMS send failed:", await smsRes.text());
    }

    // ── Send Email ──────────────────────────────────────────
    if (client.email) {
      const emailRes = await fetch(`${siteUrl}/.netlify/functions/sendEmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: client.email,
          subject: `${petName}'s report card from ${groomerName} 🐾`,
          template: "report_card",
          data: {
            groomer_id: user.id,
            groomer_name: groomerName,
            client_first_name: clientFirst,
            pet_name: petName,
            view_url: viewUrl,
            logo_url: groomer?.logo_url || "",
            logo_url_img: groomer?.logo_url
              ? `<img src="${groomer.logo_url}" alt="${groomerName}" width="64" height="64" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:3px solid rgba(255,255,255,0.4);display:block;margin-left:auto;margin-right:auto;" />`
              : "",
          },
        }),
      });

      results.emailSent = emailRes.ok;
      if (!emailRes.ok) console.error("Email send failed:", await emailRes.text());
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...results, viewUrl }),
    };
  } catch (err) {
    console.error("sendReportCard error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Something went wrong." }),
    };
  }
};