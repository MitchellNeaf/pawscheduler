/**
 * sendPaymentRequest.js — Netlify function
 *
 * Creates a Stripe Checkout session for an appointment and
 * sends the payment link to the client via SMS + email.
 *
 * POST body:
 *   { appointmentId: string }
 */

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
  let appointmentId;
  try {
    ({ appointmentId } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!appointmentId) {
    return { statusCode: 400, body: JSON.stringify({ error: "appointmentId required" }) };
  }

  // ── Load appointment ────────────────────────────────────
  const { data: appt } = await supabase
    .from("appointments")
    .select(`
      id, amount, services, date, paid, payment_url, payment_session_id,
      groomer_id,
      pets (
        id, name,
        clients ( id, full_name, email, phone, sms_opt_in )
      )
    `)
    .eq("id", appointmentId)
    .eq("groomer_id", user.id)
    .single();

  if (!appt) {
    return { statusCode: 404, body: JSON.stringify({ error: "Appointment not found" }) };
  }

  if (appt.paid) {
    return { statusCode: 422, body: JSON.stringify({ error: "Already paid." }) };
  }

  if (!appt.amount || appt.amount <= 0) {
    return { statusCode: 422, body: JSON.stringify({ error: "No amount set on this appointment." }) };
  }

  // ── Load groomer ────────────────────────────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("stripe_account_id, stripe_onboarding_complete, full_name, business_name, email, logo_url")
    .eq("id", user.id)
    .single();

  if (!groomer?.stripe_account_id || !groomer?.stripe_onboarding_complete) {
    return {
      statusCode: 422,
      body: JSON.stringify({ error: "Stripe not connected. Go to Profile → Payments to connect." }),
    };
  }

  const groomerName  = groomer.business_name || groomer.full_name || "Your groomer";
  const petName      = appt.pets?.name || "your pet";
  const client       = appt.pets?.clients;
  const clientFirst  = client?.full_name?.split(" ")[0] || "there";
  const services     = Array.isArray(appt.services) ? appt.services.join(", ") : appt.services || "Grooming";
  const siteUrl      = process.env.URL || "https://app.pawscheduler.app";

  // ── Get or create payment session ──────────────────────
  let paymentUrl = appt.payment_url;

  // Reuse existing session if present and not expired
  if (!paymentUrl) {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: client?.email || undefined,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(appt.amount * 100),
              product_data: {
                name: `${services} — ${petName}`,
                description: `${groomerName} · ${appt.date}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          appointment_id: appt.id,
          groomer_id:     user.id,
          pet_name:       petName,
          client_name:    client?.full_name || "",
        },
        success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${siteUrl}/payment-cancelled`,
      },
      { stripeAccount: groomer.stripe_account_id }
    );

    paymentUrl = session.url;

    await supabase
      .from("appointments")
      .update({ payment_url: session.url, payment_session_id: session.id })
      .eq("id", appt.id);
  }

  const results = { smsSent: false, emailSent: false };

  // ── Send SMS ────────────────────────────────────────────
  if (client?.phone && client?.sms_opt_in) {
    const smsText = `Hi ${clientFirst}! Your grooming balance with ${groomerName} is $${appt.amount.toFixed(2)} for ${petName} on ${appt.date}. Pay securely here: ${paymentUrl}`;

    const smsRes = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.TELNYX_PHONE_NUMBER,
        to:   client.phone,
        text: smsText,
      }),
    });

    results.smsSent = smsRes.ok;
    if (!smsRes.ok) console.error("SMS send failed:", await smsRes.text());
  }

  // ── Send Email ──────────────────────────────────────────
  if (client?.email) {
    const emailRes = await fetch(`${siteUrl}/.netlify/functions/sendEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to:       client.email,
        subject:  `Payment request from ${groomerName} — $${appt.amount.toFixed(2)}`,
        template: "payment_request",
        data: {
          groomer_id:         user.id,
          groomer_name:       groomerName,
          client_first_name:  clientFirst,
          pet_name:           petName,
          services,
          appt_date:          appt.date,
          amount:             `$${appt.amount.toFixed(2)}`,
          payment_url:        paymentUrl,
          logo_url:           groomer.logo_url || "",
          logo_url_img:       groomer.logo_url
            ? `<img src="${groomer.logo_url}" alt="${groomerName}" width="64" height="64" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:3px solid rgba(255,255,255,0.4);display:block;margin-left:auto;margin-right:auto;" />`
            : "",
        },
      }),
    });

    results.emailSent = emailRes.ok;
    if (!emailRes.ok) console.error("Email send failed:", await emailRes.text());
  }

  if (!results.smsSent && !results.emailSent) {
    // Neither sent — return the URL so groomer can share it manually
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        smsSent: false,
        emailSent: false,
        paymentUrl,
        message: "No SMS or email sent — client has no contact info or SMS opt-in. Payment link copied.",
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, ...results, paymentUrl }),
  };
};