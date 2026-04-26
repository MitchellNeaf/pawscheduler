// src/pages/Upgrade.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";

const PLANS = [
  {
    key:         "free",
    name:        "Free",
    price:       0,
    description: "Get started with no commitment.",
    color:       "gray",
    features: [
      "Up to 50 appointments per month",
      "Unlimited clients & pet profiles",
      "Behavioral tags (Bites, Anxious, Senior…)",
      "Schedule — grid & list views",
      "Confirmed / paid / no-show tracking",
      "Dark mode",
    ],
    excluded: [
      "SMS & email reminders",
      "Self-booking link",
      "Intake forms",
      "Grooming waivers",
      "Vaccine tracking & alerts",
      "Client payments",
      "AI SMS booking bot",
    ],
  },
  {
    key:         "basic",
    name:        "Basic",
    price:       9.99,
    description: "Unlimited scheduling with reminders.",
    color:       "blue",
    features: [
      "Everything in Free",
      "Unlimited appointments",
      "SMS & email reminders",
      "Manual reminder button",
      "Self-booking link for clients",
      "Revenue tracking",
    ],
    excluded: [
      "Intake forms",
      "Grooming waivers",
      "Vaccine tracking & alerts",
      "Client payments",
      "AI SMS booking bot",
    ],
  },
  {
    key:         "starter",
    name:        "Starter",
    price:       49.99,
    description: "The full grooming business suite.",
    color:       "emerald",
    badge:       "Most Popular",
    features: [
      "Everything in Basic",
      "Digital intake forms",
      "Grooming waivers (digital signature)",
      "Vaccine tracking & expiration alerts",
      "Client payments via Stripe",
      "Multi-pet bookings",
      "Auto-fill service pricing",
      "Unpaid appointment tracking",
    ],
    excluded: [
      "AI SMS booking bot",
      "Dedicated scheduling phone number",
    ],
  },
  {
    key:         "pro",
    name:        "Pro",
    price:       79.99,
    description: "Everything, plus AI that books while you groom.",
    color:       "violet",
    features: [
      "Everything in Starter",
      "AI SMS booking bot",
      "Dedicated scheduling phone number",
      "Bot books, reschedules & cancels by text",
      "24-hour cancellation policy auto-enforced",
      "Client conversation history in app",
      "Priority support",
      "Early access to new features",
    ],
    excluded: [],
  },
];

const TIER_ORDER = ["free", "basic", "starter", "pro"];

export default function Upgrade() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [groomer, setGroomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);

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
    if (!user || planKey === "free") return;
    setCheckingOut(planKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/.netlify/functions/createCheckout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ plan: planKey, billing: "monthly" }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setCheckingOut(null);
    }
  };

  const currentPlan = groomer?.plan_tier || "free";
  const currentTierIndex = TIER_ORDER.indexOf(currentPlan);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-3)]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">

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

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-[var(--text-1)]">Choose your plan</h1>
          <p className="text-[var(--text-3)] text-sm">
            You're on the <strong className="text-[var(--text-1)] capitalize">{currentPlan}</strong> plan.
            {currentPlan === "free" && " Upgrade anytime — cancel anytime."}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {PLANS.map((plan) => {
            const isCurrentPlan = currentPlan === plan.key;
            const isUpgrade = TIER_ORDER.indexOf(plan.key) > currentTierIndex;

            const borderColor = {
              gray:    "border-[var(--border-med)]",
              blue:    "border-blue-200",
              emerald: "border-emerald-400",
              violet:  "border-violet-400",
            }[plan.color];

            const badgeBg = {
              gray:    "bg-gray-500",
              blue:    "bg-blue-500",
              emerald: "bg-emerald-500",
              violet:  "bg-violet-600",
            }[plan.color];

            const ctaBg = {
              gray:    "bg-gray-100 text-gray-500 cursor-default",
              blue:    "bg-blue-600 text-white hover:bg-blue-700",
              emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
              violet:  "bg-violet-600 text-white hover:bg-violet-700",
            }[plan.color];

            const checkColor = {
              gray:    "text-gray-400",
              blue:    "text-blue-500",
              emerald: "text-emerald-500",
              violet:  "text-violet-500",
            }[plan.color];

            return (
              <div key={plan.key}
                className={`rounded-2xl border-2 p-5 space-y-4 relative flex flex-col
                  ${borderColor}
                  ${isCurrentPlan ? "ring-2 ring-offset-1 ring-emerald-400" : ""}
                  ${plan.key === "starter" ? "shadow-lg shadow-emerald-100" : ""}
                `}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className={`${badgeBg} text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap`}>
                      {plan.badge}
                    </span>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3.5 right-4">
                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                      Current
                    </span>
                  </div>
                )}

                <div>
                  <h2 className="text-lg font-bold text-[var(--text-1)]">{plan.name}</h2>
                  <p className="text-xs text-[var(--text-3)] mt-0.5">{plan.description}</p>
                  <div className="mt-3 flex items-end gap-1">
                    {plan.price === 0 ? (
                      <span className="text-3xl font-black text-[var(--text-1)]">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-black text-[var(--text-1)]">
                          ${plan.price.toFixed(2)}
                        </span>
                        <span className="text-[var(--text-3)] text-sm mb-1">/mo</span>
                      </>
                    )}
                  </div>
                </div>

                {isCurrentPlan ? (
                  <div className="w-full py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-sm font-semibold text-emerald-700">
                    ✓ Current plan
                  </div>
                ) : plan.key === "free" ? (
                  <div className="w-full py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-center text-sm text-gray-400">
                    Free forever
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.key)}
                    disabled={!!checkingOut}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 ${ctaBg}`}
                  >
                    {checkingOut === plan.key
                      ? "Loading…"
                      : isUpgrade
                      ? `Upgrade to ${plan.name}`
                      : `Switch to ${plan.name}`}
                  </button>
                )}

                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-xs ${f.startsWith("Everything") ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}`}>
                      <span className={`mt-0.5 font-bold flex-shrink-0 ${checkColor}`}>✓</span>
                      {f}
                    </li>
                  ))}
                  {plan.excluded.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[var(--text-3)] opacity-40">
                      <span className="mt-0.5 flex-shrink-0">✕</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {currentPlan === "free" && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border-med)] p-5 text-sm text-[var(--text-2)] space-y-1 max-w-2xl mx-auto text-center">
            <p className="font-semibold text-[var(--text-1)]">You're on the Free plan</p>
            <p>Free includes up to 50 appointments per month. Upgrade to Basic or higher for unlimited appointments, reminders, and more.</p>
          </div>
        )}

        <p className="text-center text-xs text-[var(--text-3)] pb-4">
          All paid plans · Cancel anytime · Secure payment via Stripe
        </p>

      </div>
    </main>
  );
}