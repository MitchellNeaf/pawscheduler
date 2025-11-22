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
      event.body,        // raw body
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

  // Handle successful checkout
  if (payload.type === "checkout.session.completed") {
    const session = payload.data.object;
    const userId = session.metadata.userId;

    console.log("➡ Activating subscription for:", userId);

    const { error } = await supabase
      .from("groomers")
      .update({ subscription_status: "active" })
      .eq("id", userId);

    if (error) {
      console.error("❌ Failed to update subscription:", error);
      return { statusCode: 500, body: "Supabase error" };
    }

    console.log("🎉 Subscription activated for:", userId);
  }

  return { statusCode: 200, body: "OK" };
};
