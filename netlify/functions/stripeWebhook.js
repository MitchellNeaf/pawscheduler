// netlify/functions/stripeWebhook.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = event.headers["stripe-signature"];

  let payload;
  try {
    payload = stripe.webhooks.constructEvent(
      event.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 400, body: "Invalid signature" };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (payload.type === "checkout.session.completed") {
    const session = payload.data.object;
    const userId = session.metadata.userId;

    await supabase
      .from("groomers")
      .update({ subscription_status: "active" })
      .eq("id", userId);
  }

  return { statusCode: 200, body: "OK" };
};
