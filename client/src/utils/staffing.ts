import {
  Baby,
  ClipboardPen,
  HeartPulse,
  HelpingHand,
  Stethoscope,
  UserRoundPlus,
  Users,
} from "lucide-react";

export const staffRoleOptions = [
  { value: "doctor", label: "רופא", pluralLabel: "רופאים", icon: Stethoscope },
  { value: "nurse", label: "אחות", pluralLabel: "אחיות", icon: UserRoundPlus },
  { value: "midwife", label: "מיילדת", pluralLabel: "מיילדות", icon: Baby },
  { value: "obgyn", label: "רופא/ת נשים", pluralLabel: "רופאי נשים", icon: Stethoscope },
  { value: "anesthesiologist", label: "רופא/ה מרדים/ה", pluralLabel: "מרדימים", icon: HeartPulse },
  { value: "orderly", label: "כוח עזר / סניטר", pluralLabel: "כוח עזר", icon: HelpingHand },
  { value: "pediatrician", label: "רופא/ת ילדים / נאונטולוג", pluralLabel: "ילדים / נאונטולוגים", icon: Baby },
  { value: "shabbat_scribe", label: "כתבנית שבת", pluralLabel: "כתבניות שבת", icon: ClipboardPen },
  { value: "secretary", label: "מזכיר/ה", pluralLabel: "מזכירות", icon: Users },
] as const;

export const userRoleOptions = [
  { value: "admin", label: "מנהל", pluralLabel: "מנהלים", icon: Users },
  ...staffRoleOptions,
] as const;

export type StaffRoleValue = (typeof staffRoleOptions)[number]["value"];

export type StaffingField =
  | "minDoctors"
  | "minNurses"
  | "minMidwives"
  | "minObgyns"
  | "minAnesthesiologists"
  | "minOrderlies"
  | "minPediatricians"
  | "minShabbatScribes"
  | "minSecretaries";

export const staffingFields: Array<{
  role: StaffRoleValue;
  field: StaffingField;
  apiField: string;
  label: string;
  defaultMorning: number;
  defaultEveningNight: number;
  defaultShabbat: number;
}> = [
  { role: "doctor", field: "minDoctors", apiField: "min_doctors", label: "רופאים כלליים", defaultMorning: 0, defaultEveningNight: 0, defaultShabbat: 0 },
  { role: "nurse", field: "minNurses", apiField: "min_nurses", label: "אחיות כלליות", defaultMorning: 0, defaultEveningNight: 0, defaultShabbat: 0 },
  { role: "midwife", field: "minMidwives", apiField: "min_midwives", label: "מיילדות", defaultMorning: 13, defaultEveningNight: 13, defaultShabbat: 13 },
  { role: "obgyn", field: "minObgyns", apiField: "min_obgyns", label: "רופאי נשים", defaultMorning: 5, defaultEveningNight: 3, defaultShabbat: 3 },
  { role: "anesthesiologist", field: "minAnesthesiologists", apiField: "min_anesthesiologists", label: "מרדימים", defaultMorning: 2, defaultEveningNight: 2, defaultShabbat: 2 },
  { role: "orderly", field: "minOrderlies", apiField: "min_orderlies", label: "כוח עזר / סניטרים", defaultMorning: 2, defaultEveningNight: 1, defaultShabbat: 1 },
  { role: "pediatrician", field: "minPediatricians", apiField: "min_pediatricians", label: "רופא ילדים / נאונטולוג", defaultMorning: 0, defaultEveningNight: 0, defaultShabbat: 0 },
  { role: "shabbat_scribe", field: "minShabbatScribes", apiField: "min_shabbat_scribes", label: "כתבניות שבת", defaultMorning: 0, defaultEveningNight: 0, defaultShabbat: 1 },
  { role: "secretary", field: "minSecretaries", apiField: "min_secretaries", label: "מזכירות", defaultMorning: 1, defaultEveningNight: 0, defaultShabbat: 0 },
];

export function getRoleLabel(role: string) {
  return userRoleOptions.find((option) => option.value === role)?.label ?? role;
}

export function getRolePluralLabel(role: string) {
  return userRoleOptions.find((option) => option.value === role)?.pluralLabel ?? role;
}

export function getRoleIcon(role: string) {
  return userRoleOptions.find((option) => option.value === role)?.icon ?? Users;
}

export function isStaffRole(role: string) {
  return staffRoleOptions.some((option) => option.value === role);
}

function isMorningShift(startTime: string) {
  return startTime >= "05:00" && startTime < "14:00";
}

function isSaturday(isoDate: string) {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay() === 6;
}

export function getDefaultStaffingValues(shiftDate: string, startTime: string) {
  const shabbat = isSaturday(shiftDate);
  const morning = isMorningShift(startTime);

  return Object.fromEntries(
    staffingFields.map((field) => [
      field.field,
      shabbat ? field.defaultShabbat : morning ? field.defaultMorning : field.defaultEveningNight,
    ]),
  ) as Record<StaffingField, number>;
}

export function getNonZeroStaffingSummary(input: Record<StaffingField, number>) {
  return staffingFields
    .map((field) => ({ ...field, value: input[field.field] ?? 0 }))
    .filter((field) => field.value > 0);
}
