// netlify/functions/reactivateSubscription.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    const { userId } = JSON.parse(event.body);

    if (!userId) {
      return { statusCode: 400, body: "Missing userId" };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Load groomer stripe info
    const { data: groomer } = await supabase
      .from("groomers")
      .select("stripe_subscription_id")
      .eq("id", userId)
      .single();

    if (!groomer?.stripe_subscription_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No subscription on file" })
      };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Reactivate the subscription
    await stripe.subscriptions.update(groomer.stripe_subscription_id, {
      cancel_at_period_end: false
    });

    // Update DB
    await supabase
      .from("groomers")
      .update({ cancel_at_period_end: false })
      .eq("id", userId);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error("Reactivate error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
