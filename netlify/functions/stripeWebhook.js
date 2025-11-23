// netlify/functions/stripeWebhook.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// Tell Netlify NOT to parse the body
exports.config = {
  type: "raw",
};

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = event.headers["stripe-signature"];

  let payload;
  try {
    payload = stripe.webhooks.constructEvent(
      event.body,                    // raw body
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  console.log("✅ Stripe event received:", payload.type);

  // Setup Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ------------------------------------------------------
  // 1️⃣ HANDLE SUCCESSFUL CHECKOUT
  // ------------------------------------------------------
  if (payload.type === "checkout.session.completed") {
    const session = payload.data.object;
    const userId = session.metadata.userId;

    console.log("➡ Activating subscription for:", userId);
    console.log("➡ Saving stripe customer:", session.customer);

    const { error } = await supabase
      .from("groomers")
      .update({
        subscription_status: "active",
        stripe_customer_id: session.customer // ⭐ REQUIRED for Billing Portal
      })
      .eq("id", userId);

    if (error) {
      console.error("❌ Failed to update subscription:", error);
      return { statusCode: 500, body: "Supabase error" };
    }

    console.log("🎉 Subscription activated for:", userId);
  }

  // ------------------------------------------------------
  // 2️⃣ HANDLE SUBSCRIPTION CANCELLATION
  // ------------------------------------------------------
  if (
    payload.type === "customer.subscription.deleted" ||
    payload.type === "customer.subscription.updated"
  ) {
    const subscription = payload.data.object;

    if (subscription.cancel_at_period_end || subscription.status === "canceled") {
      const customerId = subscription.customer;

      console.log("⚠ Canceling subscription for Stripe customer:", customerId);

      // Lookup groomer by stripe_customer_id
      const { data: groomer } = await supabase
        .from("groomers")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (groomer) {
        await supabase
          .from("groomers")
          .update({ subscription_status: "expired" })
          .eq("id", groomer.id);

        console.log("🛑 Subscription expired for:", groomer.id);
      }
    }
  }

  return { statusCode: 200, body: "OK" };
};
