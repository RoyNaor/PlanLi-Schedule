import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { LogIn, LogOut, Menu, MessageCircle, X } from "lucide-react";
import "./App.css";
import { ChatBot } from "./components/ChatBot";
import LoginPage from "./pages/LoginPage";
import { AuthService } from "./services/auth.service";

// Controls route-level access by reading and reacting to auth session changes.
function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(() => AuthService.getSession());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Keep React state synced with sessionStorage updates from auth flows.
    const syncSession = () => {
      setSession(AuthService.getSession());
    };

    window.addEventListener("planli:session-changed", syncSession);
    return () => {
      window.removeEventListener("planli:session-changed", syncSession);
    };
  }, []);

  useEffect(() => {
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

  return (
    <div className="app-layout">
      <button
        type="button"
        className="burger-toggle"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`app-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">PlanLI</div>

        <button
          type="button"
          className={`sidebar-link ${location.pathname === "/chat" ? "is-active" : ""}`}
          onClick={() => navigate("/chat")}
        >
          <MessageCircle size={18} />
          <span>צ'אט</span>
        </button>

        <button type="button" className="sidebar-auth" onClick={handleAuthAction}>
          {session ? <LogOut size={18} /> : <LogIn size={18} />}
          <span>{session ? "התנתק" : "התחבר"}</span>
        </button>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      ) : null}

      <div className="app-content">
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
      </div>
    </div>
  );
}

export default App;
