import express from "express";
import type { Request, Response } from "express";

import {
  getDatabaseHealth,
  getHealth,
  getVersion,
} from "./controllers/system.controller.js";

const router = express.Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ status: "Server running 🚀" });
});

router.get("/api/health", getHealth);
router.get("/api/version", getVersion);
router.get("/api/health/database", getDatabaseHealth);

export default router;
