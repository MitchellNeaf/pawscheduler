// src/pages/Signup.jsx
import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pilot = searchParams.get("pilot");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { data: signData, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          pilot: pilot || null,
        },
      },
    });

    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }

    if (!signData.user) {
      setError("Signup failed. Please try again.");
      setLoading(false);
      return;
    }

    alert("📩 Check your email to confirm your account before logging in.");
    navigate("/auth");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-center">
        {/* LEFT — CONTEXT */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Start using PawScheduler in minutes
          </h1>

          <p className="text-gray-700 mb-6">
            Create your account to manage clients, pets, and appointments —
            all from a clean, mobile-first dashboard built for solo groomers.
          </p>

          <ul className="space-y-3 text-sm text-gray-700">
            <li>⚡ Setup takes under 10 minutes</li>
            <li>🐾 Unlimited clients & pets</li>
            <li>🔔 Automated reminders (email & SMS)</li>
            <li>📱 Designed for phone-first use</li>
          </ul>

          <p className="mt-6 text-xs text-gray-500">
            No contracts. Cancel anytime.
          </p>
        </div>

        {/* RIGHT — SIGNUP FORM */}
        <form
          onSubmit={handleSignup}
          className="card w-full max-w-sm mx-auto"
        >
          <h2 className="text-2xl font-bold mb-2 text-center">
            Create your account
          </h2>

          <p className="text-sm text-gray-600 text-center mb-4">
            {pilot
              ? "You’re starting with a pilot account"
              : "No credit card required"}
          </p>

          {error && (
            <div className="text-red-600 text-sm mb-3 text-center">
              {error}
            </div>
          )}

          <input
            type="text"
            placeholder="Business / Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full mb-3"
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full mb-3"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full mb-3"
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full mb-4"
          />

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p className="text-xs text-gray-500 text-center mt-3">
            You’ll confirm your email before logging in.
          </p>

          <p className="text-center mt-4 text-sm">
            Already have an account?{" "}
            <Link to="/auth" className="text-emerald-600 underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
