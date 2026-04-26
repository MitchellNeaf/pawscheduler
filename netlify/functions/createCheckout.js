/**
 * createCheckout.js — Netlify function
 *
 * Creates a Stripe Checkout session for PawScheduler subscriptions.
 *
 * Price IDs:
 *   Starter Monthly: price_1TPYnd1RxmPJHwWbqJYQub43  ($49.99/mo)
 *   Starter Yearly:  price_1TPYo91RxmPJHwWb5qSpBQcV  ($499.99/yr)
 *   Pro Monthly:     price_1TPYoh1RxmPJHwWbPV02049p  ($79.99/mo)
 *   Pro Yearly:      price_1TPYp11RxmPJHwWbHbkYTZwq  ($799.99/yr)
 */

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRICES = {
  basic_monthly:   "price_1TQX0t1RxmPJHwWbVt2rKvfr",
  starter_monthly: "price_1TPYnd1RxmPJHwWbqJYQub43",
  starter_yearly:  "price_1TPYo91RxmPJHwWb5qSpBQcV",
  pro_monthly:     "price_1TPYoh1RxmPJHwWbPV02049p",
  pro_yearly:      "price_1TPYp11RxmPJHwWbHbkYTZwq",
};

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

  // ── Parse body ──────────────────────────────────────────
  let plan, billing;
  try {
    ({ plan, billing } = JSON.parse(event.body || "{}"));
    // plan: "starter" | "pro"
    // billing: "monthly" | "yearly"
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const priceKey = `${plan || "starter"}_${billing || "monthly"}`;
  const priceId = PRICES[priceKey];

  if (!priceId) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid plan/billing: ${priceKey}` }) };
  }

  // ── Load groomer ────────────────────────────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const siteUrl = process.env.URL || "https://app.pawscheduler.app";

  // ── Create Checkout session ─────────────────────────────
  const sessionParams = {
    mode:                "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/upgrade?success=true`,
    cancel_url:  `${siteUrl}/upgrade?cancelled=true`,
    metadata: {
      groomer_id: user.id,
      plan,
      billing,
    },
  };

  // Attach existing customer if we have one
  if (groomer?.stripe_customer_id) {
    sessionParams.customer = groomer.stripe_customer_id;
  } else if (groomer?.email) {
    sessionParams.customer_email = groomer.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url }),
  };
};