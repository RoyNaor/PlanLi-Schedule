import type { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/user.service.js";
import { FirebaseAdminService } from "../services/firebase-admin.service.js";
import { DepartmentService } from "../services/department.service.js";
import { SeniorityService } from "../services/seniority.service.js";
import { userRoleValues } from "../utils/staffing.utils.js";

const departmentIdsSchema = z.array(z.string().uuid()).optional().default([]);
const seniorityIdSchema = z.string().uuid().nullable().optional().default(null);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  role: z.enum(userRoleValues),
  phone: z.string().trim().min(1).nullable().optional(),
  department_ids: departmentIdsSchema,
  seniority_id: seniorityIdSchema,
});

const updateUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(userRoleValues),
  phone: z.string().trim().min(1).nullable().optional(),
  department_ids: departmentIdsSchema,
  seniority_id: seniorityIdSchema,
});

function normalizeDepartmentIds(departmentIds: string[]): string[] {
  return Array.from(new Set(departmentIds.map((id) => id.trim()).filter(Boolean)));
}

async function validateDepartmentMembership(
  role: string,
  departmentIds: string[],
): Promise<string | null> {
  if (role !== "admin" && departmentIds.length === 0) {
    return "Staff users must be assigned to at least one department";
  }

  const existingCount = await DepartmentService.countExistingDepartments(departmentIds);
  if (existingCount !== departmentIds.length) {
    return "One or more departments do not exist";
  }

  return null;
}

async function validateSeniority(role: string, seniorityId: string | null): Promise<string | null> {
  if (role === "admin") return null;

  if (!seniorityId) {
    return "Staff users must have a seniority";
  }

  const existingCount = await SeniorityService.countExistingSeniorities([seniorityId]);
  if (existingCount !== 1) {
    return "Seniority does not exist";
  }

  return null;
}

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

  // Returns all users for the admin user-management page.
  async listUsers(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);

      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const users = await UserService.listUsers();
      return res.status(200).json(users);
    } catch (error) {
      console.error("Error listing users:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  },

  // Creates a Firebase-authenticated user and persists their profile in DB.
  async createUser(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);

      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const parsed = createUserSchema.parse(req.body);
      const departmentIds = normalizeDepartmentIds(parsed.department_ids);
      const departmentError = await validateDepartmentMembership(parsed.role, departmentIds);
      if (departmentError) {
        return res.status(400).json({ error: departmentError });
      }

      const seniorityId = parsed.role === "admin" ? null : parsed.seniority_id;
      const seniorityError = await validateSeniority(parsed.role, seniorityId);
      if (seniorityError) {
        return res.status(400).json({ error: seniorityError });
      }

      const firebaseUid = await FirebaseAdminService.createUser(
        parsed.email.trim(),
        parsed.password,
      );

      const createdUser = await UserService.createUser({
        id: firebaseUid,
        email: parsed.email.trim(),
        fullName: parsed.full_name.trim(),
        role: parsed.role,
        phone: parsed.phone ?? null,
        departmentIds,
        seniorityId,
      });

      return res.status(201).json(createdUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to create user";
      console.error("Error creating user:", error);
      return res.status(400).json({ error: message });
    }
  },

  // Updates an existing provisioned user profile in DB.
  async updateUser(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);

      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const { userId: rawUserId } = req.params;
      const userId = typeof rawUserId === "string" ? rawUserId : undefined;

      if (!userId) {
        return res.status(400).json({ error: "Missing user id" });
      }

      const parsed = updateUserSchema.parse(req.body);
      const departmentIds = normalizeDepartmentIds(parsed.department_ids);
      const departmentError = await validateDepartmentMembership(parsed.role, departmentIds);
      if (departmentError) {
        return res.status(400).json({ error: departmentError });
      }

      const seniorityId = parsed.role === "admin" ? null : parsed.seniority_id;
      const seniorityError = await validateSeniority(parsed.role, seniorityId);
      if (seniorityError) {
        return res.status(400).json({ error: seniorityError });
      }

      const updatedUser = await UserService.updateUser({
        id: userId,
        email: parsed.email.trim(),
        fullName: parsed.full_name.trim(),
        role: parsed.role,
        phone: parsed.phone ?? null,
        departmentIds,
        seniorityId,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to update user";
      console.error("Error updating user:", error);
      return res.status(400).json({ error: message });
    }
  },

  // Deletes a user profile.
  async deleteUser(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);

      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const { userId: rawUserId } = req.params;
      const userId = typeof rawUserId === "string" ? rawUserId : undefined;

      if (!userId) {
        return res.status(400).json({ error: "Missing user id" });
      }

      if (req.authUser?.uid === userId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }

      const deleted = await UserService.deleteUser(userId);

      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }
  },
};
