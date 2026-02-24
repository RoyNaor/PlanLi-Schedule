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
