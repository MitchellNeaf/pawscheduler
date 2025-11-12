// App.js
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

import Signup from "./pages/Signup";
import AuthPage from "./pages/AuthPage";
import Clients from "./pages/Clients";
import ClientPets from "./pages/ClientPets";
import PetAppointments from "./pages/PetAppointments";
import Schedule from "./pages/Schedule";
import UnpaidAppointments from "./pages/UnpaidAppointments";
import Book from "./pages/Book";
import Revenue from "./pages/Revenue";

// ✅ Protect private routes
function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user || null)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <p className="text-center mt-10">Loading...</p>;
  if (!user) return <Navigate to="/auth" />;

  return children;
}

function AppShell() {
  const location = useLocation();
  const hideNav =
    location.pathname.startsWith("/book/") ||
    location.pathname === "/auth" ||
    location.pathname === "/signup";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <>
      {/* ✅ NAVBAR (hidden on /book/:slug, /auth, /signup) */}
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
        {/* Public routes */}
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/book/:slug" element={<Book />} />

        {/* 🔒 Protected routes */}
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
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
