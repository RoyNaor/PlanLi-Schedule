function isIsoDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

const israelIsoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function normalizeApiDateToIso(value: string | null | undefined) {
  if (!value) return "";
  if (isIsoDate(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return israelIsoDateFormatter.format(parsed);
}

export function getJerusalemTodayIsoDate(now: Date = new Date()) {
  return israelIsoDateFormatter.format(now);
}

export function normalizeApiTimeToHourMinute(value: string | null | undefined) {
  if (!value) return "";

  const trimmed = value.trim();
  const hourMinuteMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (hourMinuteMatch) {
    return `${hourMinuteMatch[1]}:${hourMinuteMatch[2]}`;
  }

  const withSecondsMatch = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(trimmed);
  if (withSecondsMatch) {
    return `${withSecondsMatch[1]}:${withSecondsMatch[2]}`;
  }

  return "";
}

export function parseIsoDateToUtc(isoDate: string) {
  // רק אם זה YYYY-MM-DD
  if (!isIsoDate(isoDate)) return new Date(NaN);
  return new Date(`${isoDate}T00:00:00Z`);
}

export function formatUtcDateToIso(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function addDaysToIsoDate(isoDate: string, days: number) {
  const date = parseIsoDateToUtc(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDateToIso(date);
}

// week start = Sunday
export function startOfWeekSundayIso(isoDate: string) {
  const date = parseIsoDateToUtc(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDay(); // 0=Sunday
  date.setUTCDate(date.getUTCDate() - day);
  return formatUtcDateToIso(date);
}

export function getWeekDates(weekStart: string) {
  if (!weekStart || !isIsoDate(weekStart)) return [];
  const days = Array.from({ length: 7 }, (_, i) => addDaysToIsoDate(weekStart, i));
  // אם אחד הימים יצא לא תקין – מחזירים ריק ולא מפוצצים את UI
  if (days.some((d) => !d)) return [];
  return days;
}


/** First calendar day of the month (YYYY-MM-01) for the given ISO date. */
export function firstOfMonthIso(isoDate: string) {
  if (!isIsoDate(isoDate)) return "";
  return `${isoDate.slice(0, 7)}-01`;
}

/**
 * Shifts a calendar YYYY-MM-DD by `delta` months (clamps day to the last day of the target month).
 * Uses UTC date math consistent with `addDaysToIsoDate`.
 */
export function addMonthsToIsoDate(isoDate: string, delta: number) {
  if (!isIsoDate(isoDate)) return "";
  const y = Number(isoDate.slice(0, 4));
  const m0 = Number(isoDate.slice(5, 7)) - 1;
  const d = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m0) || !Number.isFinite(d)) return "";
  const totalM = m0 + delta;
  const year = y + Math.floor(totalM / 12);
  const month = ((totalM % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Last calendar day of the month containing `isoDate`. */
export function lastOfMonthIso(isoDate: string) {
  const first = firstOfMonthIso(isoDate);
  if (!first) return "";
  const nextMonthFirst = addMonthsToIsoDate(first, 1);
  if (!nextMonthFirst) return "";
  return addDaysToIsoDate(nextMonthFirst, -1);
}

function compareIsoDate(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function daysFromIsoToIso(startIso: string, endIso: string): number {
  const s = parseIsoDateToUtc(startIso);
  const e = parseIsoDateToUtc(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return NaN;
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

/**
 * All Sunday `week_start` values whose week (Sun–Sat) intersects [startIso, endIso] inclusive.
 */
export function getWeekStartsOverlappingRange(startIso: string, endIso: string) {
  if (!isIsoDate(startIso) || !isIsoDate(endIso)) return [];
  if (compareIsoDate(startIso, endIso) > 0) return [];
  const w0 = startOfWeekSundayIso(startIso);
  const wN = startOfWeekSundayIso(endIso);
  if (!w0 || !wN) return [];
  const out: string[] = [];
  for (let w = w0; compareIsoDate(w, wN) <= 0; w = addDaysToIsoDate(w, 7)) {
    if (w) out.push(w);
  }
  return out;
}

export function getIsoYearFromDate(isoDate: string) {
  if (!isIsoDate(isoDate)) return NaN;
  return Number(isoDate.slice(0, 4));
}

/** Week starts (Sundays) that overlap any day in the given ISO year. */
export function getWeekStartsInIsoYear(year: number) {
  if (!Number.isInteger(year) || year < 1000) return [];
  return getWeekStartsOverlappingRange(
    `${year}-01-01`,
    `${year}-12-31`,
  );
}

export type MonthMatrixCell = {
  iso: string;
  inMonth: boolean;
  weekStart: string;
};

/**
 * Sunday-first calendar grid cells for the month containing `anchorIso` (5–6 rows × 7 days).
 * Out-of-month days are included for padding, with `inMonth: false`.
 */
export function getCalendarMonthMatrix(anchorIso: string): MonthMatrixCell[] {
  if (!isIsoDate(anchorIso)) return [];
  const firstM = firstOfMonthIso(anchorIso);
  const lastM = lastOfMonthIso(anchorIso);
  if (!firstM || !lastM) return [];
  const firstSun = startOfWeekSundayIso(firstM);
  const lastSun = startOfWeekSundayIso(lastM);
  if (!firstSun || !lastSun) return [];
  const endSat = addDaysToIsoDate(lastSun, 6);
  if (!endSat) return [];
  const span = daysFromIsoToIso(firstSun, endSat);
  if (Number.isNaN(span) || span < 0) return [];
  const cells: MonthMatrixCell[] = [];
  for (let i = 0; i <= span; i++) {
    const iso = addDaysToIsoDate(firstSun, i);
    if (!iso) break;
    const inMonth = compareIsoDate(iso, firstM) >= 0 && compareIsoDate(iso, lastM) <= 0;
    const weekStart = startOfWeekSundayIso(iso);
    cells.push({ iso, inMonth, weekStart: weekStart || iso });
  }
  return cells;
}
