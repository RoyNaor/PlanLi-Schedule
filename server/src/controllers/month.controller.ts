import type { Request, Response } from "express";
import { z } from "zod";
import { MonthlyScheduleService } from "../services/monthly-schedule.service.js";
import { UserService } from "../services/user.service.js";
import {
  isIsoDateString,
  isTimeString,
  normalizeTimeToHourMinute,
} from "../utils/schedule-date.utils.js";

const openCollectionSchema = z.object({
  collection_deadline: z.string().trim().min(1),
});

const requirementSchema = z.object({
  worker_type_id: z.string().uuid(),
  count: z.number().int().min(0),
});

const createMonthlyShiftSchema = z.object({
  month_start: z.string().trim().min(1),
  department_id: z.string().uuid(),
  arrangement_id: z.string().uuid().nullable().optional().default(null),
  shift_date: z.string().trim().min(1),
  start_time: z.string().trim().min(1),
  end_time: z.string().trim().min(1),
  label: z.string().trim().min(1).nullable().optional().default(null),
  requirements: z.array(requirementSchema).optional().default([]),
});

const updateMonthlyShiftSchema = createMonthlyShiftSchema.omit({
  month_start: true,
  department_id: true,
});

function parseIsoDateTime(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!/([zZ]|[+-]\d{2}:\d{2})$/.test(value)) return null;
  return parsed;
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

function normalizeMonthlyShiftTimes(input: { start_time: string; end_time: string }) {
  const startTime = normalizeTimeToHourMinute(input.start_time);
  const endTime = normalizeTimeToHourMinute(input.end_time);
  if (!startTime || !endTime || !isTimeString(startTime) || !isTimeString(endTime)) {
    throw new Error("start_time and end_time must use HH:mm or HH:mm:ss format");
  }
  if (startTime === endTime) {
    throw new Error("start_time and end_time cannot be identical");
  }
  return { startTime, endTime };
}

function parseMonthParam(raw: unknown): string {
  const monthStart = typeof raw === "string" ? raw : "";
  if (!monthStart.trim()) throw new Error("monthStart URL parameter is required");
  return monthStart;
}

export const monthController = {
  async listMonths(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const months = await MonthlyScheduleService.listMonths();
      return res.status(200).json({ months });
    } catch (error) {
      console.error("Error listing months:", error);
      return res.status(500).json({ error: "Failed to fetch months" });
    }
  },

  async createMonth(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const monthStart = typeof req.body?.month_start === "string" ? req.body.month_start : "";
      const month = await MonthlyScheduleService.ensureMonth(monthStart);
      return res.status(201).json({ month });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create month";
      console.error("Error creating month:", error);
      return res.status(400).json({ error: message });
    }
  },

  async openCollection(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const monthStart = parseMonthParam(req.params.monthStart);
      const parsed = openCollectionSchema.parse(req.body);
      const deadline = parseIsoDateTime(parsed.collection_deadline);
      if (!deadline) {
        return res.status(400).json({
          error: "collection_deadline must be a valid ISO-8601 datetime with timezone offset",
        });
      }

      const month = await MonthlyScheduleService.openConstraintCollection({
        monthStart,
        collectionDeadline: deadline,
      });
      return res.status(200).json({ month_start: month.monthStart, month });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to open collection";
      console.error("Error opening month collection:", error);
      return res.status(400).json({ error: message });
    }
  },

  async lockMonth(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const month = await MonthlyScheduleService.lockMonth(parseMonthParam(req.params.monthStart));
      return res.status(200).json({ month_start: month.monthStart, month });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to lock month";
      console.error("Error locking month:", error);
      return res.status(400).json({ error: message });
    }
  },

  async queueSolveMonth(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const run = await MonthlyScheduleService.queueMonthSolve({
        monthStart: parseMonthParam(req.params.monthStart),
        triggeredBy: adminCheck.actor.id,
      });
      return res.status(202).json({ queued: true, run });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to queue monthly solver run";
      console.error("Error queueing monthly solve run:", error);
      return res.status(400).json({ error: message });
    }
  },

  async listRunsByMonth(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const monthStart = parseMonthParam(req.params.monthStart);
      const runs = await MonthlyScheduleService.listRunsByMonth(monthStart);
      return res.status(200).json({ month_start: monthStart, runs });
    } catch (error) {
      console.error("Error listing monthly solve runs:", error);
      return res.status(500).json({ error: "Failed to list monthly solve runs" });
    }
  },

  async listVersionsByMonth(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const monthStart = parseMonthParam(req.params.monthStart);
      const versions = await MonthlyScheduleService.listScheduleVersionsByMonth(monthStart);
      return res.status(200).json({ month_start: monthStart, versions });
    } catch (error) {
      console.error("Error listing monthly schedule versions:", error);
      return res.status(500).json({ error: "Failed to list monthly schedule versions" });
    }
  },

  async publishScheduleVersion(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const versionId = typeof req.params.versionId === "string" ? req.params.versionId : "";
      if (!versionId.trim()) {
        return res.status(400).json({ error: "versionId URL parameter is required" });
      }

      const version = await MonthlyScheduleService.publishMonthlyScheduleVersion(versionId);
      return res.status(200).json({ published: true, version });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish monthly schedule version";
      console.error("Error publishing monthly schedule version:", error);
      return res.status(400).json({ error: message });
    }
  },

  async createShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const parsed = createMonthlyShiftSchema.parse(req.body);
      if (!isIsoDateString(parsed.shift_date)) {
        return res.status(400).json({ error: "shift_date must be YYYY-MM-DD" });
      }
      const { startTime, endTime } = normalizeMonthlyShiftTimes(parsed);
      const shift = await MonthlyScheduleService.createShift({
        monthStart: parsed.month_start,
        departmentId: parsed.department_id,
        arrangementId: parsed.arrangement_id,
        shiftDate: parsed.shift_date,
        startTime,
        endTime,
        label: parsed.label,
        requirements: parsed.requirements.map((requirement) => ({
          workerTypeId: requirement.worker_type_id,
          count: requirement.count,
        })),
      });

      return res.status(201).json({ shift, timezone: "Asia/Jerusalem" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to create monthly shift";
      console.error("Error creating monthly shift:", error);
      return res.status(400).json({ error: message });
    }
  },

  async updateShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const shiftId = Number(req.params.shiftId);
      if (!Number.isInteger(shiftId) || shiftId <= 0) {
        return res.status(400).json({ error: "shiftId URL parameter must be a positive integer" });
      }

      const parsed = updateMonthlyShiftSchema.parse(req.body);
      if (!isIsoDateString(parsed.shift_date)) {
        return res.status(400).json({ error: "shift_date must be YYYY-MM-DD" });
      }
      const { startTime, endTime } = normalizeMonthlyShiftTimes(parsed);
      const shift = await MonthlyScheduleService.updateShift({
        shiftId,
        arrangementId: parsed.arrangement_id,
        shiftDate: parsed.shift_date,
        startTime,
        endTime,
        label: parsed.label,
        requirements: parsed.requirements.map((requirement) => ({
          workerTypeId: requirement.worker_type_id,
          count: requirement.count,
        })),
      });

      if (!shift) {
        return res.status(404).json({ error: "Monthly shift not found" });
      }
      return res.status(200).json({ shift });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to update monthly shift";
      console.error("Error updating monthly shift:", error);
      return res.status(400).json({ error: message });
    }
  },

  async deleteShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) return adminCheck.error;

      const shiftId = Number(req.params.shiftId);
      if (!Number.isInteger(shiftId) || shiftId <= 0) {
        return res.status(400).json({ error: "shiftId URL parameter must be a positive integer" });
      }

      const deleted = await MonthlyScheduleService.deleteShift(shiftId);
      if (!deleted) {
        return res.status(404).json({ error: "Monthly shift not found" });
      }
      return res.status(200).json({ deleted: true, shift_id: shiftId });
    } catch (error) {
      console.error("Error deleting monthly shift:", error);
      return res.status(500).json({ error: "Failed to delete monthly shift" });
    }
  },
};
