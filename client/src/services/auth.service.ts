import axios from "axios";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
}

interface StoredSession {
  jwtToken: string;
  user: SessionUser;
}

interface SyncUserResponse {
  user: SessionUser;
}

const API_BASE = "http://localhost:3000/api";
const SESSION_KEY = "planli.session";

export const AuthService = {
  saveSession(session: StoredSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },

  getSession(): StoredSession | null {
    const raw = sessionStorage.getItem(SESSION_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  },

  async syncUserFromToken(token: string, fullName?: string): Promise<StoredSession> {
    const response = await axios.post<SyncUserResponse>(
      `${API_BASE}/users/sync`,
      { fullName },
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
};
