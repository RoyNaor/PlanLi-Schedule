import axios from "axios";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  departments: Array<{
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  }>;
  seniority: {
    id: string;
    name: string;
    code: string;
    sortOrder: number;
    isActive: boolean;
  } | null;
}

interface StoredSession {
  jwtToken: string;
  user: SessionUser;
}

interface ValidateUserResponse {
  user: SessionUser;
}

interface MeResponse {
  user: SessionUser;
}

const API_BASE = "http://localhost:3000/api";
const SESSION_KEY = "planli.session";

export const AuthService = {
  // Persists the auth token + user profile and notifies listeners about changes.
  saveSession(session: StoredSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event("planli:session-changed"));
  },

  // Reads the current session from storage and clears it if JSON is invalid.
  getSession(): StoredSession | null {
    const raw = sessionStorage.getItem(SESSION_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event("planli:session-changed"));
      return null;
    }
  },

  // Removes stored session data and emits a global session-changed event.
  async clearSession() {
    try {
      await signOut(auth);
    } catch {
      // Ignore provider sign-out failures and still clear local session data.
    }

    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("planli:session-changed"));
  },

  // Validates a Firebase token with the backend and stores the returned app user.
  async validateUserFromToken(token: string): Promise<StoredSession> {
    const response = await axios.post<ValidateUserResponse>(
      `${API_BASE}/users/sync`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const session = {
      jwtToken: token,
      user: response.data.user,
    };

    this.saveSession(session);
    return session;
  },

  // Fetches the latest profile for the authenticated user from the API.
  async getAuthenticatedUser(token: string): Promise<SessionUser> {
    const response = await axios.get<MeResponse>(`${API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data.user;
  },
};
