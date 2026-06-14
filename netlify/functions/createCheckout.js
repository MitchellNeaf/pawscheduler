/**
 * createCheckout.js — Netlify function
 *
 * Creates a Stripe Checkout session for PawScheduler subscriptions.
 *
 * Price IDs:
 *   Growth Monthly: price_1TPYnd1RxmPJHwWbqJYQub43  ($49.99/mo)
 *   Growth Yearly:  price_1TPYo91RxmPJHwWb5qSpBQcV  ($499.99/yr)
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
  growth_monthly: "price_1TPYnd1RxmPJHwWbqJYQub43",
  growth_yearly:  "price_1TPYo91RxmPJHwWb5qSpBQcV",
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
    // plan: "growth" | "pro"
    // billing: "monthly" | "yearly"
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const priceKey = `${plan || "growth"}_${billing || "monthly"}`;
  const priceId = PRICES[priceKey];

  if (!priceId) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid plan/billing: ${priceKey}` }) };
  }

  // ── Load groomer ────────────────────────────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("email, stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("id", user.id)
    .single();

  // ── Guard: already has active subscription → send to billing portal ──
  if (
    groomer?.stripe_customer_id &&
    groomer?.stripe_subscription_id &&
    groomer?.subscription_status === "active"
  ) {
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer:   groomer.stripe_customer_id,
        return_url: `${process.env.URL || "https://app.pawscheduler.app"}/profile`,
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ url: portalSession.url, alreadySubscribed: true }),
      };
    } catch (err) {
      console.error("Could not create billing portal session:", err.message);
      // Fall through to normal checkout if portal fails
    }
  }

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