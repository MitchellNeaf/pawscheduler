// netlify/functions/reactivateSubscription.js
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

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

  try {
    // Load groomer stripe info — scoped to the authenticated user only
    const { data: groomer } = await supabase
      .from("groomers")
      .select("stripe_subscription_id")
      .eq("id", user.id)
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
      .eq("id", user.id);

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