import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { ChatBot } from "./components/ChatBot";
import LoginPage from "./pages/LoginPage";
import { AuthService } from "./services/auth.service";

// Controls route-level access by reading and reacting to auth session changes.
function App() {
  const [session, setSession] = useState(() => AuthService.getSession());

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

  return (
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
  );
}

export default App;
