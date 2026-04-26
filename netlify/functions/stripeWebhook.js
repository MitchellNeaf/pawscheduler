/**
 * stripeWebhook.js — Netlify function
 *
 * Handles Stripe subscription webhook events.
 * Sets subscription_status and plan_tier on groomers table.
 *
 * Price IDs:
 *   Starter Monthly: price_1TPYnd1RxmPJHwWbqJYQub43
 *   Starter Yearly:  price_1TPYo91RxmPJHwWb5qSpBQcV
 *   Pro Monthly:     price_1TPYoh1RxmPJHwWbPV02049p
 *   Pro Yearly:      price_1TPYp11RxmPJHwWbHbkYTZwq
 */

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Price ID → plan tier mapping ────────────────────────────
const PRO_PRICE_IDS = new Set([
  "price_1TPYoh1RxmPJHwWbPV02049p", // Pro Monthly
  "price_1TPYp11RxmPJHwWbHbkYTZwq", // Pro Yearly
]);

const STARTER_PRICE_IDS = new Set([
  "price_1TPYnd1RxmPJHwWbqJYQub43", // Starter Monthly
  "price_1TPYo91RxmPJHwWb5qSpBQcV", // Starter Yearly
]);

const BASIC_PRICE_IDS = new Set([
  "price_1TQX0t1RxmPJHwWbVt2rKvfr", // Basic Monthly
]);

function getPlanTier(priceId) {
  if (PRO_PRICE_IDS.has(priceId)) return "pro";
  if (STARTER_PRICE_IDS.has(priceId)) return "starter";
  if (BASIC_PRICE_IDS.has(priceId)) return "basic";
  return "basic"; // safe default
}

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
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const { type, data } = stripeEvent;
  console.log("Stripe webhook event:", type);

  // ── checkout.session.completed ───────────────────────────
  if (type === "checkout.session.completed") {
    const session = data.object;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!customerId || !subscriptionId) {
      console.log("No customer or subscription in session — skipping");
      return { statusCode: 200, body: "ok" };
    }

    // Load subscription to get price ID
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price?.id;
    const planTier = getPlanTier(priceId);

    const { error } = await supabase
      .from("groomers")
      .update({
        subscription_status:     "active",
        stripe_customer_id:      customerId,
        stripe_subscription_id:  subscriptionId,
        plan_tier:               planTier,
        // Enable AI bot only for Pro
        sms_bot_enabled:         planTier === "pro",
      })
      .eq("stripe_customer_id", customerId);

    if (error) {
      // Try matching by email if customer_id not set yet
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.email) {
        await supabase
          .from("groomers")
          .update({
            subscription_status:    "active",
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
            plan_tier:              planTier,
            sms_bot_enabled:        planTier === "pro",
          })
          .eq("email", customer.email);
      }
    }

    console.log(`Subscription activated: ${planTier} plan for customer ${customerId}`);
  }

  // ── customer.subscription.updated ───────────────────────
  // Handles upgrades, downgrades, and renewals
  if (type === "customer.subscription.updated") {
    const subscription = data.object;
    const customerId = subscription.customer;
    const priceId = subscription.items.data[0]?.price?.id;
    const planTier = getPlanTier(priceId);

    const status = subscription.status === "active" ? "active" : "expired";

    await supabase
      .from("groomers")
      .update({
        subscription_status: status,
        plan_tier:           planTier,
        sms_bot_enabled:     planTier === "pro" && status === "active",
        cancel_at_period_end: subscription.cancel_at_period_end,
      })
      .eq("stripe_customer_id", customerId);

    console.log(`Subscription updated: ${planTier} / ${status} for customer ${customerId}`);
  }

  // ── customer.subscription.deleted ───────────────────────
  if (type === "customer.subscription.deleted") {
    const subscription = data.object;
    const customerId = subscription.customer;

    await supabase
      .from("groomers")
      .update({
        subscription_status: "free",
        plan_tier:           "free",
        sms_bot_enabled:     false,
      })
      .eq("stripe_customer_id", customerId);

    console.log(`Subscription cancelled — downgraded to free for customer ${customerId}`);
  }

  // ── invoice.payment_failed ───────────────────────────────
  // Fires when a renewal payment fails — lock the account
  if (type === "invoice.payment_failed") {
    const invoice = data.object;
    const customerId = invoice.customer;

    // Only lock if this is a subscription renewal (not first payment)
    if (invoice.billing_reason === "subscription_cycle") {
      await supabase
        .from("groomers")
        .update({
          subscription_status: "free",
          plan_tier:           "free",
          sms_bot_enabled:     false,
        })
        .eq("stripe_customer_id", customerId);

      console.log(`Payment failed — downgraded to free for customer ${customerId}`);
    }
  }

  // ── invoice.payment_action_required ─────────────────────
  // Fires when card needs 3D Secure authentication
  if (type === "invoice.payment_action_required") {
    const invoice = data.object;
    const customerId = invoice.customer;

    await supabase
      .from("groomers")
      .update({
        subscription_status: "free",
        plan_tier:           "free",
        sms_bot_enabled:     false,
      })
      .eq("stripe_customer_id", customerId);

    console.log(`Payment action required — downgraded to free for customer ${customerId}`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};