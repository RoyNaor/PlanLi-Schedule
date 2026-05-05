import { parseIsoDateToUtc } from "../../utils/date.utils";
import { LoadingState } from "../ui/LoadingIndicator";
import { dayNumberFormatter } from "./formatters";
import { ScheduleShiftCard } from "./ShiftCard";
import type { ScheduleAssignment } from "./types";

type Props = {
  focusIso: string;
  focusWeekdayLabel: string;
  loading: boolean;
  assignments: ScheduleAssignment[];
  displayWeekStart: string;
};

export function ScheduleDayView({
  focusIso,
  focusWeekdayLabel,
  loading,
  assignments,
  displayWeekStart,
}: Props) {
  if (!displayWeekStart) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {loading ? (
        <LoadingState label="טוען סידור..." />
      ) : (
        <div className="p-4 max-w-lg mx-auto">
          <p className="text-xs text-slate-500 mb-3 text-center">
            {dayNumberFormatter.format(parseIsoDateToUtc(focusIso))} · {focusWeekdayLabel}
          </p>
          <div className="flex flex-col gap-1.5">
            {assignments.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-6">אין משמרות ביום הזה.</div>
            ) : (
              assignments.map((a) => <ScheduleShiftCard key={`${a.shiftId}-${a.userId}`} a={a} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
