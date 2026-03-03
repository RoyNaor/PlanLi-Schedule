import type { Request, Response } from "express";
import { UserService } from "../services/user.service.js";
import { ScheduleService } from "../services/schedule.service.js";
import { isIsoDateString } from "../utils/schedule-date.utils.js";

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

function parseWeekStartFromQuery(req: Request): string {
  return typeof req.query.week_start === "string" ? req.query.week_start : "";
}

export const scheduleController = {
  async solveWeekDirect(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const weekStart = typeof req.body?.week_start === "string" ? req.body.week_start : "";
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "week_start must be YYYY-MM-DD" });
      }

      const result = await ScheduleService.solveWeekDirect(weekStart);
      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to solve week";
      console.error("Error solving week directly:", error);
      return res.status(400).json({ error: message });
    }
  },

  async queueSolveWeek(req: Request, res: Response) {
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

      const run = await ScheduleService.queueWeekSolve({
        weekStart,
        triggeredBy: adminCheck.actor.id,
      });

      return res.status(202).json({
        queued: true,
        run,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to queue solver run";
      console.error("Error queueing solve run:", error);
      return res.status(400).json({ error: message });
    }
  },

  async listRunsByWeek(req: Request, res: Response) {
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

      const runs = await ScheduleService.listRunsByWeek(weekStart);
      return res.status(200).json({
        week_start: weekStart,
        runs,
      });
    } catch (error) {
      console.error("Error listing solve runs:", error);
      return res.status(500).json({ error: "Failed to list solve runs" });
    }
  },

  async getRunById(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const runId = typeof req.params.runId === "string" ? req.params.runId : "";
      if (!runId.trim()) {
        return res.status(400).json({ error: "runId URL parameter is required" });
      }

      const run = await ScheduleService.getRunById(runId);
      if (!run) {
        return res.status(404).json({ error: "Solve run not found" });
      }

      return res.status(200).json({ run });
    } catch (error) {
      console.error("Error loading solve run:", error);
      return res.status(500).json({ error: "Failed to fetch solve run" });
    }
  },

  async listScheduleVersionsByWeek(req: Request, res: Response) {
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

      const versions = await ScheduleService.listScheduleVersionsByWeek(weekStart);
      return res.status(200).json({
        week_start: weekStart,
        versions,
      });
    } catch (error) {
      console.error("Error listing schedule versions:", error);
      return res.status(500).json({ error: "Failed to list schedule versions" });
    }
  },

  async getScheduleVersionById(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const versionId = typeof req.params.versionId === "string" ? req.params.versionId : "";
      if (!versionId.trim()) {
        return res.status(400).json({ error: "versionId URL parameter is required" });
      }

      const version = await ScheduleService.getScheduleVersionDetail(versionId);
      if (!version) {
        return res.status(404).json({ error: "Schedule version not found" });
      }

      return res.status(200).json({ version });
    } catch (error) {
      console.error("Error loading schedule version:", error);
      return res.status(500).json({ error: "Failed to load schedule version" });
    }
  },

  async publishScheduleVersion(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const versionId = typeof req.params.versionId === "string" ? req.params.versionId : "";
      if (!versionId.trim()) {
        return res.status(400).json({ error: "versionId URL parameter is required" });
      }

      const published = await ScheduleService.publishScheduleVersion({ versionId });
      return res.status(200).json({
        published: true,
        schedule: published,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish schedule";
      console.error("Error publishing schedule version:", error);
      return res.status(400).json({ error: message });
    }
  },

  async getPublishedScheduleAdmin(req: Request, res: Response) {
    try {
      const adminCheck = await requireAdmin(req, res);
      if ("error" in adminCheck) {
        return adminCheck.error;
      }

      const weekStart = parseWeekStartFromQuery(req);
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "week_start query parameter must be YYYY-MM-DD" });
      }

      const schedule = await ScheduleService.getPublishedScheduleForAdmin(weekStart);
      if (!schedule) {
        return res.status(404).json({ error: "No published schedule for this week" });
      }

      return res.status(200).json({ schedule });
    } catch (error) {
      console.error("Error getting admin published schedule:", error);
      return res.status(500).json({ error: "Failed to fetch published schedule" });
    }
  },

  async getMyPublishedSchedule(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }

      const weekStart = parseWeekStartFromQuery(req);
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "week_start query parameter must be YYYY-MM-DD" });
      }

      const schedule = await ScheduleService.getPublishedScheduleForUser({
        weekStart,
        userId: req.authUser.uid,
      });

      if (!schedule) {
        return res.status(404).json({ error: "No published schedule for this week" });
      }

      return res.status(200).json({ schedule });
    } catch (error) {
      console.error("Error getting my published schedule:", error);
      return res.status(500).json({ error: "Failed to fetch your published schedule" });
    }
  },
};
