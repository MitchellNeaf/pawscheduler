import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase";

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 🐾 Generate friendly booking code
  const generateBookingCode = () => {
    const prefixes = ["PAWS", "GROOM", "TAILS", "FURRY", "DOGGO", "KITTY"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${number}`;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // ✅ Create Supabase Auth user
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }

    const user = data?.user || data?.session?.user;
    if (!user) {
      setError("Signup failed — please check your email to confirm your account.");
      setLoading(false);
      return;
    }

    // ✅ Generate unique booking code
    let bookingCode = "";
    let unique = false;
    while (!unique) {
      bookingCode = generateBookingCode();
      const { data: existing } = await supabase
        .from("groomers")
        .select("id")
        .eq("booking_code", bookingCode)
        .maybeSingle();
      unique = !existing;
    }

    // ✅ Ensure slug is unique
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, "");
    const { data: slugExists } = await supabase
      .from("groomers")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();
    if (slugExists) {
      setError("That slug is already taken — please choose another.");
      setLoading(false);
      return;
    }

    // ✅ Create groomer profile
    const { error: gErr } = await supabase.from("groomers").insert([
      {
        id: user.id,
        full_name: businessName,
        slug: cleanSlug,
        booking_code: bookingCode,
      },
    ]);

    if (gErr) {
      console.error("Groomer insert failed:", gErr.message);
      setError("Signup succeeded, but profile setup failed. Please contact support.");
    } else {
      alert(`🎉 Account created! Your booking code is ${bookingCode}`);
      navigate("/"); // Redirect into app
    }

    setLoading(false);
  };

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Create Your Groomer Account</h1>

      {error && <div className="text-red-600 mb-3">{error}</div>}

      <form onSubmit={handleSignup} className="space-y-3">
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
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 text-white px-4 py-2 rounded w-full"
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
      </form>

      <p className="text-sm text-center mt-4">
        Already have an account?{" "}
        <Link to="/auth" className="text-blue-600 underline">
          Login
        </Link>
      </p>
    </main>
  );
}
