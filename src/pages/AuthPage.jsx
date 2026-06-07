// src/pages/AuthPage.jsx
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pilot = searchParams.get("pilot");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pilot redirect
  useEffect(() => {
    if (pilot === "mobile60") {
      localStorage.setItem("pawscheduler_pilot", "mobile60");
      navigate("/signup?pilot=mobile60", { replace: true });
    }
  }, [pilot, navigate]);

  // Skip if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/");
    });
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: loginError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (loginError) {
      // Translate technical Supabase errors into human-friendly messages
      const msg = loginError.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("wrong password")) {
        setError("Incorrect email or password. Please try again.");
      } else if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
        setError("Please check your email and confirm your account before logging in.");
      } else if (msg.includes("too many requests") || msg.includes("rate limit")) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(loginError.message);
      }
      setLoading(false);
      return;
    }

    const user = data?.user;
    if (!user) {
      setError("Login failed. Please try again.");
      setLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("groomers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    navigate(existing ? "/" : "/onboarding");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-center">
        {/* LEFT — CONTEXT */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Simple scheduling for solo & mobile groomers
          </h1>

          <p className="text-gray-700 mb-6">
            PawScheduler helps you book clients, manage pets, and send reminders
            — without staff, clutter, or complicated software.
          </p>

          <ul className="space-y-3 text-sm text-gray-700">
            <li>📅 Clean, mobile-first schedule</li>
            <li>🐾 Clients & pets in one place</li>
            <li>🔔 Email & SMS reminders (opt-in)</li>
            <li>⚡ Built for one-person businesses</li>
          </ul>

          <p className="mt-6 text-xs text-gray-500">
            No contracts. Cancel anytime.
          </p>
        </div>

        {/* RIGHT — LOGIN */}
        <form
          onSubmit={handleLogin}
          className="card w-full max-w-sm mx-auto"
        >
          <h2 className="text-2xl font-bold mb-2 text-center">
            Welcome back
          </h2>
          <p className="text-sm text-gray-600 text-center mb-4">
            Log in to manage your schedule
          </p>

          {error && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <span className="text-red-500 text-lg flex-shrink-0 leading-none mt-0.5">⚠</span>
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <input
            type="email"
            placeholder="Email"
            className="w-full mb-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="button"
            className="text-xs text-emerald-600 underline mb-4"
            onClick={async () => {
              if (!email) {
                setError("Enter your email above first.");
                return;
              }

              const { error } =
                await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });

              if (error) setError(error.message);
              else alert("Password reset email sent.");
            }}
          >
            Forgot password?
          </button>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>

          {loading && (
            <p className="text-xs text-gray-400 text-center mt-2">This may take a moment…</p>
          )}

          <p className="text-center mt-4 text-sm">
            New here?{" "}
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="text-emerald-600 underline"
            >
              Create an account
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}