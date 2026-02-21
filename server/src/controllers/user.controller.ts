import type { Request, Response } from "express";
import z from "zod";
import { UserService } from "../services/user.service.js";

const syncUserSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").optional(),
  role: z.string().trim().min(1).max(50).optional(),
  phone: z.string().trim().min(3).max(20).optional(),
});

export const userController = {
  async syncAuthenticatedUser(req: Request, res: Response) {
    const parsed = syncUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(parsed.error.format());
    }

    if (!req.authUser?.uid) {
      return res.status(401).json({ error: "Missing authenticated user" });
    }

    if (!req.authUser.email) {
      return res.status(400).json({ error: "Email is missing from token payload" });
    }

    try {
      const user = await UserService.upsertUser({
        id: req.authUser.uid,
        email: req.authUser.email,
        fullName: parsed.data.fullName ?? req.authUser.name ?? req.authUser.email,
        role: parsed.data.role,
        phone: parsed.data.phone,
      });

      return res.status(200).json({ user });
    } catch (error) {
      console.error("Error syncing user:", error);
      return res.status(500).json({ error: "Failed to sync authenticated user" });
    }
  },

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
