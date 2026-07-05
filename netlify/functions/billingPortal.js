// netlify/functions/billingPortal.js
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

    const body = JSON.parse(event.body || "{}");
    const { returnUrl } = body;

    // Load groomer row — scoped to authenticated user only
    const { data: groomer, error } = await supabase
      .from("groomers")
      .select("stripe_customer_id, email, full_name")
      .eq("id", user.id)
      .single();

    if (error || !groomer) {
      return { statusCode: 400, body: JSON.stringify({ error: "Groomer not found" }) };
    }

    let customerId = groomer.stripe_customer_id;

    if (!customerId) {
      // Auto-create a Stripe customer so billing portal works
      const customer = await stripe.customers.create({
        email: groomer.email || undefined,
        name:  groomer.full_name || undefined,
        metadata: { groomer_id: user.id },
      });

      await supabase
        .from("groomers")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);

      customerId = customer.id;
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
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