// netlify/functions/stripeExpressLogin.js
//
// Express connected accounts don't get normal Stripe login access —
// only the platform can generate a one-time login link into their
// simplified dashboard (balance, payouts, transaction history). This
// gives every Pro/Growth+ groomer using payments a way to check that
// themselves from inside PawScheduler, instead of needing to ask.

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
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Load groomer row — scoped to authenticated user only
    const { data: groomer, error } = await supabase
      .from("groomers")
      .select("stripe_account_id, stripe_onboarding_complete, plan_tier")
      .eq("id", user.id)
      .single();

    if (error || !groomer) {
      return { statusCode: 400, body: JSON.stringify({ error: "Groomer not found" }) };
    }

    if (groomer.plan_tier !== "pro") {
      return { statusCode: 403, body: JSON.stringify({ error: "Client Payments is a Pro-tier feature." }) };
    }

    if (!groomer.stripe_account_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "No Stripe account connected yet." }) };
    }

    if (!groomer.stripe_onboarding_complete) {
      return { statusCode: 400, body: JSON.stringify({ error: "Finish connecting your Stripe account first." }) };
    }

    const loginLink = await stripe.accounts.createLoginLink(groomer.stripe_account_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ url: loginLink.url }),
    };
  } catch (err) {
    console.error("stripeExpressLogin error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Something went wrong." }) };
  }
};
