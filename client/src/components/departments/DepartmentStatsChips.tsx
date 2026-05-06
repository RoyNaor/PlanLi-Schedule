import type { ReactNode } from "react";
import { userRoleOptions } from "../../utils/staffing";
import {
  overviewStatusLabels,
  overviewStatusOrder,
  seniorityCodeLabels,
} from "../../utils/userStatus";

export interface DepartmentUserStatsData {
  total: number;
  byStatus: Record<string, number>;
  bySeniority: {
    senior: number;
    regular: number;
    intern: number;
    none: number;
  };
  byRole: Record<string, number>;
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function StatChip({ text, variant }: { text: string; variant: "neutral" | "teal" | "amber" | "rose" }) {
  const styles =
    variant === "teal"
      ? "bg-teal-50 text-teal-800"
      : variant === "amber"
        ? "bg-amber-50 text-amber-900"
        : variant === "rose"
          ? "bg-rose-50 text-rose-800"
          : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles}`}>
      {text}
    </span>
  );
}

export function DepartmentStatsChips({ stats }: { stats: DepartmentUserStatsData }) {
  if (stats.total === 0) {
    return (
      <p className="text-xs text-slate-400 mt-1">
        אין משתמשים משויכים · סטטוס לפי חסימות HARD יום מלא לשבוע הנוכחי
      </p>
    );
  }

  const statusChips: ReactNode[] = [];
  for (const key of overviewStatusOrder) {
    const count = stats.byStatus[key] ?? 0;
    if (key !== "active" && count === 0) continue;
    const label = overviewStatusLabels[key as keyof typeof overviewStatusLabels];
    let variant: "neutral" | "teal" | "amber" | "rose" = "neutral";
    if (key === "active") variant = "teal";
    else if (key === "sick" || key === "course") variant = "rose";
    else if (key === "vacation" || key === "leave") variant = "amber";
    statusChips.push(
      <StatChip key={key} variant={variant} text={`${label}: ${count}`} />,
    );
  }

  const seniorityKeys = ["senior", "regular", "intern"] as const;
  const seniorityChips: ReactNode[] = [];
  for (const key of seniorityKeys) {
    const count = stats.bySeniority[key];
    if (count === 0) continue;
    seniorityChips.push(
      <StatChip key={key} variant="neutral" text={`${seniorityCodeLabels[key]}: ${count}`} />,
    );
  }
  const noneSeniority = stats.bySeniority.none;
  if (noneSeniority > 0) {
    seniorityChips.push(
      <StatChip key="none" variant="neutral" text={`ללא דרג: ${noneSeniority}`} />,
    );
  }

  const roleChips: ReactNode[] = [];
  for (const opt of userRoleOptions) {
    const count = stats.byRole[opt.value] ?? 0;
    if (count === 0) continue;
    roleChips.push(
      <StatChip key={opt.value} variant="neutral" text={`${opt.pluralLabel}: ${count}`} />,
    );
  }

  return (
    <div className="mt-2 space-y-2 max-w-xl">
      <ChipRow label="סטטוס (שבוע נוכחי)">{statusChips}</ChipRow>
      {seniorityChips.length > 0 ? (
        <ChipRow label="דרג">{seniorityChips}</ChipRow>
      ) : null}
      {roleChips.length > 0 ? <ChipRow label="תפקיד">{roleChips}</ChipRow> : null}
    </div>
  );
}
