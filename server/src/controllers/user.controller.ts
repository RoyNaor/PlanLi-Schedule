import type { Request, Response } from "express";
import { UserService } from "../services/user.service.js";

interface CreateUserRequest {
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  phone?: string | null;
}

const ALLOWED_ROLES = new Set(["admin", "doctor", "nurse"]);

async function createFirebaseAuthUser(email: string, password: string) {
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error("FIREBASE_API_KEY is not configured on the server");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: false,
      }),
    },
  );

  const data = (await response.json()) as { localId?: string; error?: { message?: string } };

  if (!response.ok || !data.localId) {
    const firebaseMessage = data.error?.message ?? "Unknown Firebase error";
    throw new Error(`Failed to create Firebase user: ${firebaseMessage}`);
  }

  return data.localId;
}

export const userController = {
  // Ensures the authenticated token maps to a provisioned user in the app DB.
  async syncAuthenticatedUser(req: Request, res: Response) {
    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    if (!req.authUser.email) {
      return res.status(400).json({ error: "Email is missing from token payload" });
    }

    try {
      // Prefer direct id lookup but allow email fallback for migrated accounts.
      const user = await UserService.getUserByIdOrEmail(
        req.authUser.uid,
        req.authUser.email,
      );

      if (!user) {
        return res.status(403).json({
          error: "This account is not provisioned yet. Please contact an administrator.",
        });
      }

      return res.status(200).json({ user });
    } catch (error) {
      console.error("Error validating user session:", error);
      return res.status(500).json({ error: "Failed to validate authenticated user" });
    }
  },

  // Returns the currently authenticated user's profile record.
  async getAuthenticatedUser(req: Request, res: Response) {
    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    try {
      const user = await UserService.getUserById(req.authUser.uid);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({ user });
    } catch (error) {
      console.error("Error getting user:", error);
      return res.status(500).json({ error: "Failed to fetch authenticated user" });
    }
  },

  // Lists users for management; only admins are authorized.
  async listUsers(req: Request, res: Response) {
    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    try {
      const requester = await UserService.getUserById(req.authUser.uid);

      if (!requester || requester.role !== "admin") {
        return res.status(403).json({ error: "Only admins can access user management" });
      }

      const users = await UserService.listUsers();
      return res.status(200).json(users);
    } catch (error) {
      console.error("Error listing users:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  },

  // Creates a new auth user in Firebase and then persists them in the app DB.
  async createUser(req: Request<unknown, unknown, CreateUserRequest>, res: Response) {
    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    try {
      const requester = await UserService.getUserById(req.authUser.uid);

      if (!requester || requester.role !== "admin") {
        return res.status(403).json({ error: "Only admins can create users" });
      }

      const email = req.body.email?.trim().toLowerCase();
      const password = req.body.password?.trim();
      const fullName = req.body.full_name?.trim();
      const role = req.body.role?.trim().toLowerCase();
      const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : null;

      if (!email || !password || !fullName || !role) {
        return res.status(400).json({ error: "email, password, full_name, and role are required" });
      }

      if (!ALLOWED_ROLES.has(role)) {
        return res.status(400).json({ error: "Invalid role. Allowed roles: admin, doctor, nurse" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const firebaseUid = await createFirebaseAuthUser(email, password);
      const createdUser = await UserService.createUser({
        id: firebaseUid,
        email,
        fullName,
        role,
        phone: phone ? phone : null,
      });

      return res.status(201).json(createdUser);
    } catch (error) {
      console.error("Error creating user:", error);
      const message = error instanceof Error ? error.message : "Failed to create user";

      if (message.includes("duplicate key value") || message.includes("already exists")) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }

      return res.status(500).json({ error: message });
    }
  },
};
