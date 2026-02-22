import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Menu } from "lucide-react";
import "./App.css";
import { ChatBot } from "./components/ChatBot";
import LoginPage from "./pages/LoginPage";
import { AuthService } from "./services/auth.service";
import Sidebar from "./components/Sidebar";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(() => AuthService.getSession());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const syncSession = () => setSession(AuthService.getSession());
    window.addEventListener("planli:session-changed", syncSession);
    return () =>
      window.removeEventListener("planli:session-changed", syncSession);
  }, []);

  useEffect(() => {
    // כל מעבר עמוד סוגר את הסיידבר במובייל
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleAuthAction = () => {
    if (session) {
      AuthService.clearSession();
      navigate("/login", { replace: true });
      return;
    }
    navigate("/login");
  };

  const handleNavigate = (path: string) => navigate(path);

  return (
    <div className="app-layout">
      {/* ✅ המבורגר מוצג רק כשהסיידבר סגור */}
      {!sidebarOpen && (
        <button
          type="button"
          className="burger-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="פתח תפריט"
        >
          <Menu size={20} />
        </button>
      )}

      <Sidebar
        open={sidebarOpen}
        currentPath={location.pathname}
        hasSession={Boolean(session)}
        onClose={() => setSidebarOpen(false)}
        onNavigate={handleNavigate}
        onAuthAction={handleAuthAction}
      />

      <main className="app-content">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={session ? "/chat" : "/login"} replace />}
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/chat"
            element={session ? <ChatBot /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
