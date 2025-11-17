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

// =====================
// FIXED PROTECTED ROUTE
// No auto-insert. Redirect only.
// =====================
function ProtectedRoute({ children }) {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTrialBanner, setShowTrialBanner] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user || null;

      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      // Fetch groomer row
      const { data: groomer } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      // Missing groomer → onboarding (user must choose slug)
      if (!groomer) {
        if (window.location.pathname !== "/onboarding") {
          navigate("/onboarding");
        }
        setLoading(false);
        return;
      }

      // Trial logic
      const now = new Date();
      const trialEnd = groomer.trial_end_date
        ? new Date(groomer.trial_end_date)
        : null;

      // Trial active
      if (
        groomer.subscription_status === "trial" &&
        trialEnd &&
        now <= trialEnd
      ) {
        const daysLeft = Math.ceil(
          (trialEnd - now) / (1000 * 60 * 60 * 24)
        );
        if (daysLeft <= 5 && daysLeft >= 0) {
          setShowTrialBanner(true);
        }

        setLoading(false);
        return;
      }

      // Trial expired → mark expired
      if (
        groomer.subscription_status === "trial" &&
        trialEnd &&
        now > trialEnd
      ) {
        await supabase
          .from("groomers")
          .update({ subscription_status: "expired" })
          .eq("id", currentUser.id);

        navigate("/upgrade");
        setLoading(false);
        return;
      }

      // Already expired → always upgrade
      if (groomer.subscription_status === "expired") {
        if (window.location.pathname !== "/upgrade") {
          navigate("/upgrade");
        }
        setLoading(false);
        return;
      }

      // Paid user
      setLoading(false);
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user || null)
    );
    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  if (loading) return <p className="text-center mt-10">Loading...</p>;
  if (!user) return <Navigate to="/auth" />;

  return (
    <>
      {showTrialBanner && (
        <div className="bg-yellow-100 text-yellow-800 text-center py-2 font-semibold">
          ⏳ Your trial ends soon — upgrade to keep using PawScheduler.
        </div>
      )}
      {children}
    </>
  );
}

// =====================
// NAVBAR + SHELL
// =====================
function AppShell() {
  const location = useLocation();

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
        <nav className="bg-white shadow-md px-4 py-2 mb-4 flex justify-between items-center">
          <div className="flex gap-4 text-sm font-medium text-gray-700">
            <Link to="/" className="hover:text-emerald-600">Clients</Link>
            <Link to="/schedule" className="hover:text-emerald-600">Schedule</Link>
            <Link to="/unpaid" className="hover:text-emerald-600">Unpaid</Link>
            <Link to="/revenue" className="hover:text-emerald-600">Revenue</Link>
            <Link to="/profile" className="hover:text-emerald-600">Profile</Link>
          </div>

          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            Logout
          </button>
        </nav>
      )}

      <Routes>
        {/* PUBLIC */}
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/book/:slug" element={<Book />} />

        {/* PROTECTED */}
        <Route path="/" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/clients/:clientId" element={<ProtectedRoute><ClientPets /></ProtectedRoute>} />
        <Route path="/pets/:petId/appointments" element={<ProtectedRoute><PetAppointments /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
        <Route path="/unpaid" element={<ProtectedRoute><UnpaidAppointments /></ProtectedRoute>} />
        <Route path="/revenue" element={<ProtectedRoute><Revenue /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

// =====================
// ROOT APP WRAPPER
// =====================
export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
