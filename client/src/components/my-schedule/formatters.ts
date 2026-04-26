export const ISRAEL_TIMEZONE = "Asia/Jerusalem";

export const WEEK_DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

export const dayNumberFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

export const monthYearFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

export const fullDateFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

export const yearLabelFormatter = new Intl.DateTimeFormat("he-IL", {
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

export const monthNameOnlyFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  timeZone: ISRAEL_TIMEZONE,
});
