import type { Request, Response } from "express";
import { UserService } from "../services/user.service.js";

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
};
