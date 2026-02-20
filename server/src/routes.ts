import express from "express";
import type { Request, Response } from "express";

import {
  getDatabaseHealth,
  getHealth,
  getVersion,
} from "./controllers/system.controller.js";
import { chatController } from "./controllers/chat.controller.js";

const router = express.Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ status: "Server running 🚀" });
});

router.get("/api/health", getHealth);
router.get("/api/version", getVersion);
router.get("/api/health/database", getDatabaseHealth);

router.post("/api/chat", chatController.sendMessage);
router.get("/api/chat/:userId", chatController.getConversation);

export default router;
