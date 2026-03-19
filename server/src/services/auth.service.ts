import fs from "node:fs";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
}

interface FirebaseServiceAccountInput {
  project_id?: string;
  private_key?: string;
  client_email?: string;
}

function getFirebaseServiceAccountFromEnv(): FirebaseServiceAccountInput | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as FirebaseServiceAccountInput;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
}

function getFirebaseServiceAccountFromPath(): FirebaseServiceAccountInput | null {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!filePath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as FirebaseServiceAccountInput;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Failed to read FIREBASE_SERVICE_ACCOUNT_PATH: ${message}`);
  }
}

function getFirebaseAuthClient() {
  if (getApps().length > 0) {
    return getAuth();
  }

  const serviceAccount = getFirebaseServiceAccountFromEnv() ?? getFirebaseServiceAccountFromPath();
  const configuredProjectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.FIREBASE_AUTH_DOMAIN?.replace(/\.firebaseapp\.com$/, "");

  if (serviceAccount?.private_key && serviceAccount.client_email) {
    initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id ?? configuredProjectId,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
      }),
      projectId: configuredProjectId ?? serviceAccount.project_id,
    });
    return getAuth();
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({
      credential: applicationDefault(),
      projectId: configuredProjectId,
    });
    return getAuth();
  }

  if (configuredProjectId) {
    initializeApp({
      projectId: configuredProjectId,
    });
    return getAuth();
  }

  throw new Error(
    "Firebase Admin configuration is missing. Set FIREBASE_PROJECT_ID and optionally FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT_PATH.",
  );
}

export const AuthService = {
  // Pulls the token value out of a standard "Bearer <token>" auth header.
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

  // Verifies Firebase ID token signature/claims and returns normalized user identity.
  async extractUserFromToken(token: string): Promise<AuthenticatedUser> {
    try {
      const decoded = await getFirebaseAuthClient().verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown token verification failure";
      throw new Error(`Invalid or expired Firebase token: ${details}`);
    }
  },
};
