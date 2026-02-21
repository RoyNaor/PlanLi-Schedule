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

interface ValidateUserResponse {
  user: SessionUser;
}

interface MeResponse {
  user: SessionUser;
}

const API_BASE = "http://localhost:3000/api";
const SESSION_KEY = "planli.session";

export const AuthService = {
  saveSession(session: StoredSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event("planli:session-changed"));
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
      window.dispatchEvent(new Event("planli:session-changed"));
      return null;
    }
  },

  clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("planli:session-changed"));
  },

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

  async getAuthenticatedUser(token: string): Promise<SessionUser> {
    const response = await axios.get<MeResponse>(`${API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data.user;
  },
};
