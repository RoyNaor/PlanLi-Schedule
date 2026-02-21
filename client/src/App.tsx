import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { ChatBot } from "./components/ChatBot";
import LoginPage from "./pages/LoginPage";
import { AuthService } from "./services/auth.service";

function App() {
  const session = AuthService.getSession();

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
