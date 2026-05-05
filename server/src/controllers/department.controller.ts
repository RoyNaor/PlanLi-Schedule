import type { Request, Response } from "express";
import { z } from "zod";
import { DepartmentService } from "../services/department.service.js";
import { UserService } from "../services/user.service.js";

const departmentCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_-]+$/i, "code can contain letters, numbers, underscores, and dashes");

const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: departmentCodeSchema,
});

const updateDepartmentSchema = createDepartmentSchema.extend({
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

export const departmentController = {
  async listDepartments(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const departments = await DepartmentService.listDepartments();
      return res.status(200).json({ departments });
    } catch (error) {
      console.error("Error listing departments:", error);
      return res.status(500).json({ error: "Failed to fetch departments" });
    }
  },

  async createDepartment(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const parsed = createDepartmentSchema.parse(req.body);
      const code = parsed.code.toLowerCase();
      const existing = await DepartmentService.getDepartmentByCode(code);
      if (existing) {
        return res.status(409).json({ error: "Department code already exists" });
      }

      const department = await DepartmentService.createDepartment({
        name: parsed.name,
        code,
      });

      return res.status(201).json({ department });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to create department";
      console.error("Error creating department:", error);
      return res.status(400).json({ error: message });
    }
  },

  async updateDepartment(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const departmentId = typeof req.params.departmentId === "string" ? req.params.departmentId : "";
      if (!departmentId.trim()) {
        return res.status(400).json({ error: "departmentId URL parameter is required" });
      }

      const parsed = updateDepartmentSchema.parse(req.body);
      const existingDepartment = await DepartmentService.getDepartmentById(departmentId);
      if (!existingDepartment) {
        return res.status(404).json({ error: "Department not found" });
      }

      const code = parsed.code.toLowerCase();
      const existingCode = await DepartmentService.getDepartmentByCode(code);
      if (existingCode && existingCode.id !== departmentId) {
        return res.status(409).json({ error: "Department code already exists" });
      }

      if (
        existingDepartment.code === "default" &&
        !parsed.is_active &&
        existingDepartment.usersCount > 0
      ) {
        return res.status(400).json({
          error: "Cannot deactivate the default department while users are assigned to it",
        });
      }

      const department = await DepartmentService.updateDepartment({
        id: departmentId,
        name: parsed.name,
        code,
        isActive: parsed.is_active,
      });

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      return res.status(200).json({ department });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to update department";
      console.error("Error updating department:", error);
      return res.status(400).json({ error: message });
    }
  },
};
