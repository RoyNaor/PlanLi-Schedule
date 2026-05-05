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
import UserManagementPage from "./pages/UserManagementPage";
import DepartmentManagementPage from "./pages/DepartmentManagementPage";
import ShiftPage from "./pages/ShiftPage";
import MySchedulePage from "./pages/MySchedulePage";
import ScheduleReviewPage from "./pages/ScheduleReviewPage";
import { AuthService } from "./services/auth.service";
import Sidebar from "./components/Sidebar";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(() => AuthService.getSession());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("planli:sidebarCollapsed") === "1",
  );
  const isLoginRoute = location.pathname === "/login";

  useEffect(() => {
    localStorage.setItem("planli:sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    const syncSession = () => setSession(AuthService.getSession());
    window.addEventListener("planli:session-changed", syncSession);
    return () =>
      window.removeEventListener("planli:session-changed", syncSession);
  }, []);

  useEffect(() => {
    const validateExistingSession = async () => {
      const activeSession = AuthService.getSession();
      if (!activeSession) {
        return;
      }

      try {
        await AuthService.getAuthenticatedUser(activeSession.jwtToken);
      } catch {
        await AuthService.clearSession();
        navigate("/login", { replace: true });
      }
    };

    void validateExistingSession();
  }, [navigate]);

  useEffect(() => {
    // כל מעבר עמוד סוגר את הסיידבר במובייל
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleAuthAction = () => {
    if (session) {
      void AuthService.clearSession();
      navigate("/login", { replace: true });
      return;
    }
    navigate("/login");
  };

  const handleNavigate = (path: string) => navigate(path);

  return (
    <div
      className={`app-layout${isLoginRoute ? " is-login" : ""}${
        !isLoginRoute && sidebarCollapsed ? " is-collapsed" : ""
      }`}
    >
      {!isLoginRoute && !sidebarOpen && (
        <button
          type="button"
          className="burger-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="פתח תפריט"
        >
          <Menu size={20} />
        </button>
      )}

      {!isLoginRoute ? (
        <Sidebar
          open={sidebarOpen}
          collapsed={sidebarCollapsed}
          currentPath={location.pathname}
          hasSession={Boolean(session)}
          isAdmin={session?.user.role === "admin"}
          onClose={() => setSidebarOpen(false)}
          onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
          onNavigate={handleNavigate}
          onAuthAction={handleAuthAction}
        />
      ) : null}

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
          <Route
            path="/users"
            element={session ? <UserManagementPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/departments"
            element={session ? <DepartmentManagementPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/shifts"
            element={session ? <ShiftPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/schedule"
            element={session ? <MySchedulePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/review"
            element={
              session ? (
                session.user.role === "admin" ? (
                  <ScheduleReviewPage />
                ) : (
                  <Navigate to="/schedule" replace />
                )
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
