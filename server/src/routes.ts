import express from "express";
import type { Request, Response } from "express";

import {
  getDatabaseHealth,
  getHealth,
  getVersion,
} from "./controllers/system.controller.js";
import { chatController } from "./controllers/chat.controller.js";
import { userController } from "./controllers/user.controller.js";
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

router.post("/api/chat", requireAuth, chatController.sendMessage);
router.get("/api/chat/:userId", requireAuth, chatController.getConversation);

export default router;
