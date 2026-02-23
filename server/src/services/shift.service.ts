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

interface CreateShiftInput {
  weekStart: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
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
