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
import Profile from "./pages/Profile"; // ⭐ NEW

// =====================
// 🔒 Protected route wrapper
// =====================
function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user || null;
      setUser(currentUser);

      // If logged in but no groomer profile exists → go to onboarding
      if (currentUser) {
        const { data: existing } = await supabase
          .from("groomers")
          .select("id")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (!existing && window.location.pathname !== "/onboarding") {
          navigate("/onboarding");
        }
      }

      setLoading(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        const u = session?.user || null;
        setUser(u);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  if (loading) return <p className="text-center mt-10">Loading...</p>;
  if (!user) return <Navigate to="/auth" />;

  return children;
}

// =====================
// 🧭 App Shell + Navbar
// =====================
function AppShell() {
  const location = useLocation();
  const hideNav =
    location.pathname.startsWith("/book/") ||
    location.pathname === "/auth" ||
    location.pathname === "/signup" ||
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
            <Link to="/" className="hover:text-blue-600">
              Clients
            </Link>
            <Link to="/schedule" className="hover:text-blue-600">
              Schedule
            </Link>
            <Link to="/unpaid" className="hover:text-blue-600">
              Unpaid
            </Link>
            <Link to="/revenue" className="hover:text-blue-600">
              Revenue
            </Link>
            <Link to="/profile" className="hover:text-blue-600">
              Profile
            </Link>
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
        {/* PUBLIC ROUTES */}
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/book/:slug" element={<Book />} />

        {/* PROTECTED ROUTES */}
        <Route
          path="/"
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
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

// =====================
// MAIN APP WRAPPER
// =====================
export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
