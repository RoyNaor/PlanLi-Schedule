export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
}

interface JwtPayload {
  sub?: string;
  user_id?: string;
  email?: string;
  name?: string;
}

function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split(".");

  if (parts.length < 2) {
    throw new Error("Invalid JWT format");
  }

  const base64 = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");

  if (!base64) {
    throw new Error("JWT payload is missing");
  }

  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const decoded = Buffer.from(paddedBase64, "base64").toString("utf8");

  return JSON.parse(decoded) as JwtPayload;
}

export const AuthService = {
  parseBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader) {
      throw new Error("Missing Authorization header");
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new Error("Authorization must use Bearer token");
    }

    return token;
  },

  extractUserFromToken(token: string): AuthenticatedUser {
    const payload = decodeJwtPayload(token);
    const uid = payload.sub ?? payload.user_id;

    if (!uid) {
      throw new Error("Token is missing a user identifier");
    }

    return {
      uid,
      email: payload.email,
      name: payload.name,
    };
  },
};
