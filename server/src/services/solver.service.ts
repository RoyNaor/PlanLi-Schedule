import { z } from "zod";

const solverResponseSchema = z.object({
  status: z.enum(["feasible", "infeasible"]),
  assignments: z.array(
    z.object({
      shift_id: z.union([z.number().int().positive(), z.string().min(1)]),
      user_id: z.string().min(1),
      worker_id: z.string().min(1).optional(),
      solver_worker_id: z.string().min(1).optional(),
      worker_type: z.string().min(1).optional(),
      department_id: z.string().min(1).nullable().optional(),
      arrangement_id: z.string().min(1).nullable().optional(),
    }),
  ),
  message: z.string().optional(),
  solver_meta: z.record(z.string(), z.unknown()).optional(),
});

const solverHealthSchema = z.object({
  ok: z.boolean(),
  service: z.string().optional(),
});

export type SolverResponse = z.infer<typeof solverResponseSchema>;

function buildSolverBaseUrl(): string {
  const base = process.env.SOLVER_SERVICE_URL?.trim();
  if (!base) {
    throw new Error("SOLVER_SERVICE_URL is not configured");
  }

  return base.replace(/\/+$/, "");
}

function getSolveTimeoutMs(): number {
  const raw = process.env.SOLVER_REQUEST_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 60_000;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60_000;
  }

  return Math.floor(parsed);
}

function getSolverHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.SOLVER_SERVICE_API_KEY) {
    headers["x-api-key"] = process.env.SOLVER_SERVICE_API_KEY;
  }

  return headers;
}

async function fetchSolverJson(
  path: "/health" | "/solve" | "/solve-month",
  init: Omit<RequestInit, "headers" | "signal"> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutMs = getSolveTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${buildSolverBaseUrl()}${path}`, {
      ...init,
      headers: getSolverHeaders(),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsedBody: unknown = null;
    if (responseText.trim()) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        throw new Error("Solver returned a non-JSON response");
      }
    }

    if (!response.ok) {
      const message =
        parsedBody && typeof parsedBody === "object" && "error" in parsedBody
          ? String((parsedBody as { error?: unknown }).error ?? "Unknown solver error")
          : `Solver request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return parsedBody;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Solver request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const SolverService = {
  async solve(payload: Record<string, unknown>): Promise<SolverResponse> {
    const parsedBody = await fetchSolverJson("/solve", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const validated = solverResponseSchema.safeParse(parsedBody);
    if (!validated.success) {
      throw new Error("Solver response did not match expected schema");
    }

    return validated.data;
  },

  async solveMonth(payload: Record<string, unknown>): Promise<SolverResponse> {
    const parsedBody = await fetchSolverJson("/solve-month", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const validated = solverResponseSchema.safeParse(parsedBody);
    if (!validated.success) {
      throw new Error("Solver monthly response did not match expected schema");
    }

    return validated.data;
  },

  async checkHealth() {
    const parsedBody = await fetchSolverJson("/health", {
      method: "GET",
    });

    const validated = solverHealthSchema.safeParse(parsedBody);
    if (!validated.success || !validated.data.ok) {
      throw new Error("Solver health response did not match expected schema");
    }

    return {
      ok: true,
      service: validated.data.service ?? "solver",
      url: buildSolverBaseUrl(),
    };
  },
};
