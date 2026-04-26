import { Stethoscope, UserRoundPlus, Moon } from "lucide-react";
import { clsx } from "clsx";
import type { ScheduleAssignment } from "./types";

function isOvernight(startTime: string, endTime: string) {
  return endTime !== "" && startTime !== "" && endTime <= startTime;
}

export function ScheduleShiftCard({ a }: { a: ScheduleAssignment }) {
  const overnight = isOvernight(a.startTime, a.endTime);
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
        {a.userRole === "doctor" ? (
          <Stethoscope className="w-2.5 h-2.5" />
        ) : (
          <UserRoundPlus className="w-2.5 h-2.5" />
        )}
        <span>{a.userRole === "doctor" ? "רופא" : "אחות"}</span>
      </div>
    </div>
  );
}
