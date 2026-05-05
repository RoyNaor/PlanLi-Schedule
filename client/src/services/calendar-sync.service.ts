import axios from "axios";

const API_BASE = "http://localhost:3000/api";

export interface CalendarStatus {
  connected: boolean;
  channelExpiration: string | null;
  lastSyncAt: string | null;
  webcalUrl: string | null;
}

export function buildCalendarFeedUrl(baseUrl: string, token: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/api/calendar/feed/${token}.ics`;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const CalendarSyncService = {
  async getStatus(token: string): Promise<CalendarStatus> {
    const { data } = await axios.get<CalendarStatus>(`${API_BASE}/calendar/status`, {
      headers: authHeaders(token),
    });
    return data;
  },

  async getConnectUrl(token: string): Promise<string> {
    const { data } = await axios.post<{ auth_url: string }>(
      `${API_BASE}/calendar/google/connect`,
      {},
      {
        headers: authHeaders(token),
      },
    );
    return data.auth_url;
  },

  async syncOutbound(token: string, weekStart: string): Promise<void> {
    await axios.post(
      `${API_BASE}/calendar/sync/outbound`,
      { week_start: weekStart },
      { headers: authHeaders(token) },
    );
  },

  async rotateFeedToken(token: string): Promise<{ webcal_url: string }> {
    const { data } = await axios.post<{ token_rotated: boolean; webcal_url: string }>(
      `${API_BASE}/calendar/feed/rotate`,
      {},
      {
        headers: authHeaders(token),
      },
    );
    return { webcal_url: data.webcal_url };
  },

  async disconnect(token: string): Promise<void> {
    await axios.post(
      `${API_BASE}/calendar/disconnect`,
      {},
      {
        headers: authHeaders(token),
      },
    );
  },
};
