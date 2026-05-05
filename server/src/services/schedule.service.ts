import { z } from "zod";
import { queryDatabase, withDatabaseTransaction } from "./database.service.js";
import { SolverService, type SolverResponse } from "./solver.service.js";
import { staffRoleValues } from "../utils/staffing.utils.js";

type SolveRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
type WeekStatus = "DRAFT" | "COLLECTING" | "LOCKED" | "SOLVED" | "PUBLISHED";

interface WeekRow {
  week_start: string;
  status: WeekStatus;
  collection_deadline: Date | null;
  published_at?: Date | null;
  published_schedule_version_id?: string | null;
}

interface ScheduleRunRow {
  id: string;
  week_start: string;
  triggered_by: string;
  status: SolveRunStatus;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  solver_meta: Record<string, unknown> | null;
  created_at: Date;
}

interface ShiftRow {
  id: number;
  week_start: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  min_doctors: number;
  min_nurses: number;
  min_midwives: number;
  min_obgyns: number;
  min_anesthesiologists: number;
  min_orderlies: number;
  min_pediatricians: number;
  min_shabbat_scribes: number;
  min_secretaries: number;
}

interface UserRow {
  id: string;
  role: string;
}

interface ConstraintRow {
  id: string;
  user_id: string;
  start_time: Date;
  end_time: Date;
  priority: "HARD" | "SOFT";
  reason: string | null;
  is_full_day: boolean;
}

interface ScheduleVersionRow {
  id: string;
  week_start: string;
  run_id: string;
  version_number: number;
  is_published: boolean;
  created_by: string;
  created_at: Date;
}

interface AssignmentInput {
  shiftId: number;
  userId: string;
}

interface ScheduleVersionSummaryRow extends ScheduleVersionRow {
  assignment_count: string;
  solver_meta?: Record<string, unknown> | null;
}

interface ScheduleAssignmentRow {
  shift_id: number;
  shift_date: string;
  start_time: string;
  end_time: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  user_role: string;
  source: "solver" | "manual";
}

export interface SolveRun {
  id: string;
  weekStart: string;
  triggeredBy: string;
  status: SolveRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  solverMeta: Record<string, unknown> | null;
  createdAt: string;
}

export interface ScheduleVersionSummary {
  id: string;
  weekStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
  solverMeta: Record<string, unknown> | null;
}

export interface ScheduleAssignmentView {
  shiftId: number;
  shiftDate: string;
  startTime: string;
  endTime: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  userRole: string;
  source: "solver" | "manual";
}

export interface ScheduleVersionDetail {
  id: string;
  weekStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignments: ScheduleAssignmentView[];
}

export interface PublishedScheduleView {
  weekStart: string;
  version: ScheduleVersionSummary;
  assignments: ScheduleAssignmentView[];
}

function mapRun(row: ScheduleRunRow): SolveRun {
  return {
    id: row.id,
    weekStart: row.week_start,
    triggeredBy: row.triggered_by,
    status: row.status,
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    errorMessage: row.error_message,
    solverMeta: row.solver_meta ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function mapScheduleVersionSummary(row: ScheduleVersionSummaryRow): ScheduleVersionSummary {
  return {
    id: row.id,
    weekStart: row.week_start,
    runId: row.run_id,
    versionNumber: row.version_number,
    isPublished: row.is_published,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    assignmentCount: Number(row.assignment_count),
    solverMeta: row.solver_meta ?? null,
  };
}

function mapScheduleAssignment(row: ScheduleAssignmentRow): ScheduleAssignmentView {
  return {
    shiftId: row.shift_id,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    userId: row.user_id,
    userEmail: row.user_email,
    userFullName: row.user_full_name,
    userRole: row.user_role,
    source: row.source,
  };
}

function mapScheduleVersionDetail(
  version: ScheduleVersionRow,
  assignments: ScheduleAssignmentRow[],
): ScheduleVersionDetail {
  return {
    id: version.id,
    weekStart: version.week_start,
    runId: version.run_id,
    versionNumber: version.version_number,
    isPublished: version.is_published,
    createdBy: version.created_by,
    createdAt: version.created_at.toISOString(),
    assignments: assignments.map(mapScheduleAssignment),
  };
}

export const ScheduleService = {
  async getScheduleVersionRowById(versionId: string): Promise<ScheduleVersionRow | null> {
    const result = await queryDatabase<ScheduleVersionRow>(
      `SELECT id,
              week_start::text AS week_start,
              run_id,
              version_number,
              is_published,
              created_by,
              created_at
       FROM schedule_versions
       WHERE id = $1`,
      [versionId],
    );

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    return result.rows[0] as ScheduleVersionRow;
  },

  async getAssignmentsByVersionId(versionId: string): Promise<ScheduleAssignmentRow[]> {
    const result = await queryDatabase<ScheduleAssignmentRow>(
      `SELECT sa.shift_id,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              sa.user_id,
              u.email AS user_email,
              u.full_name AS user_full_name,
              u.role AS user_role,
              sa.source
       FROM schedule_assignments sa
       INNER JOIN shifts s ON s.id = sa.shift_id
       INNER JOIN users u ON u.id = sa.user_id
       WHERE sa.schedule_version_id = $1
       ORDER BY s.shift_date ASC, s.start_time ASC, u.role ASC, u.full_name ASC`,
      [versionId],
    );

    return result.rows;
  },

  async getPublishedVersionForWeek(weekStart: string): Promise<ScheduleVersionRow | null> {
    const result = await queryDatabase<ScheduleVersionRow>(
      `SELECT sv.id,
              sv.week_start::text AS week_start,
              sv.run_id,
              sv.version_number,
              sv.is_published,
              sv.created_by,
              sv.created_at
       FROM schedule_versions sv
       WHERE sv.week_start = $1
         AND sv.is_published = TRUE
       ORDER BY sv.created_at DESC
       LIMIT 1`,
      [weekStart],
    );

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    return result.rows[0] as ScheduleVersionRow;
  },

  async solveWeekDirect(weekStart: string): Promise<{
    weekStart: string;
    status: "feasible" | "infeasible";
    assignments: Array<{ shift_id: number; user_id: string }>;
    solverMeta: Record<string, unknown> | null;
    message?: string;
  }> {
    await queryDatabase(
      `UPDATE weeks
       SET status = 'LOCKED',
           locked_at = COALESCE(locked_at, NOW())
       WHERE week_start = $1
         AND status = 'COLLECTING'
         AND collection_deadline IS NOT NULL
         AND collection_deadline <= NOW()`,
      [weekStart],
    );

    const weekResult = await queryDatabase<WeekRow>(
      `SELECT week_start::text AS week_start, status, collection_deadline
       FROM weeks
       WHERE week_start = $1`,
      [weekStart],
    );
    const week = weekResult.rows[0];
    if (!week) {
      throw new Error("Week not found");
    }

    if (!["LOCKED", "SOLVED", "PUBLISHED"].includes(week.status)) {
      throw new Error("Week must be LOCKED, SOLVED, or PUBLISHED before solving");
    }

    const payload = await this.buildSolverPayload(weekStart);
    const solverResponse = await SolverService.solve(payload);

    if (solverResponse.status === "infeasible") {
      return {
        weekStart,
        status: "infeasible",
        assignments: [],
        solverMeta: solverResponse.solver_meta ?? null,
        message: solverResponse.message,
      };
    }

    const normalized = this.validateAssignments({
      assignments: solverResponse.assignments,
      shifts: payload.shifts as Array<{ id: number }>,
      users: payload.users as Array<{ id: string }>,
    });

    return {
      weekStart,
      status: "feasible",
      assignments: normalized.map((a) => ({ shift_id: a.shiftId, user_id: a.userId })),
      solverMeta: solverResponse.solver_meta ?? null,
      message: solverResponse.message,
    };
  },

  async listRunsByWeek(weekStart: string): Promise<SolveRun[]> {
    const result = await queryDatabase<ScheduleRunRow>(
      `SELECT id,
              week_start::text AS week_start,
              triggered_by,
              status,
              started_at,
              finished_at,
              error_message,
              solver_meta,
              created_at
       FROM schedule_runs
       WHERE week_start = $1
       ORDER BY created_at DESC`,
      [weekStart],
    );

    return result.rows.map(mapRun);
  },

  async getRunById(runId: string): Promise<SolveRun | null> {
    const result = await queryDatabase<ScheduleRunRow>(
      `SELECT id,
              week_start::text AS week_start,
              triggered_by,
              status,
              started_at,
              finished_at,
              error_message,
              solver_meta,
              created_at
       FROM schedule_runs
       WHERE id = $1`,
      [runId],
    );

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    return mapRun(result.rows[0] as ScheduleRunRow);
  },

  async listScheduleVersionsByWeek(weekStart: string): Promise<ScheduleVersionSummary[]> {
    const result = await queryDatabase<ScheduleVersionSummaryRow>(
      `SELECT sv.id,
              sv.week_start::text AS week_start,
              sv.run_id,
              sv.version_number,
              sv.is_published,
              sv.created_by,
              sv.created_at,
              COUNT(sa.id)::text AS assignment_count,
              sr.solver_meta
       FROM schedule_versions sv
       LEFT JOIN schedule_assignments sa ON sa.schedule_version_id = sv.id
       LEFT JOIN schedule_runs sr ON sr.id = sv.run_id
       WHERE sv.week_start = $1
       GROUP BY sv.id, sv.week_start, sv.run_id, sv.version_number, sv.is_published, sv.created_by, sv.created_at, sr.solver_meta
       ORDER BY sv.version_number DESC`,
      [weekStart],
    );

    return result.rows.map(mapScheduleVersionSummary);
  },

  async getScheduleVersionDetail(versionId: string): Promise<ScheduleVersionDetail | null> {
    const version = await this.getScheduleVersionRowById(versionId);
    if (!version) {
      return null;
    }

    const assignments = await this.getAssignmentsByVersionId(versionId);
    return mapScheduleVersionDetail(version, assignments);
  },

  async publishScheduleVersion(input: {
    versionId: string;
  }): Promise<PublishedScheduleView> {
    const version = await this.getScheduleVersionRowById(input.versionId);
    if (!version) {
      throw new Error("Schedule version not found");
    }

    await withDatabaseTransaction(async (client) => {
      await client.query(
        `UPDATE schedule_versions
         SET is_published = FALSE
         WHERE week_start = $1
           AND is_published = TRUE`,
        [version.week_start],
      );

      await client.query(
        `UPDATE schedule_versions
         SET is_published = TRUE
         WHERE id = $1`,
        [version.id],
      );

      await client.query(
        `UPDATE weeks
         SET status = 'PUBLISHED',
             published_at = NOW(),
             published_schedule_version_id = $2
         WHERE week_start = $1`,
        [version.week_start, version.id],
      );
    });

    const publishedVersion = await this.getScheduleVersionRowById(version.id);
    if (!publishedVersion) {
      throw new Error("Failed to load published schedule version");
    }

    const assignments = await this.getAssignmentsByVersionId(publishedVersion.id);
    const summary = mapScheduleVersionSummary({
      ...publishedVersion,
      assignment_count: String(assignments.length),
    });

    return {
      weekStart: publishedVersion.week_start,
      version: summary,
      assignments: assignments.map(mapScheduleAssignment),
    };
  },

  async getPublishedScheduleForAdmin(
    weekStart: string,
  ): Promise<PublishedScheduleView | null> {
    const version = await this.getPublishedVersionForWeek(weekStart);
    if (!version) {
      return null;
    }

    const assignments = await this.getAssignmentsByVersionId(version.id);
    const summary = mapScheduleVersionSummary({
      ...version,
      assignment_count: String(assignments.length),
    });

    return {
      weekStart,
      version: summary,
      assignments: assignments.map(mapScheduleAssignment),
    };
  },

  async getPublishedScheduleForUser(input: {
    weekStart: string;
    userId: string;
  }): Promise<PublishedScheduleView | null> {
    const version = await this.getPublishedVersionForWeek(input.weekStart);
    if (!version) {
      return null;
    }

    const assignments = await queryDatabase<ScheduleAssignmentRow>(
      `SELECT sa.shift_id,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              sa.user_id,
              u.email AS user_email,
              u.full_name AS user_full_name,
              u.role AS user_role,
              sa.source
       FROM schedule_assignments sa
       INNER JOIN shifts s ON s.id = sa.shift_id
       INNER JOIN users u ON u.id = sa.user_id
       WHERE sa.schedule_version_id = $1
         AND sa.user_id = $2
       ORDER BY s.shift_date ASC, s.start_time ASC`,
      [version.id, input.userId],
    );

    const summary = mapScheduleVersionSummary({
      ...version,
      assignment_count: String(assignments.rows.length),
    });

    return {
      weekStart: input.weekStart,
      version: summary,
      assignments: assignments.rows.map(mapScheduleAssignment),
    };
  },

  async queueWeekSolve(input: {
    weekStart: string;
    triggeredBy: string;
  }): Promise<SolveRun> {
    await queryDatabase(
      `UPDATE weeks
       SET status = 'LOCKED',
           locked_at = COALESCE(locked_at, NOW())
       WHERE week_start = $1
         AND status = 'COLLECTING'
         AND collection_deadline IS NOT NULL
         AND collection_deadline <= NOW()`,
      [input.weekStart],
    );

    const weekResult = await queryDatabase<WeekRow>(
      `SELECT week_start::text AS week_start, status, collection_deadline
       FROM weeks
       WHERE week_start = $1`,
      [input.weekStart],
    );
    const week = weekResult.rows[0];
    if (!week) {
      throw new Error("Week not found");
    }

    if (!["LOCKED", "SOLVED", "PUBLISHED"].includes(week.status)) {
      throw new Error("Week must be LOCKED, SOLVED, or PUBLISHED before running the solver");
    }

    const shiftCountResult = await queryDatabase<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM shifts
       WHERE week_start = $1`,
      [input.weekStart],
    );
    const shiftCount = Number(shiftCountResult.rows[0]?.count ?? 0);
    if (shiftCount <= 0) {
      throw new Error("Week has no shifts to solve");
    }

    const activeRunResult = await queryDatabase<{ id: string }>(
      `SELECT id
       FROM schedule_runs
       WHERE week_start = $1
         AND status IN ('QUEUED', 'RUNNING')
       LIMIT 1`,
      [input.weekStart],
    );

    if ((activeRunResult.rowCount ?? 0) > 0) {
      throw new Error("A solver run is already active for this week");
    }

    const inserted = await queryDatabase<ScheduleRunRow>(
      `INSERT INTO schedule_runs (week_start, triggered_by, status, solver_meta)
       VALUES ($1, $2, 'QUEUED', '{}'::jsonb)
       RETURNING id,
                 week_start::text AS week_start,
                 triggered_by,
                 status,
                 started_at,
                 finished_at,
                 error_message,
                 solver_meta,
                 created_at`,
      [input.weekStart, input.triggeredBy],
    );

    const run = mapRun(inserted.rows[0] as ScheduleRunRow);

    // Fire-and-forget async solver execution; status can be polled with run endpoints.
    void this.executeQueuedRun(run.id);

    return run;
  },

  async executeQueuedRun(runId: string): Promise<void> {
    const runningResult = await queryDatabase<ScheduleRunRow>(
      `UPDATE schedule_runs
       SET status = 'RUNNING',
           started_at = COALESCE(started_at, NOW())
       WHERE id = $1
         AND status = 'QUEUED'
       RETURNING id,
                 week_start::text AS week_start,
                 triggered_by,
                 status,
                 started_at,
                 finished_at,
                 error_message,
                 solver_meta,
                 created_at`,
      [runId],
    );

    if ((runningResult.rowCount ?? 0) === 0) {
      return;
    }

    const run = runningResult.rows[0] as ScheduleRunRow;

    try {
      const payload = await this.buildSolverPayload(run.week_start);
      const solverResponse = await SolverService.solve(payload);

      if (solverResponse.status !== "feasible") {
        throw new Error(solverResponse.message ?? "Solver reported infeasible");
      }

      const normalizedAssignments = this.validateAssignments({
        assignments: solverResponse.assignments,
        shifts: payload.shifts as Array<{ id: number }>,
        users: payload.users as Array<{ id: string }>,
      });

      const version = await this.persistSolvedVersion({
        weekStart: run.week_start,
        runId: run.id,
        createdBy: run.triggered_by,
        assignments: normalizedAssignments,
      });

      const successMeta = {
        version_id: version.id,
        version_number: version.version_number,
        assignment_count: normalizedAssignments.length,
        ...(solverResponse.solver_meta ?? {}),
      };

      await queryDatabase(
        `UPDATE schedule_runs
         SET status = 'SUCCEEDED',
             finished_at = NOW(),
             error_message = NULL,
             solver_meta = $2::jsonb
         WHERE id = $1`,
        [runId, JSON.stringify(successMeta)],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Solver execution failed";
      await queryDatabase(
        `UPDATE schedule_runs
         SET status = 'FAILED',
             finished_at = NOW(),
             error_message = $2
         WHERE id = $1`,
        [runId, message],
      );
    }
  },

  async buildSolverPayload(weekStart: string): Promise<Record<string, unknown>> {
    const shiftsResult = await queryDatabase<ShiftRow>(
      `SELECT id,
              week_start::text AS week_start,
              shift_date::text AS shift_date,
              start_time,
              end_time,
              min_doctors,
              min_nurses,
              min_midwives,
              min_obgyns,
              min_anesthesiologists,
              min_orderlies,
              min_pediatricians,
              min_shabbat_scribes,
              min_secretaries
       FROM shifts
       WHERE week_start = $1
       ORDER BY shift_date ASC, start_time ASC`,
      [weekStart],
    );

    const usersResult = await queryDatabase<UserRow>(
      `SELECT id, role
       FROM users
       WHERE role = ANY($1)
       ORDER BY role ASC, id ASC`,
      [staffRoleValues],
    );

    const constraintsResult = await queryDatabase<ConstraintRow>(
      `SELECT c.id::text AS id,
              c.user_id,
              c.start_time,
              c.end_time,
              c.priority,
              c.reason,
              c.is_full_day
       FROM constraints c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.week_start = $1
         AND u.role = ANY($2)
       ORDER BY c.created_at ASC`,
      [weekStart, staffRoleValues],
    );

    return {
      week_start: weekStart,
      users: usersResult.rows.map((row) => ({
        id: row.id,
        role: row.role,
      })),
      shifts: shiftsResult.rows.map((row) => ({
        id: row.id,
        shift_date: row.shift_date,
        start_time: row.start_time,
        end_time: row.end_time,
        min_doctors: row.min_doctors,
        min_nurses: row.min_nurses,
        min_midwives: row.min_midwives,
        min_obgyns: row.min_obgyns,
        min_anesthesiologists: row.min_anesthesiologists,
        min_orderlies: row.min_orderlies,
        min_pediatricians: row.min_pediatricians,
        min_shabbat_scribes: row.min_shabbat_scribes,
        min_secretaries: row.min_secretaries,
      })),
      constraints: constraintsResult.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        start_time: row.start_time.toISOString(),
        end_time: row.end_time.toISOString(),
        priority: row.priority,
        reason: row.reason,
        is_full_day: row.is_full_day,
      })),
    };
  },

  validateAssignments(input: {
    assignments: Array<{ shift_id: number; user_id: string }>;
    shifts: Array<{ id: number }>;
    users: Array<{ id: string }>;
  }): AssignmentInput[] {
    const shiftIds = new Set(input.shifts.map((shift) => shift.id));
    const userIds = new Set(input.users.map((user) => user.id));
    const seen = new Set<string>();

    return input.assignments.map((assignment) => {
      if (!shiftIds.has(assignment.shift_id)) {
        throw new Error(`Solver returned assignment for unknown shift_id ${assignment.shift_id}`);
      }

      if (!userIds.has(assignment.user_id)) {
        throw new Error(`Solver returned assignment for unknown user_id ${assignment.user_id}`);
      }

      const dedupeKey = `${assignment.shift_id}:${assignment.user_id}`;
      if (seen.has(dedupeKey)) {
        throw new Error(`Solver returned duplicate assignment ${dedupeKey}`);
      }
      seen.add(dedupeKey);

      return {
        shiftId: assignment.shift_id,
        userId: assignment.user_id,
      };
    });
  },

  async addManualAssignment(input: {
    versionId: string;
    shiftId: number;
    userId: string;
  }): Promise<void> {
    const version = await this.getScheduleVersionRowById(input.versionId);
    if (!version) throw new Error("Schedule version not found");

    await queryDatabase(
      `INSERT INTO schedule_assignments (schedule_version_id, shift_id, user_id, source)
       VALUES ($1, $2, $3, 'manual')
       ON CONFLICT (schedule_version_id, shift_id, user_id) DO NOTHING`,
      [input.versionId, input.shiftId, input.userId],
    );
  },

  async removeAssignment(input: {
    versionId: string;
    shiftId: number;
    userId: string;
  }): Promise<void> {
    await queryDatabase(
      `DELETE FROM schedule_assignments
       WHERE schedule_version_id = $1
         AND shift_id = $2
         AND user_id = $3`,
      [input.versionId, input.shiftId, input.userId],
    );
  },

  async getWeekConstraintsSummary(weekStart: string): Promise<
    Array<{
      userId: string;
      fullName: string;
      role: string;
      email: string;
      constraints: Array<{
        id: string;
        startTime: string;
        endTime: string;
        priority: "HARD" | "SOFT";
        reason: string | null;
        isFullDay: boolean;
      }>;
    }>
  > {
    const usersResult = await queryDatabase<{
      id: string;
      email: string;
      full_name: string;
      role: string;
    }>(
      `SELECT id, email, full_name, role
       FROM users
       WHERE role = ANY($1)
       ORDER BY role ASC, full_name ASC`,
      [staffRoleValues],
    );

    const constraintsResult = await queryDatabase<{
      id: string;
      user_id: string;
      start_time: Date;
      end_time: Date;
      priority: "HARD" | "SOFT";
      reason: string | null;
      is_full_day: boolean;
    }>(
      `SELECT id::text AS id, user_id, start_time, end_time, priority, reason, is_full_day
       FROM constraints
       WHERE week_start = $1
       ORDER BY user_id ASC, start_time ASC`,
      [weekStart],
    );

    const constraintsByUser = new Map<string, typeof constraintsResult.rows>();
    for (const c of constraintsResult.rows) {
      if (!constraintsByUser.has(c.user_id)) constraintsByUser.set(c.user_id, []);
      constraintsByUser.get(c.user_id)!.push(c);
    }

    return usersResult.rows.map((user) => ({
      userId: user.id,
      fullName: user.full_name,
      role: user.role,
      email: user.email,
      constraints: (constraintsByUser.get(user.id) ?? []).map((c) => ({
        id: c.id,
        startTime: c.start_time.toISOString(),
        endTime: c.end_time.toISOString(),
        priority: c.priority,
        reason: c.reason,
        isFullDay: c.is_full_day,
      })),
    }));
  },

  async persistSolvedVersion(input: {
    weekStart: string;
    runId: string;
    createdBy: string;
    assignments: AssignmentInput[];
  }): Promise<ScheduleVersionRow> {
    return withDatabaseTransaction(async (client) => {
      const versionResult = await client.query<ScheduleVersionRow>(
        `INSERT INTO schedule_versions (week_start, run_id, version_number, created_by)
         VALUES (
           $1,
           $2,
           COALESCE((SELECT MAX(version_number) + 1 FROM schedule_versions WHERE week_start = $1), 1),
           $3
         )
         RETURNING id,
                   week_start::text AS week_start,
                   run_id,
                   version_number,
                   is_published,
                   created_by,
                   created_at`,
        [input.weekStart, input.runId, input.createdBy],
      );
      const version = versionResult.rows[0] as ScheduleVersionRow;

      for (const assignment of input.assignments) {
        await client.query(
          `INSERT INTO schedule_assignments (schedule_version_id, shift_id, user_id, source)
           VALUES ($1, $2, $3, 'solver')`,
          [version.id, assignment.shiftId, assignment.userId],
        );
      }

      await client.query(
        `UPDATE weeks
         SET status = 'SOLVED'
         WHERE week_start = $1`,
        [input.weekStart],
      );

      return version;
    });
  },
};
