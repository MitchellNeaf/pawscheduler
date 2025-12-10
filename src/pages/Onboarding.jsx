// src/pages/Onboarding.jsx
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";

export default function Onboarding() {
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // Fetch user and check if groomer profile already exists
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: existing } = await supabase
        .from("groomers")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (existing) {
        navigate("/");
        return;
      }

      setCheckingProfile(false);
    })();
  }, [navigate]);

  // 🔍 Check if slug exists
  const checkSlugAvailable = async (raw) => {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");

    if (!cleaned) {
      setSlugAvailable(null);
      return;
    }

    const { data } = await supabase
      .from("groomers")
      .select("id")
      .eq("slug", cleaned)
      .maybeSingle();

    setSlugAvailable(!data);
  };

  // Handle slug typing
  const handleSlugInput = (value) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    checkSlugAvailable(cleaned);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (slugAvailable === false) {
      alert("This slug is already taken. Please choose another.");
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("You are not logged in.");
      navigate("/auth");
      return;
    }

    // 🔥 Read the pilot flag stored by ProtectedRoute
    const pilot = localStorage.getItem("pawscheduler_pilot");

    // Trial setup
    const trialStart = new Date();
    const trialEnd = new Date();

    let trialLength = 30; // default 30-day trial

    if (pilot === "mobile60") {
      trialLength = 60;
    }

    trialEnd.setDate(trialEnd.getDate() + trialLength);

    const bookingCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { error } = await supabase.from("groomers").insert([
      {
        id: user.id,
        full_name: businessName,
        slug: slug,
        booking_code: bookingCode,
        email: user.email,

        // ⭐ Trial info
        trial_start_date: trialStart.toISOString(),
        trial_end_date: trialEnd.toISOString(),
        subscription_status: "trial",

        // ⭐ Track signup source
        signup_source: pilot === "mobile60" ? "mobile_pilot_60" : "standard",
      },
    ]);

    // Clear pilot flag so future logins don't reuse it
    localStorage.removeItem("pawscheduler_pilot");

    if (error) {
      alert("Error creating groomer profile: " + error.message);
      setLoading(false);
      return;
    }

    navigate("/"); // Done!
  };

  if (checkingProfile) {
    return <p className="text-center mt-10">Checking your profile…</p>;
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Set Up Your Groomer Profile</h1>
      <p className="text-gray-600 text-sm mb-6">
        Complete this one-time setup to personalize your booking page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Business Name</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full"
            required
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Public Slug (your booking link)
          </label>

          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugInput(e.target.value)}
            placeholder="ex: happypaws"
            className="w-full"
            required
          />

          {slug && slugAvailable === true && (
            <p className="text-green-600 text-sm mt-1">
              ✔ Available! Your booking link will be:
              <br />
              <span className="font-semibold">
                pawscheduler.com/book/{slug}
              </span>
            </p>
          )}

          {slug && slugAvailable === false && (
            <p className="text-red-600 text-sm mt-1">
              ✖ This slug is already taken.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || slugAvailable === false}
          className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700"
        >
          {loading ? "Saving…" : "Save & Continue"}
        </button>
      </form>
    </main>
  );
}
