import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Lock, Mail } from "lucide-react";
import { auth } from "../firebase";
import { AuthService } from "../services/auth.service";
import logo from "../assets/Logo.png";
import { LoadingSpinner } from "../components/ui/LoadingIndicator";

// Handles sign-in with Firebase and then syncs the authenticated user with backend.
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (AuthService.getSession()) {
      navigate("/chat", { replace: true });
    }
  }, [navigate]);

  // Submits credentials, stores the session, and redirects to the chat page.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSubmitting(true);
      setError("");

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const token = await credential.user.getIdToken();

      await AuthService.validateUserFromToken(token);

      navigate("/chat", { replace: true });
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        "ההתחברות נכשלה. נא לבדוק את פרטי ההתחברות.";
      setError(message);
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md text-right"
    >
      <div className="text-center mb-0">
        <img
          src={logo}
          alt="PlanLi Logo"
          width={400}
          height={200}
          className="mx-auto mt-2"
          draggable={false}
        />
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            אימייל
          </label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1d5c8b]"
              placeholder="admin@planli.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            סיסמה
          </label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1d5c8b]"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#1d5c8b] text-white py-2 rounded-xl font-medium hover:bg-[#164e78] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              מתחבר...
            </>
          ) : (
            "התחברות"
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-slate-400">
        להרשמה למערכת יש לפנות למנהל המערכת לקבלת גישה.
      </div>
    </div>
  );
}
