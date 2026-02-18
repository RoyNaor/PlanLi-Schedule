import type { Request, Response } from "express";

import { checkDatabaseConnection } from "../services/database.service.js";

export function getHealth(_req: Request, res: Response) {
  res.json({ ok: true, service: "planli-api" });
}

export function getVersion(_req: Request, res: Response) {
  res.json({
    service: "server",
    version: process.env.npm_package_version ?? "unknown",
    node: process.version,
  });
}

export async function getDatabaseHealth(_req: Request, res: Response) {
  try {
    const result = await checkDatabaseConnection();

    res.json({
      ...result,
      provider: "neon-postgres",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    res.status(500).json({
      ok: false,
      provider: "neon-postgres",
      error: message,
    });
  }
}
