import { useState, useEffect } from "react";
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

  // ✅ After login, ensure groomer record exists
  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const { data: existing } = await supabase
        .from("groomers")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!existing) {
        const bookingCode = generateBookingCode();
        const cleanSlug =
          slug?.toLowerCase().replace(/\s+/g, "") ||
          user.email.split("@")[0].replace(/\W+/g, "");
        const { error: insertErr } = await supabase.from("groomers").insert([
          {
            id: user.id,
            full_name: businessName || "New Groomer",
            slug: cleanSlug,
            booking_code: bookingCode,
          },
        ]);
        if (insertErr) console.error("Groomer creation failed:", insertErr.message);
        else console.log("✅ Groomer profile created automatically");
      }
    })();
  }, [businessName, slug]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signErr } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }

    alert("✅ Check your email to confirm your account before logging in.");
    navigate("/auth");
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
