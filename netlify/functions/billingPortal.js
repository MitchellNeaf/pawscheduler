// netlify/functions/billingPortal.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const body = JSON.parse(event.body || "{}");
    const { userId, returnUrl } = body;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userId" })
      };
    }

    // Load groomer row to get Stripe customer ID
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: groomer, error } = await supabase
      .from("groomers")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (error || !groomer) {
      console.error("Missing groomer:", error);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Groomer not found" })
      };
    }

    if (!groomer.stripe_customer_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No Stripe customer found — user has not subscribed yet."
        })
      };
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: groomer.stripe_customer_id,
      return_url: returnUrl || "https://app.pawscheduler.app/profile"
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
