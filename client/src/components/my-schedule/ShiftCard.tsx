import { Moon, Users } from "lucide-react";
import { clsx } from "clsx";
import { useMemo } from "react";
import { getRoleLabel, userRoleOptions } from "../../utils/staffing";
import type { ScheduleAssignment } from "./types";

function isOvernight(startTime: string, endTime: string) {
  return endTime !== "" && startTime !== "" && endTime <= startTime;
}

const ROLE_ICON_BY_ROLE = Object.fromEntries(
  userRoleOptions.map((option) => [option.value, option.icon]),
) as Record<string, typeof Users>;

export function ScheduleShiftCard({ a }: { a: ScheduleAssignment }) {
  const overnight = isOvernight(a.startTime, a.endTime);
  const Icon = useMemo(() => ROLE_ICON_BY_ROLE[a.userRole] ?? Users, [a.userRole]);
  return (
    <div
      className={clsx(
        "rounded-lg border-l-4 px-2 py-1.5 text-xs",
        overnight
          ? "border-indigo-500 bg-indigo-50/60 border border-indigo-100"
          : "border-[#1d5c8b] bg-[#ebf4fb]/80 border border-blue-100",
      )}
    >
      <p className={clsx("font-semibold", overnight ? "text-indigo-800" : "text-[#1d5c8b]")}>
        {a.startTime} – {a.endTime}
        {overnight && <Moon className="w-2.5 h-2.5 inline ml-1 text-indigo-600" />}
      </p>
      <div className="flex items-center gap-1 mt-0.5 text-slate-500">
        <Icon className="w-2.5 h-2.5" />
        <span>{getRoleLabel(a.userRole)}</span>
      </div>
    </div>
  );
}
