export const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

export type Sender = "staff" | "assistant";

export interface TranscriptMessage {
  sender: Sender;
  content: string;
}

export type ScheduleQueryRange = "current" | "next";

const LOCAL_CHAT_HELP_REPLY = `היי 😊 אני כאן כדי לעזור עם השיבוצים והזמינות שלך.
אפשר לכתוב למשל:
• מה השיבוצים שלי לשבוע הקרוב?
• אל תשבץ אותי ביום ראשון בערב
• אני לא יכול/ה לעבוד ביום שלישי בין 10:00 ל-14:00
• אם אפשר, אל תשבץ אותי במשמרת לילה השבוע`;

const greetingPatterns = [
  "היי",
  "הי",
  "שלום",
  "אהלן",
  "בוקר טוב",
  "ערב טוב",
  "hi",
  "hello",
];

const helpPatterns = [
  "עזרה",
  "אפשר עזרה",
  "מה אפשר לעשות",
  "מה אתה יודע לעשות",
  "מה ניתן לעשות",
  "פקודות",
  "אפשרויות",
];

const scheduleQueryPatterns = [
  "השיבוצים שלי",
  "השיבוץ שלי",
  "הסידור שלי",
  "המשמרות שלי",
  "שיבוצים שלי",
  "שיבוץ שלי",
  "סידור שלי",
  "משמרות שלי",
];

const scheduleQueryNouns = [
  "סידור",
  "משמר",
  "שיבוצ",
];

const scheduleQueryUserMarkers = [
  "לי",
  "שלי",
];

const scheduleQueryActionMarkers = [
  "אילו",
  "איזה",
  "בדוק",
  "בדקי",
  "בדיקה",
  "הראה",
  "הראי",
  "יש",
  "כמה",
  "מה",
  "קיימים",
  "קיימות",
  "תבדוק",
  "תבדקי",
  "תראה",
  "תראי",
];

function normalizeChatText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u200e\u200f]/g, "")
    .replace(/[.!?,;:"'`~*_()[\]{}<>]/g, "")
    .replace(/\s+/g, " ");
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Extracts Israel-local calendar parts from a Date for deterministic date math.
export function toIsraelDateParts(input: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(input);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const weekdayShort = parts.find((part) => part.type === "weekday")?.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year,
    month,
    day,
    weekday: weekdayMap[weekdayShort ?? "Sun"] ?? 0,
  };
}

// Formats the current Israel-local date-time as ISO including UTC offset.
export function formatIsraelNowIso(input: Date): string {
  const datePart = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input);

  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(input);

  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TIME_ZONE,
    timeZoneName: "shortOffset",
  })
    .formatToParts(input)
    .find((part) => part.type === "timeZoneName")
    ?.value?.replace("GMT", "")
    ?.replace(/^([+-]\d{1,2})$/, "$1:00");

  return `${datePart}T${timePart}${timeZoneName ?? "+02:00"}`;
}

// Calculates the local week-start date (Sunday) in Israel timezone.
export function getWeekStartSundayInIsrael(dateInput: Date): string {
  const dateParts = toIsraelDateParts(dateInput);
  const utcNoonForIsraelDate = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0));
  utcNoonForIsraelDate.setUTCDate(utcNoonForIsraelDate.getUTCDate() - dateParts.weekday);

  const sundayParts = toIsraelDateParts(utcNoonForIsraelDate);
  const month = String(sundayParts.month).padStart(2, "0");
  const day = String(sundayParts.day).padStart(2, "0");
  return `${sundayParts.year}-${month}-${day}`;
}

// Converts chat history into a plain transcript consumed by the model prompt.
export function formatTranscript(messages: TranscriptMessage[]): string {
  return messages
    .map((message) => {
      const role = message.sender === "staff" ? "User" : "Assistant";
      return `${role}: ${message.content}`;
    })
    .join("\n");
}

export function getLocalChatReply(input: string): string | null {
  const normalized = normalizeChatText(input);

  if (!normalized) {
    return null;
  }

  if (
    greetingPatterns.some((pattern) => normalized === pattern) ||
    helpPatterns.some((pattern) => normalized === pattern || normalized.includes(pattern))
  ) {
    return LOCAL_CHAT_HELP_REPLY;
  }

  // Only known, safe cache hits answer locally. Everything else goes to the model/API
  // because Hebrew scheduling requests can be phrased in many valid ways.
  return null;
}

export function detectScheduleQueryRange(input: string): ScheduleQueryRange | null {
  const normalized = normalizeChatText(input);

  const asksForSchedule =
    scheduleQueryPatterns.some((pattern) => normalized.includes(pattern)) ||
    (
      scheduleQueryNouns.some((noun) => normalized.includes(noun)) &&
      scheduleQueryUserMarkers.some((marker) => normalized.split(" ").includes(marker)) &&
      scheduleQueryActionMarkers.some((marker) => normalized.includes(marker))
    );

  if (!asksForSchedule) {
    return null;
  }

  if (
    normalized.includes("שבוע הבא") ||
    normalized.includes("השבוע הבא") ||
    normalized.includes("לשבוע הבא")
  ) {
    return "next";
  }

  return "current";
}

export function resolveScheduleQueryWeekStart(input: string, now: Date = new Date()): string | null {
  const range = detectScheduleQueryRange(input);
  if (!range) {
    return null;
  }

  const currentWeekStart = getWeekStartSundayInIsrael(now);
  return range === "next" ? addDaysToIsoDate(currentWeekStart, 7) : currentWeekStart;
}

// Detects short gratitude/closing messages so the bot can end politely without re-processing constraints.
export function isConversationClosingMessage(input: string): boolean {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:"'`~*_()\-]/g, "")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return false;
  }

  const gratitudePatterns = [
    "thank you",
    "thanks",
    "thank u",
    "תודה",
    "תודה רבה",
    "לא תודה",
    "סבבה תודה",
    "מעולה תודה",
  ];

  return gratitudePatterns.some((pattern) => normalized === pattern || normalized.startsWith(`${pattern} `));
}
