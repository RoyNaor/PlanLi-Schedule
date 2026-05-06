/** Mirror server `UserStatus` for department overview (from constraints). */
export type OverviewUserStatus = "active" | "sick" | "course" | "vacation" | "leave" | "other";

export const overviewStatusLabels: Record<OverviewUserStatus, string> = {
  active: "פעיל",
  sick: "מחלה",
  course: "בקורס / הכשרה",
  vacation: "חופשה / חג",
  leave: "חופש / מילואים",
  other: "מחויב / אחר",
};

export const overviewStatusOrder: OverviewUserStatus[] = [
  "active",
  "sick",
  "course",
  "vacation",
  "leave",
  "other",
];

export const seniorityCodeLabels: Record<string, string> = {
  intern: "מתמחה",
  regular: "רגיל",
  senior: "בכיר",
};

export interface SeniorityLike {
  code: string;
  name: string;
}

export function getSeniorityLabel(seniority: SeniorityLike | null): string {
  if (!seniority) return "—";
  return seniorityCodeLabels[seniority.code] ?? seniority.name;
}
