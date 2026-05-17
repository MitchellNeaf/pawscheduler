// App.js
import * as Sentry from "@sentry/react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
  useNavigate,
  useSearchParams
} from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import AuthPage from "./pages/AuthPage";
import Onboarding from "./pages/Onboarding";
import Clients from "./pages/Clients";
import ClientPets from "./pages/ClientPets";
import PetAppointments from "./pages/PetAppointments";
import Schedule from "./pages/Schedule";
import UnpaidAppointments from "./pages/UnpaidAppointments";
import Book from "./pages/Book";
import Revenue from "./pages/Revenue";
import SmsInbox from "./pages/SmsInbox";
import Profile from "./pages/Profile";
import Upgrade from "./pages/Upgrade";
import Help from "./pages/Help";
import Waiver from "./pages/Waiver";
import Intake from "./pages/Intake";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancelled from "./pages/PaymentCancelled";
import ConfirmPage from "./pages/ConfirmPage";
import OnboardingTour from "./components/OnboardingTour";

// Legal pages
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Refund from "./pages/legal/Refund";
import Cookies from "./pages/legal/Cookies";
import DPA from "./pages/legal/DPA";
import Disclaimer from "./pages/legal/Disclaimer";
import AUP from "./pages/legal/AUP";
import Retention from "./pages/legal/Retention";

// 🔒 HARD GLOBAL LOCK (prevents StrictMode duplication)
let SAMPLE_SETUP_RUNNING = false;

// =============================
// 🔐 PROTECTED ROUTE
// =============================
function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const showBanner = false;

  const pilot = searchParams.get("pilot");

  useEffect(() => {
    if (pilot === "mobile60") {
      localStorage.setItem("pawscheduler_pilot", "mobile60");
    }
  }, [pilot]);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        Sentry.setUser({ id: currentUser.id, email: currentUser.email });
      }

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const { data: groomer } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!groomer) {
        if (location.pathname !== "/onboarding") {
          navigate("/onboarding", { replace: true });
        }
        setLoading(false);
        return;
      }

      // Show onboarding tour for new groomers who haven't seen it
      if (groomer && !groomer.onboarding_complete && location.pathname === "/schedule") {
        // Small delay so the schedule page renders first
        setTimeout(() => setShowTour(true), 800);
      }

      // =============================
      // ⭐ ONE-TIME SAMPLE ACTIVATION
      // =============================
      const sessionKey = `ps_sample_done_${groomer.id}`;
      const alreadyRanThisSession = sessionStorage.getItem(sessionKey) === "1";

      if (
        !groomer.has_seen_sample &&
        !alreadyRanThisSession &&
        !SAMPLE_SETUP_RUNNING
      ) {
        SAMPLE_SETUP_RUNNING = true;
        sessionStorage.setItem(sessionKey, "1");

        const hoursOk = await ensureDefaultWorkingHours(groomer.id);
        const sampleOk = await createSampleData(groomer.id);

        if (hoursOk && sampleOk) {
          await supabase
            .from("groomers")
            .update({ has_seen_sample: true })
            .eq("id", groomer.id);
        }

        if (location.pathname !== "/schedule") {
          navigate("/schedule", { replace: true });
          setLoading(false);
          return;
        }
      }

      // =============================
      // Trial logic (unchanged)
      // =============================
      const now = new Date();
      const trialEnd = groomer.trial_end_date
        ? new Date(groomer.trial_end_date)
        : null;

      // Legacy trial handling — convert expired trials to free
      if (groomer.subscription_status === "trial" && trialEnd && now > trialEnd) {
        await supabase
          .from("groomers")
          .update({ subscription_status: "free", plan_tier: "free" })
          .eq("id", groomer.id);
      }

      // Hard expired accounts still get redirected
      if (groomer.subscription_status === "expired") {
        navigate("/upgrade", { replace: true });
        setLoading(false);
        return;
      }

      setLoading(false);
    };

    run();
  }, [navigate, location.pathname]);

  if (loading) return <p className="text-center mt-10">Loading…</p>;
  if (!user) return <Navigate to="/auth" />;

  return (
    <>
      {showTour && (
        <OnboardingTour
          userId={user?.id}
          onComplete={() => setShowTour(false)}
        />
      )}
      {showBanner && (
        <div className="bg-yellow-100 text-yellow-800 text-center py-2 font-semibold">
          ✨ You're on the Free plan — upgrade anytime to unlock reminders, intake forms, waivers, payments and more. <a href="/upgrade" style={{color:"#065f46",fontWeight:700}}>See plans →</a>
        </div>
      )}
      {children}
    </>
  );
}

// =============================
// ⭐ ACTIVATION HELPERS (MATCH DB)
// =============================
async function ensureDefaultWorkingHours(groomerId) {
  const { data: existing } = await supabase
    .from("working_hours")
    .select("id")
    .eq("groomer_id", groomerId)
    .limit(1);

  if (existing && existing.length > 0) return true;

  const rows = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    rows.push({
      groomer_id: groomerId,
      weekday,
      start_time: "08:00",
      end_time: "17:00"
    });
  }

  const { error } = await supabase.from("working_hours").insert(rows);
  if (error) {
    console.error("working_hours insert error", error);
    return false;
  }
  return true;
}

async function createSampleData(groomerId) {
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .insert({
      groomer_id: groomerId,
      full_name: "Sample Client",
      is_sample: true
    })
    .select()
    .single();

  if (cErr) {
    console.error("client insert error", cErr);
    return false;
  }

  const { data: pet, error: pErr } = await supabase
    .from("pets")
    .insert({
      groomer_id: groomerId,
      client_id: client.id,
      name: "Bella",
      breed: "Golden Retriever",
      tags: ["Friendly"],
      notes: "Sample pet — delete anytime",
      slot_weight: 1,
      is_sample: true
    })
    .select()
    .single();

  if (pErr) {
    console.error("pet insert error", pErr);
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error: aErr } = await supabase.from("appointments").insert({
    groomer_id: groomerId,
    pet_id: pet.id,
    date: today,
    time: "08:00",
    duration_min: 60,
    services: ["Full Groom"],
    status: "scheduled",
    confirmed: false,
    no_show: false,
    paid: false,
    is_sample: true,
    notes: "Sample appointment — tap to edit or delete"
  });

  if (aErr) {
    console.error("appointment insert error", aErr);
    return false;
  }

  return true;
}

// =============================
// 🧭 APP SHELL
// =============================
function AppShell() {
  const location = useLocation();

  const hideNav =
    location.pathname.startsWith("/book/") ||
    location.pathname.startsWith("/waiver/") ||
    location.pathname.startsWith("/intake/") ||
    location.pathname.startsWith("/confirm/") ||
    location.pathname === "/payment-success" ||
    location.pathname === "/payment-cancelled" ||
    location.pathname === "/auth" ||
    location.pathname === "/signup" ||
    location.pathname === "/upgrade" ||
    location.pathname === "/onboarding";

  const hideFooter =
    location.pathname.startsWith("/book/") ||
    location.pathname.startsWith("/waiver/") ||
    location.pathname.startsWith("/intake/") ||
    location.pathname.startsWith("/confirm/") ||
    location.pathname === "/payment-success" ||
    location.pathname === "/payment-cancelled" ||
    location.pathname === "/auth" ||
    location.pathname === "/signup" ||
    location.pathname === "/onboarding";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);

  const navItems = useMemo(
    () => [
      { to: "/schedule", label: "Schedule" },
      { to: "/clients", label: "Clients" },
      { to: "/inbox", label: "Inbox" },
      { to: "/unpaid", label: "Unpaid" },
      { to: "/revenue", label: "Revenue" },
      { to: "/profile", label: "Profile" },
      { to: "/help", label: "Help" }
    ],
    []
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onDown = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMobileOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {!hideNav && (
        <nav className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xl font-semibold shrink-0">
              <span className="text-emerald-600">Paw</span>Scheduler
            </div>

            {/* DESKTOP LINKS */}
            <div className="hidden sm:flex gap-6 text-sm font-medium items-center">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  data-tour={
                    item.to === "/clients" ? "tour-nav-clients" :
                    item.to === "/profile" ? "tour-nav-profile" :
                    undefined
                  }
                >
                  {item.label}
                </Link>
              ))}
              <button onClick={handleLogout} className="text-xs text-gray-500">
                Logout
              </button>
            </div>

            {/* MOBILE HAMBURGER */}
            <div className="sm:hidden relative" ref={menuRef}>
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((v) => !v)}
                className="btn-secondary px-3 py-2 rounded-xl"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 7H20M4 12H20M4 17H20"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {mobileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden z-50">
                  <div className="py-2">
                    {navItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="block px-4 py-3 text-sm text-gray-800 hover:bg-emerald-50 hover:text-emerald-700"
                        data-tour={
                          item.to === "/clients" ? "tour-nav-clients" :
                          item.to === "/profile" ? "tour-nav-profile" :
                          undefined
                        }
                      >
                        {item.label}
                      </Link>
                    ))}
                    <div className="my-2 border-t border-gray-100" />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </nav>
      )}

      <Routes>
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/dpa" element={<DPA />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/aup" element={<AUP />} />
        <Route path="/retention" element={<Retention />} />

        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/upgrade" element={<Upgrade />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/book/:slug" element={<Book />} />
        <Route path="/waiver/:slug" element={<Waiver />} />
        <Route path="/intake/:slug" element={<Intake />} />
        <Route path="/confirm/:token" element={<ConfirmPage />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment-cancelled" element={<PaymentCancelled />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/schedule" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients"
          element={
            <ProtectedRoute>
              <Clients />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId"
          element={
            <ProtectedRoute>
              <ClientPets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pets/:petId/appointments"
          element={
            <ProtectedRoute>
              <PetAppointments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute>
              <Schedule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/unpaid"
          element={
            <ProtectedRoute>
              <UnpaidAppointments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/revenue"
          element={
            <ProtectedRoute>
              <Revenue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <SmsInbox />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          }
        />
      </Routes>

      {!hideFooter && (
        <footer className="text-center text-xs text-gray-500 py-6">
          © {new Date().getFullYear()} PawScheduler
        </footer>
      )}
    </>
  );
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={
      <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "#6b7280" }}>This error has been reported. Please refresh the page.</p>
        <button onClick={() => window.location.reload()}
          style={{ marginTop: 16, padding: "10px 24px", background: "#059669",
            color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
          Refresh
        </button>
      </div>
    }>
      {/* TEMP: Sentry test — remove after confirming */}
      <button
        onClick={() => { throw new Error("Sentry test from PawScheduler"); }}
        style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999,
          background: "#dc2626", color: "white", padding: "8px 16px",
          borderRadius: 8, fontWeight: 700, border: "none", cursor: "pointer",
          fontSize: 14 }}
      >
        Test Sentry
      </button>
      <Router>
        <AppShell />
      </Router>
    </Sentry.ErrorBoundary>
  );
}