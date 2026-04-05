// src/pages/Upgrade.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function Upgrade() {
  const [daysLeft, setDaysLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [justPaid, setJustPaid] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email);
      setUserId(user.id);

      const { data: groomer } = await supabase
        .from("groomers")
        .select("trial_end_date, subscription_status")
        .eq("id", user.id)
        .single();

      // If already active, auto-redirect to dashboard
      if (groomer?.subscription_status === "active") {
        window.location.href = "/";
        return;
      }

      // If success query param present → user just completed checkout
      if (window.location.search.includes("success=1")) {
        setJustPaid(true);

        // Give webhook ~1s to finish writing before redirecting
        setTimeout(() => {
          window.location.href = "/";
        }, 1800);
      }

      if (groomer) {
        const now = new Date();
        const end = new Date(groomer.trial_end_date);
        const diff = Math.ceil((end - now) / 86400000);
        setDaysLeft(diff);
      }
    };

    load();
  }, []);

  const startCheckout = async (priceId) => {
    setLoading(true);

    const resp = await fetch("/.netlify/functions/createCheckout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId,
        userId,
        email: userEmail
      })
    });

    const json = await resp.json();

    if (json.url) {
      window.location.href = json.url;
    } else {
      console.error("Stripe checkout error:", json);
      setLoading(false);
      alert("Failed to launch Stripe Checkout.");
    }
  };

  if (justPaid) {
    return (
      <div className="max-w-lg mx-auto p-10 text-center">
        <h1 className="text-3xl font-bold text-emerald-700 mb-4">
          🎉 Thank you!
        </h1>
        <p className="text-gray-700 text-lg">
          Your subscription is being activated…
        </p>
        <p className="text-gray-500 mt-3">Redirecting you now…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-800">
          Upgrade Your PawScheduler
        </h1>
        <p className="text-gray-600 mt-2">
          Keep your bookings, reminders, and schedule running smoothly.
        </p>

        {daysLeft !== null && daysLeft >= 0 && (
          <div className="mt-4 bg-yellow-100 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-semibold">
            ⏳ Your trial ends in <strong>{daysLeft}</strong> days.
          </div>
        )}

        {daysLeft !== null && daysLeft < 0 && (
          <div className="mt-4 bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-xl font-semibold">
            🚫 Your trial has ended — upgrade to continue.
          </div>
        )}
      </div>

      {/* Pricing Grid */}
      <div className="grid gap-6 sm:grid-cols-2">

        {/* Monthly */}
        <div className="card hover:shadow-lg transition p-6">
          <h2 className="text-xl font-semibold text-gray-800">Monthly</h2>

          <p className="text-4xl font-extrabold text-emerald-600 mt-2">
            $29.99
            <span className="text-base font-medium text-gray-600">/mo</span>
          </p>

          <ul className="mt-4 text-gray-700 text-sm space-y-1.5">
            <li>✔ Unlimited Clients</li>
            <li>✔ Pets & Appointments</li>
            <li>✔ Email Reminders</li>
            <li>✔ Revenue Tracking</li>
            <li>✔ Priority Support</li>
          </ul>

          <button
            disabled={loading}
            className="btn btn-primary w-full mt-6 rounded-xl py-3 font-semibold"
            onClick={() => startCheckout("price_1TJ05P1RxmPJHwWbW7DeCdM8")}
          >
            Upgrade Monthly
          </button>
        </div>

        {/* Yearly */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm hover:shadow-md transition p-6">
          <h2 className="text-xl font-semibold text-emerald-900">Yearly</h2>

          <p className="text-4xl font-extrabold text-emerald-700 mt-2">
            $299.99
            <span className="text-base font-medium text-emerald-800">/yr</span>
          </p>

          <p className="text-xs font-semibold text-emerald-900 bg-emerald-100 inline-block px-2 py-1 rounded mt-1">
            Best value — 2 months free
          </p>

          <ul className="mt-4 text-emerald-900 text-sm space-y-1.5">
            <li>✔ Everything in Monthly</li>
            <li>✔ Lower yearly cost</li>
            <li>✔ Perfect for regular clients</li>
          </ul>

          <button
            disabled={loading}
            className="btn btn-primary w-full mt-6 rounded-xl py-3 font-semibold"
            onClick={() => startCheckout("price_1TJ04q1RxmPJHwWbtrEnKIHW")}
          >
            Upgrade Yearly
          </button>
        </div>
      </div>

      {loading && (
        <p className="mt-6 text-center text-gray-500">Redirecting to Stripe…</p>
      )}

      <div className="mt-10 text-center text-sm text-gray-500">
        Powered by{" "}
        <span className="font-semibold text-gray-700">PawScheduler</span>
      </div>
    </div>
  );
}
