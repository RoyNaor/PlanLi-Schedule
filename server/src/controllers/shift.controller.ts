import type { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/user.service.js";
import { ShiftService } from "../services/shift.service.js";
import {
  getJerusalemTodayIsoDate,
  isDateInsideWeek,
  isIsoDateString,
  isTimeString,
  normalizeTimeToHourMinute,
} from "../utils/schedule-date.utils.js";

const createShiftSchema = z.object({
  week_start: z.string(),
  shift_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  min_doctors: z.number().int().min(0).optional().default(0),
  min_nurses: z.number().int().min(0).optional().default(0),
  min_midwives: z.number().int().min(0).optional().default(0),
  min_obgyns: z.number().int().min(0).optional().default(0),
  min_anesthesiologists: z.number().int().min(0).optional().default(0),
  min_orderlies: z.number().int().min(0).optional().default(0),
  min_pediatricians: z.number().int().min(0).optional().default(0),
  min_shabbat_scribes: z.number().int().min(0).optional().default(0),
  min_secretaries: z.number().int().min(0).optional().default(0),
});

const updateShiftSchema = createShiftSchema.omit({ week_start: true });
const duplicateWeekSchema = z.object({
  source_week_start: z.string(),
  target_week_start: z.string(),
});
const openCollectionSchema = z.object({
  collection_deadline: z.string().trim().min(1),
});

function parseIsoDateTime(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // Require explicit timezone offset or UTC marker for deterministic behavior.
  if (!/([zZ]|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }

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

function validateShiftPayload(payload: z.infer<typeof createShiftSchema>) {
  if (!isIsoDateString(payload.week_start) || !isIsoDateString(payload.shift_date)) {
    throw new Error("week_start and shift_date must be valid ISO dates (YYYY-MM-DD)");
  }

  if (!isTimeString(payload.start_time) || !isTimeString(payload.end_time)) {
    throw new Error("start_time and end_time must use HH:mm or HH:mm:ss format");
  }

  // Allow overnight shifts (e.g. 22:00 → 06:00 next day).
  // start_time === end_time is still invalid (zero-duration shift).
  if (payload.start_time === payload.end_time) {
    throw new Error("start_time and end_time cannot be identical");
  }

  if (!isDateInsideWeek(payload.week_start, payload.shift_date)) {
    throw new Error("shift_date must be inside the provided week_start window");
  }
}

export const shiftController = {
  async listWeeks(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const weeks = await ShiftService.listWeeks();
      return res.status(200).json({ weeks });
    } catch (error) {
      console.error("Error listing weeks:", error);
      return res.status(500).json({ error: "Failed to fetch weeks" });
    }
  },

  async createWeek(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const weekStart = typeof req.body?.week_start === "string" ? req.body.week_start : "";
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "week_start must be YYYY-MM-DD" });
      }

      const created = await ShiftService.ensureWeek(weekStart);
      return res.status(201).json({
        week: {
          weekStart: created.week_start,
          createdAt: created.created_at.toISOString(),
          status: created.status,
          collectionOpenAt: created.collection_open_at
            ? created.collection_open_at.toISOString()
            : null,
          collectionDeadline: created.collection_deadline
            ? created.collection_deadline.toISOString()
            : null,
          lockedAt: created.locked_at ? created.locked_at.toISOString() : null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create week";
      console.error("Error creating week:", error);
      return res.status(400).json({ error: message });
    }
  },

  async deleteWeek(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const rawWeekStart = req.params.weekStart;
      const weekStart = typeof rawWeekStart === "string" ? rawWeekStart : "";
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "weekStart URL parameter must be YYYY-MM-DD" });
      }

      const deleted = await ShiftService.deleteWeek(weekStart);
      if (!deleted) {
        return res.status(404).json({ error: "Week not found" });
      }

      return res.status(200).json({ deleted: true, week_start: weekStart });
    } catch (error) {
      console.error("Error deleting week:", error);
      return res.status(500).json({ error: "Failed to delete week" });
    }
  },

  async duplicateWeek(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const parsed = duplicateWeekSchema.parse(req.body);
      if (!isIsoDateString(parsed.source_week_start) || !isIsoDateString(parsed.target_week_start)) {
        return res.status(400).json({
          error: "source_week_start and target_week_start must be valid ISO dates (YYYY-MM-DD)",
        });
      }

      const duplicated = await ShiftService.duplicateWeekShifts({
        sourceWeekStart: parsed.source_week_start,
        targetWeekStart: parsed.target_week_start,
      });

      return res.status(201).json({
        source_week_start: parsed.source_week_start,
        target_week_start: parsed.target_week_start,
        copied_count: duplicated.copiedCount,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to duplicate week";
      console.error("Error duplicating week:", error);
      return res.status(400).json({ error: message });
    }
  },

  async openConstraintCollection(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const rawWeekStart = req.params.weekStart;
      const weekStart = typeof rawWeekStart === "string" ? rawWeekStart : "";
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "weekStart URL parameter must be YYYY-MM-DD" });
      }

      const parsedBody = openCollectionSchema.parse(req.body);
      const deadline = parseIsoDateTime(parsedBody.collection_deadline);
      if (!deadline) {
        return res.status(400).json({
          error:
            "collection_deadline must be a valid ISO-8601 datetime with timezone offset",
        });
      }

      const week = await ShiftService.openConstraintCollection({
        weekStart,
        collectionDeadline: deadline,
      });

      return res.status(200).json({
        week_start: weekStart,
        week,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message =
        error instanceof Error ? error.message : "Failed to open constraint collection";
      console.error("Error opening constraint collection:", error);
      return res.status(400).json({ error: message });
    }
  },

  async lockWeek(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const rawWeekStart = req.params.weekStart;
      const weekStart = typeof rawWeekStart === "string" ? rawWeekStart : "";
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "weekStart URL parameter must be YYYY-MM-DD" });
      }

      const week = await ShiftService.lockWeek(weekStart);

      return res.status(200).json({
        week_start: weekStart,
        week,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to lock week";
      console.error("Error locking week:", error);
      return res.status(400).json({ error: message });
    }
  },

  // Creates one shift row under the given week_start schedule bucket.
  async createShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const parsed = createShiftSchema.parse(req.body);
      const normalizedStartTime = normalizeTimeToHourMinute(parsed.start_time);
      const normalizedEndTime = normalizeTimeToHourMinute(parsed.end_time);

      if (!normalizedStartTime || !normalizedEndTime) {
        return res
          .status(400)
          .json({ error: "start_time and end_time must use HH:mm or HH:mm:ss format" });
      }

      const normalizedPayload = {
        ...parsed,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime,
      };

      validateShiftPayload(normalizedPayload);

      const created = await ShiftService.createShift({
        weekStart: normalizedPayload.week_start,
        shiftDate: normalizedPayload.shift_date,
        startTime: normalizedPayload.start_time,
        endTime: normalizedPayload.end_time,
        minDoctors: normalizedPayload.min_doctors,
        minNurses: normalizedPayload.min_nurses,
        minMidwives: normalizedPayload.min_midwives,
        minObgyns: normalizedPayload.min_obgyns,
        minAnesthesiologists: normalizedPayload.min_anesthesiologists,
        minOrderlies: normalizedPayload.min_orderlies,
        minPediatricians: normalizedPayload.min_pediatricians,
        minShabbatScribes: normalizedPayload.min_shabbat_scribes,
        minSecretaries: normalizedPayload.min_secretaries,
      });

      return res.status(201).json({
        shift: created,
        timezone: "Asia/Jerusalem",
        todayInJerusalem: getJerusalemTodayIsoDate(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to create shift";
      console.error("Error creating shift:", error);
      return res.status(400).json({ error: message });
    }
  },

  // Returns all shifts for the selected week_start.
  async listShiftsByWeek(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }

      const rawWeekStart = req.params.weekStart;
      const weekStart = typeof rawWeekStart === "string" ? rawWeekStart : undefined;

      if (!weekStart || !isIsoDateString(weekStart)) {
        return res
          .status(400)
          .json({ error: "weekStart URL parameter must be YYYY-MM-DD" });
      }

      const shifts = await ShiftService.listShiftsByWeek(weekStart);

      return res.status(200).json({
        week_start: weekStart,
        timezone: "Asia/Jerusalem",
        shifts,
      });
    } catch (error) {
      console.error("Error listing shifts by week:", error);
      return res.status(500).json({ error: "Failed to fetch shifts" });
    }
  },

  async updateShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const shiftId = Number(req.params.shiftId);
      if (!Number.isInteger(shiftId) || shiftId <= 0) {
        return res.status(400).json({ error: "shiftId URL parameter must be a positive integer" });
      }

      const parsed = updateShiftSchema.parse(req.body);
      if (!isIsoDateString(parsed.shift_date)) {
        return res.status(400).json({ error: "shift_date must be valid ISO date (YYYY-MM-DD)" });
      }

      if (!isTimeString(parsed.start_time) || !isTimeString(parsed.end_time)) {
        return res
          .status(400)
          .json({ error: "start_time and end_time must use HH:mm or HH:mm:ss format" });
      }

      const normalizedStartTime = normalizeTimeToHourMinute(parsed.start_time);
      const normalizedEndTime = normalizeTimeToHourMinute(parsed.end_time);

      if (!normalizedStartTime || !normalizedEndTime) {
        return res
          .status(400)
          .json({ error: "start_time and end_time must use HH:mm or HH:mm:ss format" });
      }

      if (normalizedStartTime >= normalizedEndTime) {
        return res.status(400).json({ error: "start_time must be before end_time" });
      }

      const existing = await ShiftService.getShiftById(shiftId);
      if (!existing) {
        return res.status(404).json({ error: "Shift not found" });
      }

      if (!isDateInsideWeek(existing.weekStart, parsed.shift_date)) {
        return res
          .status(400)
          .json({ error: "shift_date must be inside the existing week_start window" });
      }

      const updated = await ShiftService.updateShiftById(shiftId, {
        shiftDate: parsed.shift_date,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        minDoctors: parsed.min_doctors,
        minNurses: parsed.min_nurses,
        minMidwives: parsed.min_midwives,
        minObgyns: parsed.min_obgyns,
        minAnesthesiologists: parsed.min_anesthesiologists,
        minOrderlies: parsed.min_orderlies,
        minPediatricians: parsed.min_pediatricians,
        minShabbatScribes: parsed.min_shabbat_scribes,
        minSecretaries: parsed.min_secretaries,
      });

      if (!updated) {
        return res.status(404).json({ error: "Shift not found" });
      }

      return res.status(200).json({ shift: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", issues: error.issues });
      }

      const message = error instanceof Error ? error.message : "Failed to update shift";
      console.error("Error updating shift:", error);
      return res.status(400).json({ error: message });
    }
  },

  async deleteShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const shiftId = Number(req.params.shiftId);
      if (!Number.isInteger(shiftId) || shiftId <= 0) {
        return res.status(400).json({ error: "shiftId URL parameter must be a positive integer" });
      }

      const deleted = await ShiftService.deleteShiftById(shiftId);
      if (!deleted) {
        return res.status(404).json({ error: "Shift not found" });
      }

      return res.status(200).json({ deleted: true, shift_id: shiftId });
    } catch (error) {
      console.error("Error deleting shift:", error);
      return res.status(500).json({ error: "Failed to delete shift" });
    }
  },
};
