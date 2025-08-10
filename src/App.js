// App.js
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import Clients from "./pages/Clients";
import ClientPets from "./pages/ClientPets";
import PetAppointments from "./pages/PetAppointments";
import Schedule from "./pages/Schedule";
import UnpaidAppointments from "./pages/UnpaidAppointments";
import Book from "./pages/Book";
import Revenue from "./pages/Revenue"; // ⬅️ import the new page

function AppShell() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/book/"); // hide on public booking page

  return (
    <>
      {/* ✅ NAVBAR (hidden on /book/:slug) */}
      {!hideNav && (
        <nav className="bg-white shadow-md px-4 py-2 mb-4">
          <div className="flex gap-4 text-sm font-medium text-gray-700">
            <Link to="/" className="hover:text-blue-600">Clients</Link>
            <Link to="/schedule" className="hover:text-blue-600">Schedule</Link>
            <Link to="/unpaid" className="hover:text-blue-600">Unpaid</Link>
            <Link to="/revenue" className="hover:text-blue-600">Revenue</Link> {/* ⬅️ new link */}
          </div>
        </nav>
      )}

      <Routes>
        <Route path="/" element={<Clients />} />
        <Route path="/clients/:clientId" element={<ClientPets />} />
        <Route path="/pets/:petId/appointments" element={<PetAppointments />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/unpaid" element={<UnpaidAppointments />} />
        <Route path="/revenue" element={<Revenue />} /> {/* ⬅️ new route */}
        <Route path="/appointments/:petId" element={<PetAppointments />} />
        <Route path="/book/:slug" element={<Book />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
