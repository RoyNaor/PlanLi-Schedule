import { createHmac, randomUUID } from "node:crypto";

interface OAuthStatePayload {
  uid: string;
  nonce: string;
  exp: number;
}

interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function encodeStatePayload(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeStatePayload(encoded: string): OAuthStatePayload {
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!parsed.uid || !parsed.nonce || !Number.isFinite(parsed.exp)) {
    throw new Error("Invalid OAuth state payload");
  }
  return parsed;
}

function signState(encodedPayload: string): string {
  const stateSecret = requireEnv("GOOGLE_CALENDAR_STATE_SECRET");
  return createHmac("sha256", stateSecret).update(encodedPayload).digest("base64url");
}

export const GoogleOAuthService = {
  getRedirectUri(): string {
    return requireEnv("GOOGLE_CALENDAR_REDIRECT_URI");
  },

  createOAuthState(userId: string): string {
    const now = Date.now();
    const payload: OAuthStatePayload = {
      uid: userId,
      nonce: randomUUID(),
      exp: now + 10 * 60 * 1000,
    };
    const encodedPayload = encodeStatePayload(payload);
    const signature = signState(encodedPayload);
    return `${encodedPayload}.${signature}`;
  },

  verifyOAuthState(state: string): { userId: string } {
    const [encodedPayload, receivedSignature] = state.split(".");
    if (!encodedPayload || !receivedSignature) {
      throw new Error("Missing OAuth state");
    }

    const expectedSignature = signState(encodedPayload);
    if (expectedSignature !== receivedSignature) {
      throw new Error("OAuth state signature mismatch");
    }

    const payload = decodeStatePayload(encodedPayload);
    if (Date.now() > payload.exp) {
      throw new Error("OAuth state expired");
    }

    return { userId: payload.uid };
  },

  buildAuthorizationUrl(input: { userId: string }): string {
    const clientId = requireEnv("GOOGLE_CALENDAR_CLIENT_ID");
    const redirectUri = this.getRedirectUri();
    const state = this.createOAuthState(input.userId);
    const scope = "https://www.googleapis.com/auth/calendar";

    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
  },

  async exchangeCodeForTokens(input: {
    code: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date;
  }> {
    const body = new URLSearchParams({
      code: input.code,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: this.getRedirectUri(),
      grant_type: "authorization_code",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OAuth token exchange failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as GoogleOAuthTokenResponse;
    if (!payload.access_token || !payload.expires_in) {
      throw new Error("OAuth token exchange returned invalid payload");
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    };
  },
};
