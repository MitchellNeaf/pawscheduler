// netlify/functions/billingPortal.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const body = JSON.parse(event.body || "{}");
    const { userId, returnUrl } = body;

    if (!userId) {
      return { statusCode: 400, body: "Missing userId" };
    }

    // Load groomer so we can fetch their stripe customer ID
    const { data: groomer } = await supabase
      .from("groomers")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (!groomer?.stripe_customer_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No Stripe customer found" })
      };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: groomer.stripe_customer_id,
      return_url: returnUrl
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    console.error("Billing portal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
