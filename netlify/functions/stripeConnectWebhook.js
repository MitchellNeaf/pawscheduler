/**
 * stripeConnectWebhook.js — Netlify function
 *
 * Handles Stripe Connect webhook events:
 *   - account.updated → marks stripe_onboarding_complete when charges enabled
 *   - checkout.session.completed → marks appointment as paid
 *
 * Register this endpoint in your Stripe Dashboard →
 * Webhooks → Add endpoint:
 *   https://app.pawscheduler.app/.netlify/functions/stripeConnectWebhook
 *
 * Events to listen for:
 *   - account.updated
 *   - checkout.session.completed
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

  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // ── account.updated ─────────────────────────────────────
  // Fires when a connected account completes onboarding
  if (stripeEvent.type === "account.updated") {
    const account = stripeEvent.data.object;

    if (account.charges_enabled) {
      const { error } = await supabase
        .from("groomers")
        .update({ stripe_onboarding_complete: true })
        .eq("stripe_account_id", account.id);

      if (error) {
        console.error("Failed to mark onboarding complete:", error);
      } else {
        console.log("Stripe onboarding complete for account:", account.id);
      }
    }
  }

  // ── checkout.session.completed ───────────────────────────
  // Fires when a client successfully pays
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;

    // Session completed on a connected account — get appointment_id from metadata
    const appointmentId = session.metadata?.appointment_id;
    const groomerId     = session.metadata?.groomer_id;

    if (appointmentId && groomerId) {
      const { error } = await supabase
        .from("appointments")
        .update({
          paid:            true,
          payment_url:     null, // clear so link can't be reused
        })
        .eq("id", appointmentId)
        .eq("groomer_id", groomerId);

      if (error) {
        console.error("Failed to mark appointment paid:", error);
      } else {
        console.log("Appointment marked paid:", appointmentId);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};