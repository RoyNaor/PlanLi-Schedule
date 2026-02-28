import express from "express";
import type { Request, Response } from "express";

import {
  getDatabaseHealth,
  getHealth,
  getVersion,
} from "./controllers/system.controller.js";
import { chatController } from "./controllers/chat.controller.js";
import { userController } from "./controllers/user.controller.js";
import { shiftController } from "./controllers/shift.controller.js";
import { requireAuth } from "./middleware/auth.middleware.js";

const router = express.Router();

// Provides a simple liveness endpoint for quick smoke checks.
router.get("/", (_req: Request, res: Response) => {
  res.json({ status: "Server running 🚀" });
});

router.get("/api/health", getHealth);
router.get("/api/version", getVersion);
router.get("/api/health/database", getDatabaseHealth);

router.post("/api/users/sync", requireAuth, userController.syncAuthenticatedUser);
router.get("/api/users/me", requireAuth, userController.getAuthenticatedUser);
router.get("/api/users", requireAuth, userController.listUsers);
router.post("/api/users", requireAuth, userController.createUser);
router.put("/api/users/:userId", requireAuth, userController.updateUser);
router.delete("/api/users/:userId", requireAuth, userController.deleteUser);

router.get("/api/weeks", requireAuth, shiftController.listWeeks);
router.post("/api/weeks", requireAuth, shiftController.createWeek);
router.post("/api/weeks/duplicate", requireAuth, shiftController.duplicateWeek);
router.delete("/api/weeks/:weekStart", requireAuth, shiftController.deleteWeek);

router.post("/api/shifts", requireAuth, shiftController.createShift);
router.get("/api/shifts/week/:weekStart", requireAuth, shiftController.listShiftsByWeek);
router.put("/api/shifts/:shiftId", requireAuth, shiftController.updateShift);
router.delete("/api/shifts/:shiftId", requireAuth, shiftController.deleteShift);

router.post("/api/chat", requireAuth, chatController.sendMessage);
router.get("/api/chat/:userId", requireAuth, chatController.getConversation);

export default router;
