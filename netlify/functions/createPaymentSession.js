/**
 * createPaymentSession.js — Netlify function
 *
 * Creates a Stripe Checkout session for a specific appointment.
 * Payment goes directly to the groomer's connected Stripe account.
 *
 * POST body:
 *   { appointmentId: string }
 *
 * Returns:
 *   { url: string } — Stripe Checkout URL to send to client
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
  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select(`
      id, amount, services, date, paid,
      groomer_id,
      pets (
        id, name,
        clients ( id, full_name, email, phone )
      )
    `)
    .eq("id", appointmentId)
    .eq("groomer_id", user.id)
    .single();

  if (apptErr || !appt) {
    return { statusCode: 404, body: JSON.stringify({ error: "Appointment not found" }) };
  }

  if (appt.paid) {
    return { statusCode: 422, body: JSON.stringify({ error: "This appointment is already marked as paid." }) };
  }

  if (!appt.amount || appt.amount <= 0) {
    return { statusCode: 422, body: JSON.stringify({ error: "This appointment has no amount set. Please set an amount before requesting payment." }) };
  }

  // ── Load groomer Stripe account ─────────────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("stripe_account_id, stripe_onboarding_complete, full_name, business_name")
    .eq("id", user.id)
    .single();

  if (!groomer?.stripe_account_id || !groomer?.stripe_onboarding_complete) {
    return {
      statusCode: 422,
      body: JSON.stringify({ error: "Your Stripe account is not connected yet. Go to Profile → Payments to connect Stripe." }),
    };
  }

  const groomerName = groomer.business_name || groomer.full_name || "Your groomer";
  const petName     = appt.pets?.name || "your pet";
  const clientName  = appt.pets?.clients?.full_name || "Client";
  const clientEmail = appt.pets?.clients?.email || undefined;

  const services = Array.isArray(appt.services)
    ? appt.services.join(", ")
    : appt.services || "Grooming";

  const siteUrl = process.env.URL || "https://app.pawscheduler.app";

  // ── Create Stripe Checkout session ──────────────────────
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: clientEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(appt.amount * 100), // cents
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
        client_name:    clientName,
      },
      success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/payment-cancelled`,
    },
    {
      // Route payment to groomer's connected account
      stripeAccount: groomer.stripe_account_id,
    }
  );

  // ── Save payment session URL to appointment ─────────────
  await supabase
    .from("appointments")
    .update({ payment_url: session.url, payment_session_id: session.id })
    .eq("id", appt.id);

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url, sessionId: session.id }),
  };
};