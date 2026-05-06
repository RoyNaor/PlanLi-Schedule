import type { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/user.service.js";
import { WorkerTypeService } from "../services/worker-type.service.js";

const workerTypeCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_-]+$/i, "code can contain letters, numbers, underscores, and dashes");

const createWorkerTypeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: workerTypeCodeSchema.optional(),
  is_active: z.boolean().optional().default(true),
});

const updateWorkerTypeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: workerTypeCodeSchema,
  is_active: z.boolean().optional().default(true),
});

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

export const workerTypeController = {
  async listWorkerTypes(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const includeInactive = req.query.include_inactive === "true";
      const workerTypes = await WorkerTypeService.listWorkerTypes(includeInactive);
      return res.status(200).json({ worker_types: workerTypes });
    } catch (error) {
      console.error("Error listing worker types:", error);
      return res.status(500).json({ error: "Failed to fetch worker types" });
    }
  },

  async createWorkerType(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const parsed = createWorkerTypeSchema.parse(req.body);
      const workerType = await WorkerTypeService.upsertWorkerType({
        name: parsed.name,
        code: parsed.code?.toLowerCase(),
        source: "manual",
        isActive: parsed.is_active,
      });

      return res.status(201).json({ worker_type: workerType });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to create worker type";
      console.error("Error creating worker type:", error);
      return res.status(400).json({ error: message });
    }
  },

  async updateWorkerType(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const workerTypeId = typeof req.params.workerTypeId === "string" ? req.params.workerTypeId : "";
      if (!workerTypeId.trim()) {
        return res.status(400).json({ error: "workerTypeId URL parameter is required" });
      }

      const parsed = updateWorkerTypeSchema.parse(req.body);
      const workerType = await WorkerTypeService.updateWorkerType({
        id: workerTypeId,
        name: parsed.name,
        code: parsed.code.toLowerCase(),
        isActive: parsed.is_active,
      });

      if (!workerType) {
        return res.status(404).json({ error: "Worker type not found" });
      }

      return res.status(200).json({ worker_type: workerType });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to update worker type";
      console.error("Error updating worker type:", error);
      return res.status(400).json({ error: message });
    }
  },
};
