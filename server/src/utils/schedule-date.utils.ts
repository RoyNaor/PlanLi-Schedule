const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Validates strict ISO calendar date strings (YYYY-MM-DD).
export function isIsoDateString(value: string): boolean {
  if (!isoDateRegex.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Validates 24-hour clock strings (HH:mm) used by shift start and end times.
export function isTimeString(value: string): boolean {
  return hhmmRegex.test(value);
}

// Ensures the shift_date belongs to the given week_start date [week_start, week_start + 6 days].
export function isDateInsideWeek(weekStart: string, shiftDate: string): boolean {
  const weekStartDate = new Date(`${weekStart}T00:00:00.000Z`);
  const shiftDateValue = new Date(`${shiftDate}T00:00:00.000Z`);

  if (Number.isNaN(weekStartDate.getTime()) || Number.isNaN(shiftDateValue.getTime())) {
    return false;
  }

  const diffInDays = Math.floor(
    (shiftDateValue.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diffInDays >= 0 && diffInDays <= 6;
}

// Returns the current date string in Israel's local timezone (Asia/Jerusalem).
export function getJerusalemTodayIsoDate(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(now);
}
