const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRO_PRICE_IDS = new Set([
  "price_1TPYoh1RxmPJHwWbPV02049p",
  "price_1TPYp11RxmPJHwWbHbkYTZwq",
]);

const GROWTH_PRICE_IDS = new Set([
  "price_1TPYnd1RxmPJHwWbqJYQub43",
  "price_1TPYo91RxmPJHwWb5qSpBQcV",
]);

const BASIC_PRICE_IDS = new Set([
  "price_1TQX0t1RxmPJHwWbVt2rKvfr",
]);

function getPlanTier(priceId) {
  if (PRO_PRICE_IDS.has(priceId)) return "pro";
  if (GROWTH_PRICE_IDS.has(priceId)) return "growth";
  if (BASIC_PRICE_IDS.has(priceId)) return "basic";
  return "basic";
}

async function updateGroomerByBestMatch({ groomerId, customerId, email, updates }) {
  if (groomerId) {
    const { data, error } = await supabase
      .from("groomers")
      .update(updates)
      .eq("id", groomerId)
      .select("id, email, full_name, business_name, sms_number")
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (customerId) {
    const { data, error } = await supabase
      .from("groomers")
      .update(updates)
      .eq("stripe_customer_id", customerId)
      .select("id, email, full_name, business_name, sms_number")
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (email) {
    const { data, error } = await supabase
      .from("groomers")
      .update(updates)
      .ilike("email", email)
      .select("id, email, full_name, business_name, sms_number")
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  console.error("No groomer matched Stripe webhook", { groomerId, customerId, email });
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig = event.headers["stripe-signature"];

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    const { type, data } = stripeEvent;
    console.log("Stripe webhook event:", type);

    if (type === "checkout.session.completed") {
      const session = data.object;

      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const groomerId = session.metadata?.groomer_id || null;
      const email = session.customer_details?.email || session.customer_email || null;

      if (!customerId || !subscriptionId) {
        console.log("No customer or subscription in checkout session — skipping");
        return { statusCode: 200, body: "ok" };
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price?.id;
      const planTier = session.metadata?.plan || getPlanTier(priceId);

      const currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      const groomer = await updateGroomerByBestMatch({
        groomerId,
        customerId,
        email,
        updates: {
          subscription_status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan_tier: planTier,
          sms_bot_enabled: planTier === "pro",
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          current_period_end: currentPeriodEnd,
        },
      });

      console.log("Subscription activated", {
        groomer_id: groomer?.id,
        customerId,
        subscriptionId,
        planTier,
      });

      if ((planTier === "growth" || planTier === "pro") && groomer && !groomer.sms_number) {
        try {
          const groomerName = groomer.business_name || groomer.full_name || "Unknown";

          await fetch("https://api.mailersend.com/v1/email", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
              to: [{ email: "pawscheduler@gmail.com" }],
              subject: `Action needed: ${groomerName} upgraded to ${planTier} — needs Telnyx number`,
              html: `
                <p><strong>${groomerName}</strong> upgraded to <strong>${planTier}</strong>.</p>
                <p><strong>Email:</strong> ${groomer.email || "—"}</p>
                <p><strong>Stripe Customer:</strong> ${customerId}</p>
              `,
            }),
          });
        } catch (alertErr) {
          console.error("Failed to send Telnyx alert email:", alertErr);
        }
      }
    }

    if (type === "customer.subscription.updated") {
      const subscription = data.object;
      const customerId = subscription.customer;
      const priceId = subscription.items.data[0]?.price?.id;
      const planTier = getPlanTier(priceId);
      const status = subscription.status === "active" ? "active" : "expired";

      const currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from("groomers")
        .update({
          subscription_status: status,
          plan_tier: planTier,
          sms_bot_enabled: planTier === "pro" && status === "active",
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          current_period_end: currentPeriodEnd,
        })
        .eq("stripe_customer_id", customerId);

      if (error) throw error;

      console.log("Subscription updated", { customerId, planTier, status });
    }

    if (type === "customer.subscription.deleted") {
      const subscription = data.object;
      const customerId = subscription.customer;

      const { error } = await supabase
        .from("groomers")
        .update({
          subscription_status: "free",
          plan_tier: "free",
          sms_bot_enabled: false,
          cancel_at_period_end: false,
        })
        .eq("stripe_customer_id", customerId);

      if (error) throw error;

      console.log("Subscription cancelled", { customerId });
    }

    if (type === "invoice.payment_failed") {
      const invoice = data.object;
      const customerId = invoice.customer;

      if (invoice.billing_reason === "subscription_cycle") {
        const { error } = await supabase
          .from("groomers")
          .update({
            subscription_status: "free",
            plan_tier: "free",
            sms_bot_enabled: false,
          })
          .eq("stripe_customer_id", customerId);

        if (error) throw error;

        console.log("Payment failed — downgraded", { customerId });
      }
    }

    if (type === "invoice.payment_action_required") {
      const invoice = data.object;
      const customerId = invoice.customer;

      const { error } = await supabase
        .from("groomers")
        .update({
          subscription_status: "free",
          plan_tier: "free",
          sms_bot_enabled: false,
        })
        .eq("stripe_customer_id", customerId);

      if (error) throw error;

      console.log("Payment action required — downgraded", { customerId });
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    return { statusCode: 500, body: "Webhook processing failed" };
  }
};