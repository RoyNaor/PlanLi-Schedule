import { clsx } from "clsx";
import type { MonthMatrixCell } from "../../utils/date.utils";
import { parseIsoDateToUtc } from "../../utils/date.utils";
import { dayNumberFormatter, WEEK_DAY_LABELS } from "./formatters";
import { navFlashFocus, navFlashOn } from "./scheduleNavFlash";
import { ScheduleShiftCard } from "./ShiftCard";
import type { ScheduleAssignment } from "./types";

type Props = {
  monthRows: MonthMatrixCell[][];
  todayIso: string;
  loading: boolean;
  assignmentsByDate: Map<string, ScheduleAssignment[]>;
  onSelectDay: (iso: string) => void;
  onSelectWeek: (weekStart: string) => void;
  highlightKey: string | null;
};

export function ScheduleMonthView({
  monthRows,
  todayIso,
  loading,
  assignmentsByDate,
  onSelectDay,
  onSelectWeek,
  highlightKey,
}: Props) {
  return (
    <div className="relative z-0 overflow-visible rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
      <div className="grid grid-cols-7 overflow-visible rounded-t-lg border-b border-slate-200 bg-slate-50">
        {WEEK_DAY_LABELS.map((lab) => (
          <div
            key={lab}
            className="py-2 text-center text-xs font-medium text-slate-500 border-l border-slate-200 last:border-l-0"
          >
            יום {lab}
          </div>
        ))}
      </div>
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">טוען סידור...</div>
      ) : (
        <div className="overflow-x-auto overflow-y-visible p-0.5">
          {monthRows.map((row, ri) => {
            const weekStart = row[0]?.weekStart ?? "";
            const weekKey = `week:${weekStart}`;
            return (
              <div
                key={ri}
                onClick={() => weekStart && onSelectWeek(weekStart)}
                className={clsx(
                  "grid grid-cols-7 min-h-[88px] border-b border-slate-200 last:border-b-0 cursor-pointer",
                  "hover:bg-slate-50/50",
                  navFlashOn(highlightKey === weekKey),
                )}
                style={{ minWidth: "640px" }}
              >
                {row.map((cell) => {
                  const isToday = cell.iso === todayIso;
                  const list = assignmentsByDate.get(cell.iso) ?? [];
                  const dayKey = `day:${cell.iso}`;
                  return (
                    <div
                      key={cell.iso}
                      className={clsx(
                        "border-l border-slate-200 last:border-l-0 p-1.5 flex flex-col gap-1",
                        isToday && "bg-blue-50/40",
                        !cell.inMonth && "bg-slate-50/50 opacity-60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDay(cell.iso);
                        }}
                        className={clsx(
                          "text-center text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center self-center",
                          isToday && "bg-[#1d5c8b] text-white",
                          !isToday && cell.inMonth && "text-slate-800",
                          navFlashOn(highlightKey === dayKey),
                          navFlashFocus,
                        )}
                      >
                        {dayNumberFormatter.format(parseIsoDateToUtc(cell.iso))}
                      </button>
                      {list.map((a) => (
                        <div
                          key={`${a.shiftId}-${a.userId}-${cell.iso}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDay(cell.iso);
                          }}
                          className="cursor-pointer"
                        >
                          <ScheduleShiftCard a={a} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
