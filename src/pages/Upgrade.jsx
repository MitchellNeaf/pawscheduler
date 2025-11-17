// src/pages/Upgrade.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function Upgrade() {
  const [daysLeft, setDaysLeft] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: groomer } = await supabase
        .from("groomers")
        .select("trial_end_date, subscription_status")
        .eq("id", user.id)
        .single();

      if (groomer) {
        const now = new Date();
        const end = new Date(groomer.trial_end_date);
        const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        setDaysLeft(diff);
      }

      setLoading(false);
    };

    load();
  }, []);

  if (loading) return <p className="text-center mt-10">Loading...</p>;

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

        {/* Trial Warnings */}
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

        {/* Monthly Plan */}
        <div className="card hover:shadow-lg transition p-6">
          <h2 className="text-xl font-semibold text-gray-800">Monthly</h2>

          <p className="text-4xl font-extrabold text-emerald-600 mt-2">
            $14.99
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
            className="btn btn-primary w-full mt-6 rounded-xl py-3 font-semibold"
            onClick={() => alert("Stripe monthly checkout coming soon")}
          >
            Upgrade Monthly
          </button>
        </div>

        {/* Yearly Plan */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm hover:shadow-md transition p-6">
          <h2 className="text-xl font-semibold text-emerald-900">Yearly</h2>

          <p className="text-4xl font-extrabold text-emerald-700 mt-2">
            $119
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
            className="btn btn-primary w-full mt-6 rounded-xl py-3 font-semibold"
            onClick={() => alert("Stripe yearly checkout coming soon")}
          >
            Upgrade Yearly
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 text-center text-sm text-gray-500">
        Powered by{" "}
        <span className="font-semibold text-gray-700">PawScheduler</span>
      </div>
    </div>
  );
}
