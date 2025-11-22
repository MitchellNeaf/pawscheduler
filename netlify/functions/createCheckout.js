// netlify/functions/createCheckout.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { priceId, userId } = body;

    if (!priceId || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing priceId or userId" })
      };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: body.email,
      success_url: "https://app.pawscheduler.app/upgrade?success=1",
      cancel_url: "https://app.pawscheduler.app/upgrade?canceled=1",
      metadata: {
        userId
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error("Checkout error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
