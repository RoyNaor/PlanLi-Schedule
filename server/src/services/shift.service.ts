import { queryDatabase } from "./database.service.js";

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
}

interface WeekSummaryRow {
  week_start: string;
  created_at: Date;
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

export interface WeekSummary {
  weekStart: string;
  createdAt: string;
  shiftsCount: number;
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
  async getShiftById(shiftId: number): Promise<Shift | null> {
    const result = await queryDatabase<ShiftRow>(
      `SELECT id, week_start, shift_date, start_time, end_time, min_doctors, min_nurses, created_at
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
    const result = await queryDatabase<WeekSummaryRow>(
      `SELECT w.week_start, w.created_at, COUNT(s.id) AS shifts_count
       FROM weeks w
       LEFT JOIN shifts s ON s.week_start = w.week_start
       GROUP BY w.week_start, w.created_at
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
       RETURNING week_start, created_at`,
      [weekStart],
    );

    return result.rows[0] as ShiftWeekRow;
  },

  // Persists one shift linked to an existing (or newly created) week bucket.
  async createShift(input: CreateShiftInput): Promise<Shift> {
    await this.ensureWeek(input.weekStart);

    const result = await queryDatabase<ShiftRow>(
      `INSERT INTO shifts (week_start, shift_date, start_time, end_time, min_doctors, min_nurses)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, week_start, shift_date, start_time, end_time, min_doctors, min_nurses, created_at`,
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
       RETURNING id, week_start, shift_date, start_time, end_time, min_doctors, min_nurses, created_at`,
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
       RETURNING week_start`,
      [weekStart],
    );

    return (result.rowCount ?? 0) > 0;
  },

  // Lists shifts for one scheduling week sorted by date/time.
  async listShiftsByWeek(weekStart: string): Promise<Shift[]> {
    const result = await queryDatabase<ShiftRow>(
      `SELECT id, week_start, shift_date, start_time, end_time, min_doctors, min_nurses, created_at
       FROM shifts
       WHERE week_start = $1
       ORDER BY shift_date ASC, start_time ASC`,
      [weekStart],
    );

    return result.rows.map(mapShift);
  },
};
