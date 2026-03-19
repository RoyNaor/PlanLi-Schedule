import { queryDatabase } from "./database.service.js";

export type WeekStatus = "DRAFT" | "COLLECTING" | "LOCKED" | "SOLVED" | "PUBLISHED";

interface ShiftRow {
  id: number;
  week_start: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  min_doctors: number;
  min_nurses: number;
  created_at: Date;
}

interface ShiftWeekRow {
  week_start: string;
  created_at: Date;
  status: WeekStatus;
  collection_open_at: Date | null;
  collection_deadline: Date | null;
  locked_at: Date | null;
}

interface WeekSummaryRow extends ShiftWeekRow {
  shifts_count: string;
}

interface WeekWithShiftCountRow extends ShiftWeekRow {
  shifts_count: string;
}

interface CreateShiftInput {
  weekStart: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
}

interface UpdateShiftInput {
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
}

interface DuplicateWeekShiftsInput {
  sourceWeekStart: string;
  targetWeekStart: string;
}

export interface WeekSummary {
  weekStart: string;
  createdAt: string;
  shiftsCount: number;
  status: WeekStatus;
  collectionOpenAt: string | null;
  collectionDeadline: string | null;
  lockedAt: string | null;
}

export interface WeekLifecycle {
  weekStart: string;
  createdAt: string;
  status: WeekStatus;
  collectionOpenAt: string | null;
  collectionDeadline: string | null;
  lockedAt: string | null;
}

export interface Shift {
  id: number;
  weekStart: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
  createdAt: string;
}

function mapWeekSummary(row: WeekSummaryRow): WeekSummary {
  return {
    weekStart: row.week_start,
    createdAt: row.created_at.toISOString(),
    shiftsCount: Number(row.shifts_count),
    status: row.status,
    collectionOpenAt: row.collection_open_at ? row.collection_open_at.toISOString() : null,
    collectionDeadline: row.collection_deadline ? row.collection_deadline.toISOString() : null,
    lockedAt: row.locked_at ? row.locked_at.toISOString() : null,
  };
}

function mapWeekLifecycle(row: ShiftWeekRow): WeekLifecycle {
  return {
    weekStart: row.week_start,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    collectionOpenAt: row.collection_open_at ? row.collection_open_at.toISOString() : null,
    collectionDeadline: row.collection_deadline ? row.collection_deadline.toISOString() : null,
    lockedAt: row.locked_at ? row.locked_at.toISOString() : null,
  };
}

function mapShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    weekStart: row.week_start,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    minDoctors: row.min_doctors,
    minNurses: row.min_nurses,
    createdAt: row.created_at.toISOString(),
  };
}

export const ShiftService = {
  async lockExpiredCollectionWeeks(): Promise<number> {
    const result = await queryDatabase<{ week_start: string }>(
      `UPDATE weeks
       SET status = 'LOCKED',
           locked_at = COALESCE(locked_at, NOW())
       WHERE status = 'COLLECTING'
         AND collection_deadline IS NOT NULL
         AND collection_deadline <= NOW()
       RETURNING week_start::text AS week_start`,
    );

    return result.rowCount ?? 0;
  },

  async getWeekLifecycle(weekStart: string): Promise<WeekLifecycle | null> {
    await this.lockExpiredCollectionWeeks();

    const result = await queryDatabase<ShiftWeekRow>(
      `SELECT week_start::text AS week_start,
              created_at,
              status,
              collection_open_at,
              collection_deadline,
              locked_at
       FROM weeks
       WHERE week_start = $1`,
      [weekStart],
    );

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    return mapWeekLifecycle(result.rows[0] as ShiftWeekRow);
  },

  async getShiftById(shiftId: number): Promise<Shift | null> {
    const result = await queryDatabase<ShiftRow>(
      `SELECT id, week_start::text AS week_start, shift_date::text AS shift_date,
              start_time, end_time, min_doctors, min_nurses, created_at
       FROM shifts
       WHERE id = $1`,
      [shiftId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapShift(result.rows[0] as ShiftRow);
  },

  async listWeeks(): Promise<WeekSummary[]> {
    await this.lockExpiredCollectionWeeks();

    const result = await queryDatabase<WeekSummaryRow>(
      `SELECT w.week_start::text AS week_start,
              w.created_at,
              w.status,
              w.collection_open_at,
              w.collection_deadline,
              w.locked_at,
              COUNT(s.id) AS shifts_count
       FROM weeks w
       LEFT JOIN shifts s ON s.week_start = w.week_start
       GROUP BY w.week_start, w.created_at, w.status, w.collection_open_at, w.collection_deadline, w.locked_at
       ORDER BY w.week_start DESC`,
    );

    return result.rows.map(mapWeekSummary);
  },

  // Creates a planning week row if it does not already exist.
  async ensureWeek(weekStart: string): Promise<ShiftWeekRow> {
    const result = await queryDatabase<ShiftWeekRow>(
      `INSERT INTO weeks (week_start)
       VALUES ($1)
       ON CONFLICT (week_start) DO UPDATE SET week_start = EXCLUDED.week_start
       RETURNING week_start::text AS week_start,
                 created_at,
                 status,
                 collection_open_at,
                 collection_deadline,
                 locked_at`,
      [weekStart],
    );

    return result.rows[0] as ShiftWeekRow;
  },

  async openConstraintCollection(input: {
    weekStart: string;
    collectionDeadline: Date;
  }): Promise<WeekLifecycle> {
    await this.lockExpiredCollectionWeeks();

    const weekResult = await queryDatabase<WeekWithShiftCountRow>(
      `SELECT w.week_start::text AS week_start,
              w.created_at,
              w.status,
              w.collection_open_at,
              w.collection_deadline,
              w.locked_at,
              COUNT(s.id)::text AS shifts_count
       FROM weeks w
       LEFT JOIN shifts s ON s.week_start = w.week_start
       WHERE w.week_start = $1
       GROUP BY w.week_start, w.created_at, w.status, w.collection_open_at, w.collection_deadline, w.locked_at`,
      [input.weekStart],
    );

    const weekRow = weekResult.rows[0];
    if (!weekRow) {
      throw new Error("Week not found");
    }

    const shiftsCount = Number(weekRow.shifts_count);
    if (shiftsCount <= 0) {
      throw new Error("Cannot open collection for a week with no shifts");
    }

    if (weekRow.status === "LOCKED" || weekRow.status === "SOLVED" || weekRow.status === "PUBLISHED") {
      throw new Error(`Week is already ${weekRow.status} and cannot reopen collection`);
    }

    const updated = await queryDatabase<ShiftWeekRow>(
      `UPDATE weeks
       SET status = 'COLLECTING',
           collection_open_at = COALESCE(collection_open_at, NOW()),
           collection_deadline = $2,
           locked_at = NULL
       WHERE week_start = $1
       RETURNING week_start::text AS week_start,
                 created_at,
                 status,
                 collection_open_at,
                 collection_deadline,
                 locked_at`,
      [input.weekStart, input.collectionDeadline.toISOString()],
    );

    return mapWeekLifecycle(updated.rows[0] as ShiftWeekRow);
  },

  async lockWeek(weekStart: string): Promise<WeekLifecycle> {
    await this.lockExpiredCollectionWeeks();

    const existing = await this.getWeekLifecycle(weekStart);
    if (!existing) {
      throw new Error("Week not found");
    }

    if (existing.status === "LOCKED") {
      return existing;
    }

    if (existing.status !== "COLLECTING") {
      throw new Error("Only COLLECTING weeks can be locked");
    }

    const result = await queryDatabase<ShiftWeekRow>(
      `UPDATE weeks
       SET status = 'LOCKED',
           locked_at = COALESCE(locked_at, NOW())
       WHERE week_start = $1
       RETURNING week_start::text AS week_start,
                 created_at,
                 status,
                 collection_open_at,
                 collection_deadline,
                 locked_at`,
      [weekStart],
    );

    return mapWeekLifecycle(result.rows[0] as ShiftWeekRow);
  },

  // Persists one shift linked to an existing (or newly created) week bucket.
  async createShift(input: CreateShiftInput): Promise<Shift> {
    await this.ensureWeek(input.weekStart);

    const result = await queryDatabase<ShiftRow>(
      `INSERT INTO shifts (week_start, shift_date, start_time, end_time, min_doctors, min_nurses)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, week_start::text AS week_start, shift_date::text AS shift_date,
                 start_time, end_time, min_doctors, min_nurses, created_at`,
      [
        input.weekStart,
        input.shiftDate,
        input.startTime,
        input.endTime,
        input.minDoctors,
        input.minNurses,
      ],
    );

    return mapShift(result.rows[0] as ShiftRow);
  },

  async updateShiftById(shiftId: number, input: UpdateShiftInput): Promise<Shift | null> {
    const result = await queryDatabase<ShiftRow>(
      `UPDATE shifts
       SET shift_date = $2,
           start_time = $3,
           end_time = $4,
           min_doctors = $5,
           min_nurses = $6
       WHERE id = $1
       RETURNING id, week_start::text AS week_start, shift_date::text AS shift_date,
                 start_time, end_time, min_doctors, min_nurses, created_at`,
      [
        shiftId,
        input.shiftDate,
        input.startTime,
        input.endTime,
        input.minDoctors,
        input.minNurses,
      ],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapShift(result.rows[0] as ShiftRow);
  },

  async deleteShiftById(shiftId: number): Promise<boolean> {
    const result = await queryDatabase<{ id: number }>(
      `DELETE FROM shifts
       WHERE id = $1
       RETURNING id`,
      [shiftId],
    );

    return (result.rowCount ?? 0) > 0;
  },

  async deleteWeek(weekStart: string): Promise<boolean> {
    const result = await queryDatabase<{ week_start: string }>(
      `DELETE FROM weeks
       WHERE week_start = $1
       RETURNING week_start::text AS week_start`,
      [weekStart],
    );

    return (result.rowCount ?? 0) > 0;
  },

  // Lists shifts for one scheduling week sorted by date/time.
  async listShiftsByWeek(weekStart: string): Promise<Shift[]> {
    const result = await queryDatabase<ShiftRow>(
      `SELECT id, week_start::text AS week_start, shift_date::text AS shift_date,
              start_time, end_time, min_doctors, min_nurses, created_at
       FROM shifts
       WHERE week_start = $1
       ORDER BY shift_date ASC, start_time ASC`,
      [weekStart],
    );

    return result.rows.map(mapShift);
  },

  async duplicateWeekShifts(input: DuplicateWeekShiftsInput): Promise<{ copiedCount: number }> {
    if (input.sourceWeekStart === input.targetWeekStart) {
      throw new Error("source_week_start and target_week_start must be different");
    }

    await this.ensureWeek(input.targetWeekStart);

    const targetCountResult = await queryDatabase<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM shifts
       WHERE week_start = $1`,
      [input.targetWeekStart],
    );
    const targetShiftCount = Number(targetCountResult.rows[0]?.count ?? 0);
    if (targetShiftCount > 0) {
      throw new Error("Target week already has shifts");
    }

    const insertResult = await queryDatabase<ShiftRow>(
      `INSERT INTO shifts (week_start, shift_date, start_time, end_time, min_doctors, min_nurses)
       SELECT $2::date AS week_start,
              ($2::date + (s.shift_date - $1::date))::date AS shift_date,
              s.start_time,
              s.end_time,
              s.min_doctors,
              s.min_nurses
       FROM shifts s
       WHERE s.week_start = $1
       RETURNING id, week_start::text AS week_start, shift_date::text AS shift_date,
                 start_time, end_time, min_doctors, min_nurses, created_at`,
      [input.sourceWeekStart, input.targetWeekStart],
    );

    if ((insertResult.rowCount ?? 0) === 0) {
      throw new Error("Source week has no shifts to duplicate");
    }

    return {
      copiedCount: insertResult.rowCount ?? 0,
    };
  },
};
