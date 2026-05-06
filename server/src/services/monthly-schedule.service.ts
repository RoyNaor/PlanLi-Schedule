import type { PoolClient } from "pg";
import { queryDatabase, withDatabaseTransaction } from "./database.service.js";
import { SolverService } from "./solver.service.js";

type MonthStatus = "DRAFT" | "COLLECTING" | "LOCKED" | "SOLVED" | "PUBLISHED";
type SolveRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
type Queryable = Pick<PoolClient, "query">;

interface MonthRow {
  month_start: string;
  status: MonthStatus;
  collection_open_at: Date | null;
  collection_deadline: Date | null;
  locked_at: Date | null;
  published_at: Date | null;
  published_monthly_schedule_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MonthSummaryRow extends MonthRow {
  shifts_count: string;
}

interface MonthlyShiftRow {
  id: number;
  month_start: string;
  department_id: string;
  department_name: string;
  department_code: string;
  arrangement_id: string | null;
  arrangement_name: string | null;
  arrangement_code: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  label: string | null;
  created_at: Date;
  assignments_count?: string | null;
}

interface ShiftRequirementRow {
  shift_id: number;
  worker_type_id: string;
  worker_type_code: string;
  worker_type_name: string;
  required_count: number;
}

interface MonthlyRunRow {
  id: string;
  month_start: string;
  triggered_by: string;
  status: SolveRunStatus;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  solver_meta: Record<string, unknown> | null;
  created_at: Date;
}

interface MonthlyVersionRow {
  id: string;
  month_start: string;
  run_id: string;
  version_number: number;
  is_published: boolean;
  created_by: string;
  created_at: Date;
}

interface MonthlyVersionSummaryRow extends MonthlyVersionRow {
  assignment_count: string;
  solver_meta?: Record<string, unknown> | null;
}

interface MonthlyAssignmentInput {
  shiftId: number;
  userId: string;
  workerTypeId: string | null;
  departmentId: string | null;
  arrangementId: string | null;
}

interface WorkerPayloadRow {
  user_id: string;
  full_name: string;
  role: string;
  seniority_sort_order: number | null;
  worker_type_id: string | null;
  worker_type_code: string | null;
  worker_type_name: string | null;
  eligibility_worker_type_id: string | null;
  eligibility_worker_type_code: string | null;
  eligibility_worker_type_name: string | null;
  department_id: string | null;
  arrangement_id: string | null;
}

interface WorkerStatePayloadRow {
  id: string;
  user_id: string;
  state_type: string;
  priority: "HARD" | "SOFT";
  start_time: Date;
  end_time: Date;
  is_full_day: boolean;
  reason: string | null;
}

export interface MonthSummary {
  monthStart: string;
  status: MonthStatus;
  shiftsCount: number;
  collectionOpenAt: string | null;
  collectionDeadline: string | null;
  lockedAt: string | null;
  publishedAt: string | null;
  publishedMonthlyScheduleVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyShiftRequirement {
  workerTypeId: string;
  workerTypeCode: string;
  workerTypeName: string;
  count: number;
}

export interface MonthlyShift {
  id: number;
  monthStart: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  arrangementId: string | null;
  arrangementName: string | null;
  arrangementCode: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  label: string | null;
  assignmentsCount: number;
  requirements: MonthlyShiftRequirement[];
  createdAt: string;
}

export interface MonthlyRun {
  id: string;
  monthStart: string;
  triggeredBy: string;
  status: SolveRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  solverMeta: Record<string, unknown> | null;
  createdAt: string;
}

export interface MonthlyVersionSummary {
  id: string;
  monthStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
  solverMeta: Record<string, unknown> | null;
}

export interface DepartmentStatus {
  id: string;
  name: string;
  code: string;
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  inactiveBreakdown: Record<string, number>;
}

function mapMonth(row: MonthSummaryRow): MonthSummary {
  return {
    monthStart: row.month_start,
    status: row.status,
    shiftsCount: Number(row.shifts_count),
    collectionOpenAt: row.collection_open_at?.toISOString() ?? null,
    collectionDeadline: row.collection_deadline?.toISOString() ?? null,
    lockedAt: row.locked_at?.toISOString() ?? null,
    publishedAt: row.published_at?.toISOString() ?? null,
    publishedMonthlyScheduleVersionId: row.published_monthly_schedule_version_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRun(row: MonthlyRunRow): MonthlyRun {
  return {
    id: row.id,
    monthStart: row.month_start,
    triggeredBy: row.triggered_by,
    status: row.status,
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    errorMessage: row.error_message,
    solverMeta: row.solver_meta ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function mapVersion(row: MonthlyVersionSummaryRow): MonthlyVersionSummary {
  return {
    id: row.id,
    monthStart: row.month_start,
    runId: row.run_id,
    versionNumber: row.version_number,
    isPublished: row.is_published,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    assignmentCount: Number(row.assignment_count),
    solverMeta: row.solver_meta ?? null,
  };
}

export function normalizeMonthStart(input: string): string {
  const raw = input.trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(0, 7)}-01`;
  throw new Error("month must be YYYY-MM or YYYY-MM-DD");
}

function monthEndExclusive(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekSunday(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value != null);
}

async function ensureWeekForShift(client: Queryable, shiftDate: string): Promise<string> {
  const weekStart = startOfWeekSunday(shiftDate);
  await client.query(
    `INSERT INTO weeks (week_start)
     VALUES ($1)
     ON CONFLICT (week_start) DO NOTHING`,
    [weekStart],
  );
  return weekStart;
}

async function replaceShiftRequirements(
  client: Queryable,
  shiftId: number,
  requirements: Array<{ workerTypeId: string; count: number }>,
): Promise<void> {
  await client.query("DELETE FROM shift_requirements WHERE shift_id = $1", [shiftId]);

  for (const requirement of requirements) {
    if (requirement.count <= 0) continue;
    await client.query(
      `INSERT INTO shift_requirements (shift_id, worker_type_id, required_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (shift_id, worker_type_id) DO UPDATE
       SET required_count = EXCLUDED.required_count,
           updated_at = NOW()`,
      [shiftId, requirement.workerTypeId, requirement.count],
    );
  }
}

async function loadRequirementsForShiftIds(
  shiftIds: number[],
): Promise<Map<number, MonthlyShiftRequirement[]>> {
  const map = new Map<number, MonthlyShiftRequirement[]>();
  if (shiftIds.length === 0) return map;

  const result = await queryDatabase<ShiftRequirementRow>(
    `SELECT sr.shift_id,
            sr.worker_type_id::text AS worker_type_id,
            wt.code AS worker_type_code,
            wt.name AS worker_type_name,
            sr.required_count
     FROM shift_requirements sr
     INNER JOIN worker_types wt ON wt.id = sr.worker_type_id
     WHERE sr.shift_id = ANY($1::int[])
     ORDER BY wt.name ASC`,
    [shiftIds],
  );

  for (const row of result.rows) {
    const list = map.get(row.shift_id) ?? [];
    list.push({
      workerTypeId: row.worker_type_id,
      workerTypeCode: row.worker_type_code,
      workerTypeName: row.worker_type_name,
      count: row.required_count,
    });
    map.set(row.shift_id, list);
  }

  return map;
}

function mapShift(
  row: MonthlyShiftRow,
  requirementsByShift: Map<number, MonthlyShiftRequirement[]>,
): MonthlyShift {
  return {
    id: row.id,
    monthStart: row.month_start,
    departmentId: row.department_id,
    departmentName: row.department_name,
    departmentCode: row.department_code,
    arrangementId: row.arrangement_id,
    arrangementName: row.arrangement_name,
    arrangementCode: row.arrangement_code,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    label: row.label,
    assignmentsCount: Number(row.assignments_count ?? 0),
    requirements: requirementsByShift.get(row.id) ?? [],
    createdAt: row.created_at.toISOString(),
  };
}

export const MonthlyScheduleService = {
  async ensureMonth(monthStartInput: string): Promise<MonthSummary> {
    const monthStart = normalizeMonthStart(monthStartInput);
    const result = await queryDatabase<MonthSummaryRow>(
      `INSERT INTO months (month_start)
       VALUES ($1)
       ON CONFLICT (month_start) DO UPDATE SET month_start = EXCLUDED.month_start
       RETURNING month_start::text AS month_start,
                 status,
                 collection_open_at,
                 collection_deadline,
                 locked_at,
                 published_at,
                 published_monthly_schedule_version_id::text AS published_monthly_schedule_version_id,
                 created_at,
                 updated_at,
                 '0'::text AS shifts_count`,
      [monthStart],
    );

    return mapMonth(result.rows[0] as MonthSummaryRow);
  },

  async listMonths(): Promise<MonthSummary[]> {
    const result = await queryDatabase<MonthSummaryRow>(
      `SELECT m.month_start::text AS month_start,
              m.status,
              m.collection_open_at,
              m.collection_deadline,
              m.locked_at,
              m.published_at,
              m.published_monthly_schedule_version_id::text AS published_monthly_schedule_version_id,
              m.created_at,
              m.updated_at,
              COUNT(s.id)::text AS shifts_count
       FROM months m
       LEFT JOIN shifts s ON s.month_start = m.month_start
       GROUP BY m.month_start, m.status, m.collection_open_at, m.collection_deadline,
                m.locked_at, m.published_at, m.published_monthly_schedule_version_id,
                m.created_at, m.updated_at
       ORDER BY m.month_start DESC`,
    );

    return result.rows.map(mapMonth);
  },

  async openConstraintCollection(input: {
    monthStart: string;
    collectionDeadline: Date;
  }): Promise<MonthSummary> {
    const monthStart = normalizeMonthStart(input.monthStart);
    await this.ensureMonth(monthStart);

    const result = await queryDatabase<MonthSummaryRow>(
      `UPDATE months
       SET status = 'COLLECTING',
           collection_open_at = COALESCE(collection_open_at, NOW()),
           collection_deadline = $2,
           locked_at = NULL,
           updated_at = NOW()
       WHERE month_start = $1
       RETURNING month_start::text AS month_start,
                 status,
                 collection_open_at,
                 collection_deadline,
                 locked_at,
                 published_at,
                 published_monthly_schedule_version_id::text AS published_monthly_schedule_version_id,
                 created_at,
                 updated_at,
                 (SELECT COUNT(*)::text FROM shifts WHERE month_start = months.month_start) AS shifts_count`,
      [monthStart, input.collectionDeadline.toISOString()],
    );

    return mapMonth(result.rows[0] as MonthSummaryRow);
  },

  async lockMonth(monthStartInput: string): Promise<MonthSummary> {
    const monthStart = normalizeMonthStart(monthStartInput);
    await this.ensureMonth(monthStart);

    const result = await queryDatabase<MonthSummaryRow>(
      `UPDATE months
       SET status = 'LOCKED',
           locked_at = COALESCE(locked_at, NOW()),
           updated_at = NOW()
       WHERE month_start = $1
       RETURNING month_start::text AS month_start,
                 status,
                 collection_open_at,
                 collection_deadline,
                 locked_at,
                 published_at,
                 published_monthly_schedule_version_id::text AS published_monthly_schedule_version_id,
                 created_at,
                 updated_at,
                 (SELECT COUNT(*)::text FROM shifts WHERE month_start = months.month_start) AS shifts_count`,
      [monthStart],
    );

    return mapMonth(result.rows[0] as MonthSummaryRow);
  },

  async ensureArrangement(input: {
    departmentId: string;
    name: string;
    code: string;
  }): Promise<{ id: string; name: string; code: string }> {
    const result = await queryDatabase<{ id: string; name: string; code: string }>(
      `INSERT INTO arrangements (department_id, name, code)
       VALUES ($1, $2, $3)
       ON CONFLICT (department_id, code) DO UPDATE
       SET name = EXCLUDED.name,
           is_active = TRUE,
           updated_at = NOW()
       RETURNING id::text AS id, name, code`,
      [input.departmentId, input.name, input.code],
    );

    return result.rows[0] as { id: string; name: string; code: string };
  },

  async createShift(input: {
    monthStart: string;
    departmentId: string;
    arrangementId: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    label: string | null;
    requirements: Array<{ workerTypeId: string; count: number }>;
  }): Promise<MonthlyShift> {
    const monthStart = normalizeMonthStart(input.monthStart);
    const shift = await withDatabaseTransaction(async (client) => {
      await this.ensureMonth(monthStart);
      const weekStart = await ensureWeekForShift(client, input.shiftDate);

      const result = await client.query<MonthlyShiftRow>(
        `INSERT INTO shifts (
           week_start,
           month_start,
           department_id,
           arrangement_id,
           shift_date,
           start_time,
           end_time,
           label
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id,
                   month_start::text AS month_start,
                   department_id::text AS department_id,
                   ''::text AS department_name,
                   ''::text AS department_code,
                   arrangement_id::text AS arrangement_id,
                   NULL::text AS arrangement_name,
                   NULL::text AS arrangement_code,
                   shift_date::text AS shift_date,
                   start_time,
                   end_time,
                   label,
                   created_at`,
        [
          weekStart,
          monthStart,
          input.departmentId,
          input.arrangementId,
          input.shiftDate,
          input.startTime,
          input.endTime,
          input.label,
        ],
      );

      const created = result.rows[0] as MonthlyShiftRow;
      await replaceShiftRequirements(client, created.id, input.requirements);
      return created.id;
    });

    const loaded = await this.getMonthlyShiftById(shift);
    if (!loaded) throw new Error("Failed to load created monthly shift");
    return loaded;
  },

  async updateShift(input: {
    shiftId: number;
    arrangementId: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    label: string | null;
    requirements: Array<{ workerTypeId: string; count: number }>;
  }): Promise<MonthlyShift | null> {
    const updatedId = await withDatabaseTransaction(async (client) => {
      const existing = await client.query<{ month_start: string }>(
        `SELECT month_start::text AS month_start FROM shifts WHERE id = $1`,
        [input.shiftId],
      );
      if (!existing.rows[0]) return null;

      const weekStart = await ensureWeekForShift(client, input.shiftDate);
      const result = await client.query<{ id: number }>(
        `UPDATE shifts
         SET week_start = $2,
             arrangement_id = $3,
             shift_date = $4,
             start_time = $5,
             end_time = $6,
             label = $7
         WHERE id = $1
         RETURNING id`,
        [
          input.shiftId,
          weekStart,
          input.arrangementId,
          input.shiftDate,
          input.startTime,
          input.endTime,
          input.label,
        ],
      );

      if (!result.rows[0]) return null;
      await replaceShiftRequirements(client, input.shiftId, input.requirements);
      return input.shiftId;
    });

    return updatedId ? this.getMonthlyShiftById(updatedId) : null;
  },

  async getMonthlyShiftById(shiftId: number): Promise<MonthlyShift | null> {
    const result = await queryDatabase<MonthlyShiftRow>(
      `SELECT s.id,
              s.month_start::text AS month_start,
              d.id::text AS department_id,
              d.name AS department_name,
              d.code AS department_code,
              a.id::text AS arrangement_id,
              a.name AS arrangement_name,
              a.code AS arrangement_code,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              s.label,
              s.created_at,
              '0'::text AS assignments_count
       FROM shifts s
       INNER JOIN departments d ON d.id = s.department_id
       LEFT JOIN arrangements a ON a.id = s.arrangement_id
       WHERE s.id = $1
         AND s.month_start IS NOT NULL`,
      [shiftId],
    );

    const row = result.rows[0];
    if (!row) return null;
    const requirements = await loadRequirementsForShiftIds([row.id]);
    return mapShift(row, requirements);
  },

  async deleteShift(shiftId: number): Promise<boolean> {
    const result = await queryDatabase<{ id: number }>(
      `DELETE FROM shifts
       WHERE id = $1
         AND month_start IS NOT NULL
       RETURNING id`,
      [shiftId],
    );

    return (result.rowCount ?? 0) > 0;
  },

  async listDepartmentMonthPlan(input: {
    departmentId: string;
    monthStart: string;
  }): Promise<{
    department: { id: string; name: string; code: string };
    month: string;
    timezone: string;
    days: Array<{ date: string; shifts: MonthlyShift[] }>;
  }> {
    const monthStart = normalizeMonthStart(input.monthStart);
    await this.ensureMonth(monthStart);

    const departmentResult = await queryDatabase<{ id: string; name: string; code: string }>(
      `SELECT id::text AS id, name, code
       FROM departments
       WHERE id = $1`,
      [input.departmentId],
    );
    const department = departmentResult.rows[0];
    if (!department) throw new Error("Department not found");

    const result = await queryDatabase<MonthlyShiftRow>(
      `WITH latest_version AS (
         SELECT id
         FROM monthly_schedule_versions
         WHERE month_start = $1
         ORDER BY is_published DESC, version_number DESC
         LIMIT 1
       )
       SELECT s.id,
              s.month_start::text AS month_start,
              d.id::text AS department_id,
              d.name AS department_name,
              d.code AS department_code,
              a.id::text AS arrangement_id,
              a.name AS arrangement_name,
              a.code AS arrangement_code,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              s.label,
              s.created_at,
              COUNT(msa.id)::text AS assignments_count
       FROM shifts s
       INNER JOIN departments d ON d.id = s.department_id
       LEFT JOIN arrangements a ON a.id = s.arrangement_id
       LEFT JOIN latest_version lv ON TRUE
       LEFT JOIN monthly_schedule_assignments msa
         ON msa.shift_id = s.id
        AND msa.monthly_schedule_version_id = lv.id
       WHERE s.month_start = $1
         AND s.department_id = $2
       GROUP BY s.id, s.month_start, d.id, d.name, d.code, a.id, a.name, a.code,
                s.shift_date, s.start_time, s.end_time, s.label, s.created_at
       ORDER BY s.shift_date ASC, s.start_time ASC, s.id ASC`,
      [monthStart, input.departmentId],
    );

    const requirementsByShift = await loadRequirementsForShiftIds(result.rows.map((row) => row.id));
    const shifts = result.rows.map((row) => mapShift(row, requirementsByShift));
    const shiftsByDate = new Map<string, MonthlyShift[]>();
    for (const shift of shifts) {
      const list = shiftsByDate.get(shift.shiftDate) ?? [];
      list.push(shift);
      shiftsByDate.set(shift.shiftDate, list);
    }

    const days: Array<{ date: string; shifts: MonthlyShift[] }> = [];
    for (let current = monthStart; current < monthEndExclusive(monthStart); current = addDays(current, 1)) {
      days.push({ date: current, shifts: shiftsByDate.get(current) ?? [] });
    }

    return {
      department,
      month: monthStart.slice(0, 7),
      timezone: "Asia/Jerusalem",
      days,
    };
  },

  async listDepartmentStatuses(monthStartInput: string): Promise<DepartmentStatus[]> {
    const monthStart = normalizeMonthStart(monthStartInput);
    await this.ensureMonth(monthStart);
    const monthEnd = monthEndExclusive(monthStart);

    const result = await queryDatabase<{
      id: string;
      name: string;
      code: string;
      total_members: string;
      inactive_members: string;
      inactive_breakdown: Record<string, number> | null;
    }>(
      `WITH inactive AS (
         SELECT ws.user_id,
                ws.state_type
         FROM worker_states ws
         WHERE ws.month_start = $1
           AND ws.priority = 'HARD'
           AND ws.start_time < $2::date
           AND ws.end_time > $1::date
       ),
       dept_users AS (
         SELECT d.id,
                d.name,
                d.code,
                ud.user_id
         FROM departments d
         LEFT JOIN user_departments ud ON ud.department_id = d.id
         WHERE d.is_active = TRUE
       )
       SELECT du.id::text AS id,
              du.name,
              du.code,
              COUNT(DISTINCT du.user_id)::text AS total_members,
              COUNT(DISTINCT inactive.user_id)::text AS inactive_members,
              COALESCE(jsonb_object_agg(inactive.state_type, state_counts.count) FILTER (WHERE inactive.state_type IS NOT NULL), '{}'::jsonb)::json AS inactive_breakdown
       FROM dept_users du
       LEFT JOIN inactive ON inactive.user_id = du.user_id
       LEFT JOIN (
         SELECT user_id, state_type, COUNT(*)::int AS count
         FROM inactive
         GROUP BY user_id, state_type
       ) state_counts ON state_counts.user_id = inactive.user_id AND state_counts.state_type = inactive.state_type
       GROUP BY du.id, du.name, du.code
       ORDER BY du.name ASC`,
      [monthStart, monthEnd],
    );

    return result.rows.map((row) => {
      const totalMembers = Number(row.total_members);
      const inactiveMembers = Number(row.inactive_members);
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        totalMembers,
        inactiveMembers,
        activeMembers: Math.max(0, totalMembers - inactiveMembers),
        inactiveBreakdown: row.inactive_breakdown ?? {},
      };
    });
  },

  async listRunsByMonth(monthStartInput: string): Promise<MonthlyRun[]> {
    const monthStart = normalizeMonthStart(monthStartInput);
    const result = await queryDatabase<MonthlyRunRow>(
      `SELECT id::text AS id,
              month_start::text AS month_start,
              triggered_by,
              status,
              started_at,
              finished_at,
              error_message,
              solver_meta,
              created_at
       FROM monthly_schedule_runs
       WHERE month_start = $1
       ORDER BY created_at DESC`,
      [monthStart],
    );

    return result.rows.map(mapRun);
  },

  async listScheduleVersionsByMonth(monthStartInput: string): Promise<MonthlyVersionSummary[]> {
    const monthStart = normalizeMonthStart(monthStartInput);
    const result = await queryDatabase<MonthlyVersionSummaryRow>(
      `SELECT msv.id::text AS id,
              msv.month_start::text AS month_start,
              msv.run_id::text AS run_id,
              msv.version_number,
              msv.is_published,
              msv.created_by,
              msv.created_at,
              COUNT(msa.id)::text AS assignment_count,
              msr.solver_meta
       FROM monthly_schedule_versions msv
       LEFT JOIN monthly_schedule_assignments msa ON msa.monthly_schedule_version_id = msv.id
       LEFT JOIN monthly_schedule_runs msr ON msr.id = msv.run_id
       WHERE msv.month_start = $1
       GROUP BY msv.id, msv.month_start, msv.run_id, msv.version_number, msv.is_published,
                msv.created_by, msv.created_at, msr.solver_meta
       ORDER BY msv.version_number DESC`,
      [monthStart],
    );

    return result.rows.map(mapVersion);
  },

  async publishMonthlyScheduleVersion(versionId: string): Promise<MonthlyVersionSummary> {
    await withDatabaseTransaction(async (client) => {
      const versionResult = await client.query<MonthlyVersionRow>(
        `SELECT id::text AS id,
                month_start::text AS month_start,
                run_id::text AS run_id,
                version_number,
                is_published,
                created_by,
                created_at
         FROM monthly_schedule_versions
         WHERE id = $1`,
        [versionId],
      );
      const version = versionResult.rows[0];
      if (!version) {
        throw new Error("Monthly schedule version not found");
      }

      await client.query(
        `UPDATE monthly_schedule_versions
         SET is_published = FALSE
         WHERE month_start = $1`,
        [version.month_start],
      );
      await client.query(
        `UPDATE monthly_schedule_versions
         SET is_published = TRUE
         WHERE id = $1`,
        [version.id],
      );
      await client.query(
        `UPDATE months
         SET status = 'PUBLISHED',
             published_at = NOW(),
             published_monthly_schedule_version_id = $2,
             updated_at = NOW()
         WHERE month_start = $1`,
        [version.month_start, version.id],
      );
    });

    const result = await queryDatabase<MonthlyVersionSummaryRow>(
      `SELECT msv.id::text AS id,
              msv.month_start::text AS month_start,
              msv.run_id::text AS run_id,
              msv.version_number,
              msv.is_published,
              msv.created_by,
              msv.created_at,
              COUNT(msa.id)::text AS assignment_count,
              msr.solver_meta
       FROM monthly_schedule_versions msv
       LEFT JOIN monthly_schedule_assignments msa ON msa.monthly_schedule_version_id = msv.id
       LEFT JOIN monthly_schedule_runs msr ON msr.id = msv.run_id
       WHERE msv.id = $1
       GROUP BY msv.id, msv.month_start, msv.run_id, msv.version_number, msv.is_published,
                msv.created_by, msv.created_at, msr.solver_meta`,
      [versionId],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Monthly schedule version not found");
    return mapVersion(row);
  },

  async queueMonthSolve(input: {
    monthStart: string;
    triggeredBy: string;
  }): Promise<MonthlyRun> {
    const monthStart = normalizeMonthStart(input.monthStart);
    await this.ensureMonth(monthStart);

    const shiftCountResult = await queryDatabase<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM shifts
       WHERE month_start = $1`,
      [monthStart],
    );
    if (Number(shiftCountResult.rows[0]?.count ?? 0) <= 0) {
      throw new Error("Month has no shifts to solve");
    }

    const activeRunResult = await queryDatabase<{ id: string }>(
      `SELECT id::text AS id
       FROM monthly_schedule_runs
       WHERE month_start = $1
         AND status IN ('QUEUED', 'RUNNING')
       LIMIT 1`,
      [monthStart],
    );
    if ((activeRunResult.rowCount ?? 0) > 0) {
      throw new Error("A solver run is already active for this month");
    }

    await queryDatabase(
      `UPDATE months
       SET status = 'LOCKED',
           locked_at = COALESCE(locked_at, NOW()),
           updated_at = NOW()
       WHERE month_start = $1`,
      [monthStart],
    );

    const inserted = await queryDatabase<MonthlyRunRow>(
      `INSERT INTO monthly_schedule_runs (month_start, triggered_by, status, solver_meta)
       VALUES ($1, $2, 'QUEUED', '{}'::jsonb)
       RETURNING id::text AS id,
                 month_start::text AS month_start,
                 triggered_by,
                 status,
                 started_at,
                 finished_at,
                 error_message,
                 solver_meta,
                 created_at`,
      [monthStart, input.triggeredBy],
    );

    const run = mapRun(inserted.rows[0] as MonthlyRunRow);
    void this.executeQueuedMonthRun(run.id);
    return run;
  },

  async executeQueuedMonthRun(runId: string): Promise<void> {
    const runningResult = await queryDatabase<MonthlyRunRow>(
      `UPDATE monthly_schedule_runs
       SET status = 'RUNNING',
           started_at = COALESCE(started_at, NOW())
       WHERE id = $1
         AND status = 'QUEUED'
       RETURNING id::text AS id,
                 month_start::text AS month_start,
                 triggered_by,
                 status,
                 started_at,
                 finished_at,
                 error_message,
                 solver_meta,
                 created_at`,
      [runId],
    );

    const run = runningResult.rows[0];
    if (!run) return;

    try {
      const payload = await this.buildMonthlySolverPayload(run.month_start);
      const solverResponse = await SolverService.solveMonth(payload);

      if (solverResponse.status !== "feasible") {
        throw new Error(solverResponse.message ?? "Solver reported infeasible");
      }

      const normalizedAssignments = this.validateMonthlyAssignments({
        assignments: solverResponse.assignments,
        shifts: payload.shifts as Array<{ id: number; department_id?: string; arrangement_id?: string | null }>,
        workers: payload.workers as Array<{ id: string; user_id?: string; worker_type_id?: string | null }>,
      });

      const version = await this.persistSolvedMonthlyVersion({
        monthStart: run.month_start,
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
        `UPDATE monthly_schedule_runs
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
        `UPDATE monthly_schedule_runs
         SET status = 'FAILED',
             finished_at = NOW(),
             error_message = $2
         WHERE id = $1`,
        [runId, message],
      );
    }
  },

  async buildMonthlySolverPayload(monthStartInput: string): Promise<Record<string, unknown>> {
    const monthStart = normalizeMonthStart(monthStartInput);
    const monthEnd = monthEndExclusive(monthStart);

    const shiftsResult = await queryDatabase<MonthlyShiftRow>(
      `SELECT s.id,
              s.month_start::text AS month_start,
              d.id::text AS department_id,
              d.name AS department_name,
              d.code AS department_code,
              a.id::text AS arrangement_id,
              a.name AS arrangement_name,
              a.code AS arrangement_code,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              s.label,
              s.created_at,
              '0'::text AS assignments_count
       FROM shifts s
       INNER JOIN departments d ON d.id = s.department_id
       LEFT JOIN arrangements a ON a.id = s.arrangement_id
       WHERE s.month_start = $1
       ORDER BY s.shift_date ASC, s.start_time ASC, s.id ASC`,
      [monthStart],
    );
    const requirementsByShift = await loadRequirementsForShiftIds(shiftsResult.rows.map((row) => row.id));

    const workerRows = await queryDatabase<WorkerPayloadRow>(
      `SELECT u.id AS user_id,
              u.full_name,
              u.role,
              s.sort_order AS seniority_sort_order,
              u.worker_type_id::text AS worker_type_id,
              uwt.code AS worker_type_code,
              uwt.name AS worker_type_name,
              we.worker_type_id::text AS eligibility_worker_type_id,
              ewt.code AS eligibility_worker_type_code,
              ewt.name AS eligibility_worker_type_name,
              ud.department_id::text AS department_id,
              we.arrangement_id::text AS arrangement_id
       FROM users u
       LEFT JOIN seniorities s ON s.id = u.seniority_id
       LEFT JOIN worker_types uwt ON uwt.id = u.worker_type_id
       LEFT JOIN worker_eligibilities we
         ON we.user_id = u.id
        AND (we.month_start IS NULL OR we.month_start = $1)
       LEFT JOIN worker_types ewt ON ewt.id = we.worker_type_id
       LEFT JOIN user_departments ud ON ud.user_id = u.id
       WHERE u.role <> 'admin'
         AND (u.worker_type_id IS NOT NULL OR we.worker_type_id IS NOT NULL)
       ORDER BY u.id ASC`,
      [monthStart],
    );

    const workerMap = new Map<string, {
      id: string;
      user_id: string;
      worker_type_id: string | null;
      worker_type: string;
      name: string;
      seniority: number;
      department_ids: Set<string>;
      arrangement_ids: Set<string>;
    }>();

    for (const row of workerRows.rows) {
      const workerTypeId = row.eligibility_worker_type_id ?? row.worker_type_id;
      const workerTypeCode = row.eligibility_worker_type_code ?? row.worker_type_code;
      if (!workerTypeId || !workerTypeCode) continue;

      const key = `${row.user_id}:${workerTypeId}`;
      const current = workerMap.get(key) ?? {
        id: key,
        user_id: row.user_id,
        worker_type_id: workerTypeId,
        worker_type: workerTypeCode,
        name: row.full_name,
        seniority: row.seniority_sort_order ?? 0,
        department_ids: new Set<string>(),
        arrangement_ids: new Set<string>(),
      };

      if (row.department_id) current.department_ids.add(row.department_id);
      if (row.arrangement_id) current.arrangement_ids.add(row.arrangement_id);
      workerMap.set(key, current);
    }

    const statesResult = await queryDatabase<WorkerStatePayloadRow>(
      `SELECT id::text AS id,
              user_id,
              state_type,
              priority,
              start_time,
              end_time,
              is_full_day,
              reason
       FROM worker_states
       WHERE month_start = $1
          OR (start_time < $2::date AND end_time > $1::date)
       ORDER BY start_time ASC`,
      [monthStart, monthEnd],
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
      `SELECT id::text AS id,
              user_id,
              start_time,
              end_time,
              priority,
              reason,
              is_full_day
       FROM constraints
       WHERE start_time < $2::date
         AND end_time > $1::date
       ORDER BY start_time ASC`,
      [monthStart, monthEnd],
    );

    return {
      month: monthStart.slice(0, 7),
      workers: Array.from(workerMap.values()).map((worker) => ({
        id: worker.id,
        user_id: worker.user_id,
        worker_type_id: worker.worker_type_id,
        worker_type: worker.worker_type,
        name: worker.name,
        seniority: worker.seniority,
        department_ids: Array.from(worker.department_ids),
        arrangement_ids: Array.from(worker.arrangement_ids),
      })),
      shifts: shiftsResult.rows.map((shift) => ({
        id: shift.id,
        department_id: shift.department_id,
        arrangement_id: shift.arrangement_id,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        label: shift.label,
        requirements: (requirementsByShift.get(shift.id) ?? []).map((requirement) => ({
          worker_type: requirement.workerTypeCode,
          worker_type_id: requirement.workerTypeId,
          count: requirement.count,
        })),
      })),
      constraints: constraintsResult.rows.map((constraint) => ({
        id: constraint.id,
        worker_id: constraint.user_id,
        user_id: constraint.user_id,
        start_time: constraint.start_time.toISOString(),
        end_time: constraint.end_time.toISOString(),
        priority: constraint.priority,
        reason: constraint.reason,
        is_full_day: constraint.is_full_day,
      })),
      worker_states: statesResult.rows.map((state) => ({
        id: state.id,
        worker_id: state.user_id,
        user_id: state.user_id,
        state: state.state_type,
        priority: state.priority,
        start_time: state.start_time.toISOString(),
        end_time: state.end_time.toISOString(),
        is_full_day: state.is_full_day,
        reason: state.reason,
      })),
    };
  },

  validateMonthlyAssignments(input: {
    assignments: Array<{
      shift_id: number | string;
      user_id: string;
      worker_id?: string;
      solver_worker_id?: string;
      worker_type?: string;
      department_id?: string | null;
      arrangement_id?: string | null;
    }>;
    shifts: Array<{ id: number; department_id?: string; arrangement_id?: string | null }>;
    workers: Array<{ id: string; user_id?: string; worker_type_id?: string | null }>;
  }): MonthlyAssignmentInput[] {
    const shiftsById = new Map(input.shifts.map((shift) => [String(shift.id), shift]));
    const workersById = new Map(input.workers.map((worker) => [worker.id, worker]));
    const usersByRealId = new Map(input.workers.map((worker) => [worker.user_id ?? worker.id, worker]));
    const seen = new Set<string>();

    return input.assignments.map((assignment) => {
      const shift = shiftsById.get(String(assignment.shift_id));
      if (!shift) {
        throw new Error(`Solver returned assignment for unknown shift_id ${assignment.shift_id}`);
      }

      const worker = workersById.get(assignment.solver_worker_id ?? assignment.worker_id ?? assignment.user_id)
        ?? usersByRealId.get(assignment.user_id);
      if (!worker) {
        throw new Error(`Solver returned assignment for unknown user_id ${assignment.user_id}`);
      }

      const realUserId = worker.user_id ?? assignment.user_id;
      const dedupeKey = `${shift.id}:${realUserId}`;
      if (seen.has(dedupeKey)) {
        throw new Error(`Solver returned duplicate assignment ${dedupeKey}`);
      }
      seen.add(dedupeKey);

      return {
        shiftId: shift.id,
        userId: realUserId,
        workerTypeId: worker.worker_type_id ?? null,
        departmentId: assignment.department_id ?? shift.department_id ?? null,
        arrangementId: assignment.arrangement_id ?? shift.arrangement_id ?? null,
      };
    });
  },

  async persistSolvedMonthlyVersion(input: {
    monthStart: string;
    runId: string;
    createdBy: string;
    assignments: MonthlyAssignmentInput[];
  }): Promise<MonthlyVersionRow> {
    const monthStart = normalizeMonthStart(input.monthStart);

    return withDatabaseTransaction(async (client) => {
      const versionResult = await client.query<MonthlyVersionRow>(
        `INSERT INTO monthly_schedule_versions (month_start, run_id, version_number, created_by)
         VALUES (
           $1,
           $2,
           COALESCE((SELECT MAX(version_number) + 1 FROM monthly_schedule_versions WHERE month_start = $1), 1),
           $3
         )
         RETURNING id::text AS id,
                   month_start::text AS month_start,
                   run_id::text AS run_id,
                   version_number,
                   is_published,
                   created_by,
                   created_at`,
        [monthStart, input.runId, input.createdBy],
      );
      const version = versionResult.rows[0] as MonthlyVersionRow;

      for (const assignment of input.assignments) {
        await client.query(
          `INSERT INTO monthly_schedule_assignments (
             monthly_schedule_version_id,
             shift_id,
             user_id,
             worker_type_id,
             department_id,
             arrangement_id,
             source
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'solver')`,
          [
            version.id,
            assignment.shiftId,
            assignment.userId,
            assignment.workerTypeId,
            assignment.departmentId,
            assignment.arrangementId,
          ],
        );
      }

      await client.query(
        `UPDATE months
         SET status = 'SOLVED',
             updated_at = NOW()
         WHERE month_start = $1`,
        [monthStart],
      );

      return version;
    });
  },
};
