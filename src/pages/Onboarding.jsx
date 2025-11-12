// src/pages/Onboarding.jsx
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";

export default function Onboarding() {
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // 👀 If groomer already exists, skip onboarding
      const { data: existing } = await supabase
        .from("groomers")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (existing) {
        navigate("/");
      } else {
        setChecking(false);
      }
    })();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Not logged in.");
      navigate("/auth");
      return;
    }

    const bookingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, "");

    const { error } = await supabase.from("groomers").insert([
      {
        id: user.id,
        full_name: businessName,
        slug: cleanSlug,
        booking_code: bookingCode,
      },
    ]);

    if (error) {
      alert("Error creating groomer: " + error.message);
    } else {
      navigate("/"); // ✅ Go to main app
    }

    setLoading(false);
  };

  if (checking) {
    return <p className="text-center mt-10">Checking your profile...</p>;
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Set Up Your Groomer Profile</h1>
      <p className="text-gray-600 text-sm mb-6">
        Complete this one-time setup to personalize your booking page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Business Name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />

        <input
          type="text"
          placeholder="Public Slug (ex: happypaws)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 text-white px-4 py-2 rounded w-full"
        >
          {loading ? "Creating..." : "Save & Continue"}
        </button>
      </form>
    </main>
  );
}
