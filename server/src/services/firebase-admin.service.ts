interface FirebaseCreateUserResponse {
  localId: string;
  email: string;
}

interface FirebaseErrorResponse {
  error?: {
    message?: string;
  };
}

const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp";

export const FirebaseAdminService = {
  // Creates a Firebase Auth user with email/password and returns generated UID.
  async createUser(email: string, password: string): Promise<string> {
    const apiKey = process.env.FIREBASE_API_KEY;

    if (!apiKey) {
      throw new Error("FIREBASE_API_KEY is not configured on the server");
    }

    const response = await fetch(`${IDENTITY_TOOLKIT_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: false,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as FirebaseErrorResponse;
      const message = payload.error?.message ?? "Failed to create Firebase user";
      throw new Error(message);
    }

    const payload = (await response.json()) as FirebaseCreateUserResponse;

    if (!payload.localId) {
      throw new Error("Firebase did not return a user id");
    }

    return payload.localId;
  },
};
