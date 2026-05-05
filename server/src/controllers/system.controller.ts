import type { Request, Response } from "express";

import { checkDatabaseConnection } from "../services/database.service.js";
import { SolverService } from "../services/solver.service.js";

// Returns a lightweight service health payload for monitoring checks.
export function getHealth(_req: Request, res: Response) {
  res.json({ ok: true, service: "planli-api" });
}

// Exposes runtime version details to simplify debugging deployments.
export function getVersion(_req: Request, res: Response) {
  res.json({
    service: "server",
    version: process.env.npm_package_version ?? "unknown",
    node: process.version,
  });
}

// Validates DB connectivity and reports provider-specific status details.
export async function getDatabaseHealth(_req: Request, res: Response) {
  try {
    // Attempt a real query so this endpoint verifies actual DB availability.
    const result = await checkDatabaseConnection();
    console.log("✅ Database health check passed.");

    res.json({
      ...result,
      provider: "neon-postgres",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error(`❌ Database health check failed: ${message}`);

    res.status(500).json({
      ok: false,
      provider: "neon-postgres",
      error: message,
    });
  }
}

// Verifies the API can reach the Python OR-Tools service configured by SOLVER_SERVICE_URL.
export async function getSolverHealth(_req: Request, res: Response) {
  try {
    const result = await SolverService.checkHealth();
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown solver error";
    console.error(`Solver health check failed: ${message}`);

    res.status(500).json({
      ok: false,
      service: "solver",
      error: message,
    });
  }
}
