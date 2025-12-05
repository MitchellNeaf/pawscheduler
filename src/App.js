// App.js
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
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
import Profile from "./pages/Profile";
import Upgrade from "./pages/Upgrade";
import Help from "./pages/Help";

// =============================
// 🔐 FIXED PROTECTED ROUTE
// =============================
function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user || null;
      setUser(currentUser);

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
        if (window.location.pathname !== "/onboarding") {
          navigate("/onboarding");
        }
        setLoading(false);
        return;
      }

      const now = new Date();
      const trialEnd = groomer.trial_end_date
        ? new Date(groomer.trial_end_date)
        : null;

      if (groomer.subscription_status === "trial" && trialEnd && now <= trialEnd) {
        const daysLeft = Math.ceil((trialEnd - now) / 86400000);
        if (daysLeft <= 5 && daysLeft >= 0) setShowBanner(true);
      } else if (
        groomer.subscription_status === "trial" &&
        trialEnd &&
        now > trialEnd
      ) {
        await supabase
          .from("groomers")
          .update({ subscription_status: "expired" })
          .eq("id", currentUser.id);
        navigate("/upgrade");
      } else if (groomer.subscription_status === "expired") {
        navigate("/upgrade");
      }

      setLoading(false);
    };

    check();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user || null)
    );
    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  if (loading) return <p className="text-center mt-10">Loading…</p>;
  if (!user) return <Navigate to="/auth" />;

  return (
    <>
      {showBanner && (
        <div className="bg-yellow-100 text-yellow-800 text-center py-2 font-semibold">
          ⏳ Your trial ends soon — upgrade to keep using PawScheduler.
        </div>
      )}
      {children}
    </>
  );
}

// =============================
// 🧭 PROFESSIONAL NAVIGATION BAR
// =============================
function AppShell() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const hideNav =
    location.pathname.startsWith("/book/") ||
    location.pathname === "/auth" ||
    location.pathname === "/signup" ||
    location.pathname === "/upgrade" ||
    location.pathname === "/onboarding";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <>
      {!hideNav && (
        <nav className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 relative z-[9999]">

          {/* TOP BAR */}
          <div className="flex items-center justify-between">

            {/* Logo / Title */}
            <div className="text-2xl font-semibold tracking-tight text-gray-900">
              <span className="text-emerald-600">Paw</span>Scheduler
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setOpen(!open)}
              className="sm:hidden p-2 rounded-lg border border-gray-300
                         shadow-sm hover:bg-gray-100 transition"
            >
              {/* Hamburger icon */}
              <div className="w-6 h-[2px] bg-gray-700 mb-1"></div>
              <div className="w-6 h-[2px] bg-gray-700 mb-1"></div>
              <div className="w-6 h-[2px] bg-gray-700"></div>
            </button>

            {/* Desktop Menu */}
            <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
              <Link to="/schedule" className="hover:text-emerald-600">Schedule</Link>
              <Link to="/" className="hover:text-emerald-600">Clients</Link>
              <Link to="/unpaid" className="hover:text-emerald-600">Unpaid</Link>
              <Link to="/revenue" className="hover:text-emerald-600">Revenue</Link>
              <Link to="/profile" className="hover:text-emerald-600">Profile</Link>
              <Link to="/help" className="hover:text-emerald-600">Help</Link>

              <button
                onClick={handleLogout}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                Logout
              </button>
            </div>
          </div>

          {/* MOBILE DROPDOWN MENU */}
          {open && (
            <div
              className="sm:hidden mt-3 bg-white border border-gray-200 rounded-xl shadow-lg
                         p-4 space-y-4 text-sm font-medium animate-fadeDown"
            >
              <Link to="/schedule" className="block text-gray-700 hover:text-emerald-600">
                Schedule
              </Link>
              <Link to="/" className="block text-gray-700 hover:text-emerald-600">
                Clients
              </Link>
              <Link to="/unpaid" className="block text-gray-700 hover:text-emerald-600">
                Unpaid
              </Link>
              <Link to="/revenue" className="block text-gray-700 hover:text-emerald-600">
                Revenue
              </Link>
              <Link to="/profile" className="block text-gray-700 hover:text-emerald-600">
                Profile
              </Link>
              <Link to="/help" className="block text-gray-700 hover:text-emerald-600">
                Help
              </Link>

              <button
                onClick={handleLogout}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                Logout
              </button>
            </div>
          )}
        </nav>
      )}

      {/* ROUTES */}
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/upgrade" element={<Upgrade />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/book/:slug" element={<Book />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />

        {/* PROTECTED ROUTES */}
        <Route path="/" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/clients/:clientId" element={<ProtectedRoute><ClientPets /></ProtectedRoute>} />
        <Route path="/pets/:petId/appointments" element={<ProtectedRoute><PetAppointments /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
        <Route path="/unpaid" element={<ProtectedRoute><UnpaidAppointments /></ProtectedRoute>} />
        <Route path="/revenue" element={<ProtectedRoute><Revenue /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

// =============================
// ROOT WRAPPER
// =============================
export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
