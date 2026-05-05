type GoogleEventDateTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

export interface GoogleCalendarEvent {
  id: string;
  etag?: string;
  summary?: string;
  status?: string;
  updated?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

interface GoogleWatchResponse {
  id: string;
  resourceId: string;
  expiration?: string;
}

const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

async function withGoogleRetry<T>(work: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await work();
    } catch (error) {
      lastError = error;
      const status =
        error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : null;
      if (!status || !RETRYABLE_STATUS.has(status) || attempt >= maxAttempts) {
        break;
      }
      const delayMs = Math.min(2 ** (attempt - 1) * 300, 5_000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function ensureGoogleOk(response: Response, textBody: string): void {
  if (response.ok) return;
  const error = new Error(`Google Calendar API error (${response.status}): ${textBody || "unknown"}`);
  Object.assign(error, { statusCode: response.status });
  throw error;
}

async function requestGoogle<T>(input: {
  accessToken: string;
  method: string;
  url: string;
  body?: Record<string, unknown>;
}): Promise<T> {
  return withGoogleRetry(async () => {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    const text = await response.text();
    ensureGoogleOk(response, text);

    if (!text.trim()) {
      return {} as T;
    }
    return JSON.parse(text) as T;
  });
}

export const GoogleCalendarClient = {
  async refreshAccessToken(input: { refreshToken: string }): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const body = new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ?? "",
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const text = await response.text();
    ensureGoogleOk(response, text);

    const payload = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!payload.access_token || !payload.expires_in) {
      throw new Error("Invalid access token refresh payload");
    }

    return {
      accessToken: payload.access_token,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    };
  },

  async watchPrimaryCalendar(input: {
    accessToken: string;
    webhookAddress: string;
    channelId: string;
  }): Promise<GoogleWatchResponse> {
    const result = await requestGoogle<{
      id: string;
      resourceId: string;
      expiration?: string;
    }>({
      accessToken: input.accessToken,
      method: "POST",
      url: "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
      body: {
        id: input.channelId,
        type: "web_hook",
        address: input.webhookAddress,
      },
    });

    return {
      id: result.id,
      resourceId: result.resourceId,
      expiration: result.expiration,
    };
  },

  async stopChannel(input: {
    accessToken: string;
    channelId: string;
    resourceId: string;
  }): Promise<void> {
    await requestGoogle({
      accessToken: input.accessToken,
      method: "POST",
      url: "https://www.googleapis.com/calendar/v3/channels/stop",
      body: {
        id: input.channelId,
        resourceId: input.resourceId,
      },
    });
  },

  async insertEvent(input: {
    accessToken: string;
    event: Record<string, unknown>;
  }): Promise<GoogleCalendarEvent> {
    return requestGoogle<GoogleCalendarEvent>({
      accessToken: input.accessToken,
      method: "POST",
      url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      body: input.event,
    });
  },

  async patchEvent(input: {
    accessToken: string;
    eventId: string;
    event: Record<string, unknown>;
  }): Promise<GoogleCalendarEvent> {
    return requestGoogle<GoogleCalendarEvent>({
      accessToken: input.accessToken,
      method: "PATCH",
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
      body: input.event,
    });
  },

  async deleteEvent(input: {
    accessToken: string;
    eventId: string;
  }): Promise<void> {
    await requestGoogle({
      accessToken: input.accessToken,
      method: "DELETE",
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
    });
  },

  async listEventsIncremental(input: {
    accessToken: string;
    syncToken: string | null;
  }): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
    let pageToken: string | null = null;
    let nextSyncToken: string | null = null;
    const events: GoogleCalendarEvent[] = [];

    do {
      const query = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "true",
      });

      if (input.syncToken) {
        query.set("syncToken", input.syncToken);
      } else {
        query.set("timeMin", new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString());
      }

      if (pageToken) {
        query.set("pageToken", pageToken);
      }

      const data = await requestGoogle<{
        items?: GoogleCalendarEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>({
        accessToken: input.accessToken,
        method: "GET",
        url: `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`,
      });

      events.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? null;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    return {
      events,
      nextSyncToken,
    };
  },
};
