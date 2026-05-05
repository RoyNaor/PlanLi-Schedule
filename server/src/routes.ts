import express from "express";
import type { Request, Response } from "express";

import {
  getDatabaseHealth,
  getHealth,
  getSolverHealth,
  getVersion,
} from "./controllers/system.controller.js";
import { chatController } from "./controllers/chat.controller.js";
import { userController } from "./controllers/user.controller.js";
import { shiftController } from "./controllers/shift.controller.js";
import { scheduleController } from "./controllers/schedule.controller.js";
import { calendarController } from "./controllers/calendar.controller.js";
import { requireAuth } from "./middleware/auth.middleware.js";

const router = express.Router();

// Provides a simple liveness endpoint for quick smoke checks.
router.get("/", (_req: Request, res: Response) => {
  res.json({ status: "Server running 🚀" });
});

router.get("/api/health", getHealth);
router.get("/api/version", getVersion);
router.get("/api/health/database", getDatabaseHealth);
router.get("/api/health/solver", getSolverHealth);

router.post("/api/users/sync", requireAuth, userController.syncAuthenticatedUser);
router.get("/api/users/me", requireAuth, userController.getAuthenticatedUser);
router.get("/api/users", requireAuth, userController.listUsers);
router.post("/api/users", requireAuth, userController.createUser);
router.put("/api/users/:userId", requireAuth, userController.updateUser);
router.delete("/api/users/:userId", requireAuth, userController.deleteUser);

router.get("/api/weeks", requireAuth, shiftController.listWeeks);
router.post("/api/weeks", requireAuth, shiftController.createWeek);
router.post("/api/weeks/duplicate", requireAuth, shiftController.duplicateWeek);
router.post(
  "/api/weeks/:weekStart/open-collection",
  requireAuth,
  shiftController.openConstraintCollection,
);
router.post("/api/weeks/:weekStart/lock", requireAuth, shiftController.lockWeek);
router.delete("/api/weeks/:weekStart", requireAuth, shiftController.deleteWeek);

router.post("/api/shifts", requireAuth, shiftController.createShift);
router.get("/api/shifts/week/:weekStart", requireAuth, shiftController.listShiftsByWeek);
router.put("/api/shifts/:shiftId", requireAuth, shiftController.updateShift);
router.delete("/api/shifts/:shiftId", requireAuth, shiftController.deleteShift);

router.post("/api/weeks/:weekStart/solve", requireAuth, scheduleController.queueSolveWeek);
router.get("/api/weeks/:weekStart/solve-runs", requireAuth, scheduleController.listRunsByWeek);
router.get("/api/solve-runs/:runId", requireAuth, scheduleController.getRunById);
router.get(
  "/api/weeks/:weekStart/schedule-versions",
  requireAuth,
  scheduleController.listScheduleVersionsByWeek,
);
router.get("/api/schedule-versions/:versionId", requireAuth, scheduleController.getScheduleVersionById);
router.post(
  "/api/schedule-versions/:versionId/publish",
  requireAuth,
  scheduleController.publishScheduleVersion,
);
router.post(
  "/api/schedule-versions/:versionId/assignments",
  requireAuth,
  scheduleController.addAssignment,
);
router.delete(
  "/api/schedule-versions/:versionId/assignments/:shiftId/:userId",
  requireAuth,
  scheduleController.removeAssignment,
);
router.get(
  "/api/weeks/:weekStart/constraints-summary",
  requireAuth,
  scheduleController.getWeekConstraintsSummary,
);
router.get("/api/admin/schedule", requireAuth, scheduleController.getPublishedScheduleAdmin);
router.get("/api/my-schedule", requireAuth, scheduleController.getMyPublishedSchedule);

router.post("/api/calendar/google/connect", requireAuth, calendarController.connectGoogle);
router.get("/api/calendar/google/callback", calendarController.googleCallback);
router.get("/api/calendar/status", requireAuth, calendarController.getStatus);
router.post("/api/calendar/sync/outbound", requireAuth, calendarController.syncOutbound);
router.post("/api/calendar/webhook", calendarController.receiveWebhook);
router.get("/api/calendar/feed/:token.ics", calendarController.getWebcalFeed);
router.post("/api/calendar/feed/rotate", requireAuth, calendarController.rotateFeedToken);
router.post("/api/calendar/disconnect", requireAuth, calendarController.disconnect);

router.post("/api/chat", requireAuth, chatController.sendMessage);
router.get("/api/chat/:userId", requireAuth, chatController.getConversation);

export default router;
