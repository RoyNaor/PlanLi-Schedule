import type { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/user.service.js";
import { ShiftService } from "../services/shift.service.js";
import {
  getJerusalemTodayIsoDate,
  isDateInsideWeek,
  isIsoDateString,
  isTimeString,
} from "../utils/schedule-date.utils.js";

const createShiftSchema = z.object({
  week_start: z.string(),
  shift_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  min_doctors: z.number().int().min(0).optional().default(1),
  min_nurses: z.number().int().min(0).optional().default(1),
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

function validateShiftPayload(payload: z.infer<typeof createShiftSchema>) {
  if (!isIsoDateString(payload.week_start) || !isIsoDateString(payload.shift_date)) {
    throw new Error("week_start and shift_date must be valid ISO dates (YYYY-MM-DD)");
  }

  if (!isTimeString(payload.start_time) || !isTimeString(payload.end_time)) {
    throw new Error("start_time and end_time must use HH:mm format");
  }

  if (payload.start_time >= payload.end_time) {
    throw new Error("start_time must be before end_time");
  }

  if (!isDateInsideWeek(payload.week_start, payload.shift_date)) {
    throw new Error("shift_date must be inside the provided week_start window");
  }
}

export const shiftController = {
  // Creates one shift row under the given week_start schedule bucket.
  async createShift(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const parsed = createShiftSchema.parse(req.body);
      validateShiftPayload(parsed);

      const created = await ShiftService.createShift({
        weekStart: parsed.week_start,
        shiftDate: parsed.shift_date,
        startTime: parsed.start_time,
        endTime: parsed.end_time,
        minDoctors: parsed.min_doctors,
        minNurses: parsed.min_nurses,
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
};
