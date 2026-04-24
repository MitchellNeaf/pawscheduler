// src/pages/Upgrade.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";

const PLANS = [
  {
    key:         "starter",
    name:        "Starter",
    monthly:     49.99,
    yearly:      499.99,
    yearlyNote:  "Save $100 — 2 months free",
    description: "Everything you need to run your grooming business.",
    color:       "emerald",
    features: [
      "Unlimited appointments",
      "Smart schedule — grid & list views",
      "Multi-pet bookings",
      "Client & pet profiles with tags",
      "Digital intake forms",
      "Grooming waiver (digital signature)",
      "Vaccine tracking & expiration alerts",
      "SMS & email reminders",
      "Self-booking link for clients",
      "Auto-fill service pricing",
      "Revenue tracking & reporting",
      "Unpaid appointment tracking",
      "Client payments via Stripe",
      "Dark mode",
    ],
    excluded: [
      "AI SMS booking bot",
      "Dedicated scheduling phone number",
    ],
  },
  {
    key:         "pro",
    name:        "Pro",
    monthly:     79.99,
    yearly:      799.99,
    yearlyNote:  "Save $160 — 2 months free",
    description: "Everything in Starter, plus the AI bot that books while you groom.",
    color:       "violet",
    badge:       "Most Popular",
    features: [
      "Everything in Starter",
      "AI SMS booking bot",
      "Dedicated scheduling phone number",
      "Bot books, reschedules & cancels by text",
      "24-hour cancellation policy enforced automatically",
      "Client conversation history in app",
      "Priority support",
      "Early access to new features",
    ],
    excluded: [],
  },
];

export default function Upgrade() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [groomer, setGroomer] = useState(null);
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(null); // plan key | null

  const showSuccess   = searchParams.get("success") === "true";
  const showCancelled = searchParams.get("cancelled") === "true";

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { setLoading(false); return; }
      setUser(u);

      const { data: g } = await supabase
        .from("groomers")
        .select("subscription_status, plan_tier, trial_end_date, full_name")
        .eq("id", u.id)
        .single();

      setGroomer(g);
      setLoading(false);
    })();
  }, []);

  const handleCheckout = async (planKey) => {
    if (!user) return;
    setCheckingOut(planKey);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/createCheckout", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ plan: planKey, billing }),
      });

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setCheckingOut(null);
    }
  };

  const currentPlan  = groomer?.plan_tier || "starter";
  const currentStatus = groomer?.subscription_status;
  const isActive     = currentStatus === "active";
  const isTrial      = currentStatus === "trial";

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-3)]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* ── Success / Cancelled banners ── */}
        {showSuccess && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-6 py-4 text-center">
            <p className="text-emerald-800 font-bold text-lg">🎉 You're all set!</p>
            <p className="text-emerald-700 text-sm mt-1">Your subscription is active. Welcome to PawScheduler.</p>
          </div>
        )}
        {showCancelled && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-6 py-4 text-center">
            <p className="text-amber-800 font-semibold">Checkout cancelled — no charge was made.</p>
          </div>
        )}

        {/* ── Header ── */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-[var(--text-1)]">
            {isTrial ? "Choose your plan" : "Manage your plan"}
          </h1>

          {isTrial && (
            <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800 font-medium">
              ⏳ You're on a free trial — all Starter features are available.
              Pick a plan below to keep access after your trial ends.
            </div>
          )}

          {isTrial && (
            <p className="text-sm text-[var(--text-3)] max-w-lg mx-auto">
              The AI SMS bot requires the Pro plan and is not included in the trial.
              Everything else is fully available.
            </p>
          )}
        </div>

        {/* ── Billing toggle ── */}
        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm font-semibold ${billing === "monthly" ? "text-[var(--text-1)]" : "text-[var(--text-3)]"}`}>
            Monthly
          </span>
          <button
            onClick={() => setBilling((b) => b === "monthly" ? "yearly" : "monthly")}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              billing === "yearly" ? "bg-emerald-500" : "bg-gray-300"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              billing === "yearly" ? "translate-x-6" : ""
            }`} />
          </button>
          <span className={`text-sm font-semibold ${billing === "yearly" ? "text-[var(--text-1)]" : "text-[var(--text-3)]"}`}>
            Yearly
          </span>
          {billing === "yearly" && (
            <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
              2 months free
            </span>
          )}
        </div>

        {/* ── Plan cards ── */}
        <div className="grid md:grid-cols-2 gap-6">
          {PLANS.map((plan) => {
            const isCurrentPlan = isActive && currentPlan === plan.key;
            const perMonth = billing === "yearly"
              ? (plan.yearly / 12).toFixed(2)
              : plan.monthly.toFixed(2);

            return (
              <div key={plan.key}
                className={`rounded-2xl border-2 p-6 space-y-5 relative transition-all
                  ${plan.key === "pro"
                    ? "border-violet-400 shadow-lg shadow-violet-100"
                    : "border-[var(--border-med)]"
                  }
                  ${isCurrentPlan ? "ring-2 ring-emerald-400" : ""}
                `}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-3.5 right-4">
                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                      Current plan
                    </span>
                  </div>
                )}

                {/* Plan name + price */}
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-1)]">{plan.name}</h2>
                  <p className="text-sm text-[var(--text-3)] mt-0.5">{plan.description}</p>

                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-4xl font-black text-[var(--text-1)]">
                      ${billing === "yearly" ? plan.yearly.toFixed(0) : plan.monthly.toFixed(0)}
                    </span>
                    <span className="text-[var(--text-3)] text-sm mb-1.5">
                      /{billing === "yearly" ? "yr" : "mo"}
                    </span>
                  </div>

                  {billing === "yearly" && (
                    <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                      ${perMonth}/mo · {plan.yearlyNote}
                    </p>
                  )}
                </div>

                {/* CTA */}
                {isCurrentPlan ? (
                  <div className="w-full py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-sm font-semibold text-emerald-700">
                    ✓ Your current plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.key)}
                    disabled={!!checkingOut}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-50
                      ${plan.key === "pro"
                        ? "bg-violet-600 text-white hover:bg-violet-700"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                  >
                    {checkingOut === plan.key
                      ? "Loading…"
                      : isTrial
                      ? `Start ${plan.name} Plan`
                      : isActive
                      ? `Switch to ${plan.name}`
                      : `Get ${plan.name}`
                    }
                  </button>
                )}

                {/* Features */}
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                      <span className={`mt-0.5 font-bold flex-shrink-0 ${plan.key === "pro" ? "text-violet-500" : "text-emerald-500"}`}>✓</span>
                      {f}
                    </li>
                  ))}
                  {plan.excluded.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-3)] opacity-50">
                      <span className="mt-0.5 flex-shrink-0">✕</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ── Trial note ── */}
        {isTrial && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border-med)] p-5 text-sm text-[var(--text-2)] space-y-1">
            <p className="font-semibold text-[var(--text-1)]">About your free trial</p>
            <p>Your 30-day trial includes all Starter features at no cost — no credit card required. The AI SMS booking bot requires the Pro plan and is not available during the trial.</p>
            <p className="text-[var(--text-3)]">After your trial ends you'll need to pick a plan to keep access. You won't lose any of your data.</p>
          </div>
        )}

        {/* ── Footer note ── */}
        <p className="text-center text-xs text-[var(--text-3)] pb-4">
          All plans include a 30-day free trial · Cancel anytime · Secure payment via Stripe
        </p>

      </div>
    </main>
  );
}