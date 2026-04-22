/**
 * createConnectAccount.js — Netlify function
 *
 * Creates a Stripe Connect Express account for the groomer
 * and returns an onboarding URL.
 *
 * If the groomer already has a stripe_account_id, returns a
 * fresh account link so they can complete onboarding or update info.
 *
 * POST — requires groomer auth token in Authorization header
 */

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

  // ── Load groomer ────────────────────────────────────────
  const { data: groomer } = await supabase
    .from("groomers")
    .select("id, email, full_name, stripe_account_id")
    .eq("id", user.id)
    .single();

  if (!groomer) {
    return { statusCode: 404, body: JSON.stringify({ error: "Groomer not found" }) };
  }

  const siteUrl = process.env.URL || "https://app.pawscheduler.app";

  let accountId = groomer.stripe_account_id;

  // ── Create account if needed ────────────────────────────
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: groomer.email,
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
      business_profile: {
        mcc:                 "7299", // Personal services
        product_description: "Pet grooming services",
      },
      metadata: {
        groomer_id:   groomer.id,
        groomer_name: groomer.full_name || "",
      },
    });

    accountId = account.id;

    // Save to DB
    await supabase
      .from("groomers")
      .update({ stripe_account_id: accountId })
      .eq("id", groomer.id);
  }

  // ── Generate onboarding link ────────────────────────────
  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${siteUrl}/profile?stripe=refresh`,
    return_url:  `${siteUrl}/profile?stripe=success`,
    type:        "account_onboarding",
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: accountLink.url }),
  };
};