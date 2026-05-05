import type { Request, Response } from "express";
import { SeniorityService } from "../services/seniority.service.js";
import { UserService } from "../services/user.service.js";

async function requireAdmin(req: Request, res: Response) {
  if (!req.authUser?.uid) {
    return { error: res.status(401).json({ error: "Missing authenticated user" }) };
  }

  const actor = await UserService.getUserById(req.authUser.uid);

  if (!actor) {
    return { error: res.status(404).json({ error: "Authenticated user not found" }) };
  }

  if (actor.role !== "admin") {
    return { error: res.status(403).json({ error: "Admin access required" }) };
  }

  return { actor };
}

export const seniorityController = {
  async listSeniorities(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const seniorities = await SeniorityService.listSeniorities();
      return res.status(200).json({ seniorities });
    } catch (error) {
      console.error("Error listing seniorities:", error);
      return res.status(500).json({ error: "Failed to fetch seniorities" });
    }
  },
};
