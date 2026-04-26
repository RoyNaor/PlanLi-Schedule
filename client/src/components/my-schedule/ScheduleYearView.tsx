import { clsx } from "clsx";
import {
  firstOfMonthIso,
  getCalendarMonthMatrix,
  parseIsoDateToUtc,
} from "../../utils/date.utils";
import { chunkArray, mergeAssignmentsByDate } from "./scheduleData";
import { dayNumberFormatter, monthNameOnlyFormatter, WEEK_DAY_LABELS } from "./formatters";
import { navFlashFocus, navFlashOn } from "./scheduleNavFlash";
import type { WeekCache } from "./types";

type Props = {
  yForYear: number;
  yearWeekStarts: string[];
  weekCache: WeekCache;
  todayIso: string;
  loading: boolean;
  onSelectDay: (iso: string) => void;
  onSelectMonth: (year: number, month1to12: number) => void;
  onSelectWeek: (weekStart: string) => void;
  highlightKey: string | null;
};

export function ScheduleYearView({
  yForYear,
  yearWeekStarts,
  weekCache,
  todayIso,
  loading,
  onSelectDay,
  onSelectMonth,
  onSelectWeek,
  highlightKey,
}: Props) {
  const assignmentsByDate = mergeAssignmentsByDate(weekCache, yearWeekStarts);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-sm">
        טוען סידור...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((monthNum) => {
        const mm = String(monthNum).padStart(2, "0");
        const anchor = `${yForYear}-${mm}-10`;
        const cells = getCalendarMonthMatrix(anchor);
        const rows = chunkArray(cells, 7);
        const label = monthNameOnlyFormatter.format(
          parseIsoDateToUtc(firstOfMonthIso(anchor) || anchor),
        );
        const monthKey = `month:${yForYear}-${monthNum}`;
        return (
          <div
            key={monthNum}
            className="relative z-0 overflow-visible rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm"
          >
            <button
              type="button"
              onClick={() => onSelectMonth(yForYear, monthNum)}
              className={clsx(
                "w-full text-right text-sm font-semibold text-slate-800 rounded-t-[10px] px-2 py-2 border-b border-slate-200 bg-slate-50/80",
                "hover:bg-slate-100/90",
                navFlashOn(highlightKey === monthKey),
                navFlashFocus,
              )}
            >
              {label}
            </button>
            <div className="grid grid-cols-7 text-[9px] text-slate-500 border-b border-slate-100">
              {WEEK_DAY_LABELS.map((l) => (
                <div key={l} className="text-center py-0.5">
                  {l}
                </div>
              ))}
            </div>
            {rows.map((row, ri) => {
              const weekStart = row[0]?.weekStart ?? "";
              const weekKey = `week:${weekStart}`;
              return (
                <div
                  key={ri}
                  onClick={() => weekStart && onSelectWeek(weekStart)}
                  className={clsx(
                    "grid grid-cols-7 min-h-[36px] border-b border-slate-100 last:border-b-0 last:rounded-b-[10px] cursor-pointer",
                    "hover:bg-slate-50/30",
                    navFlashOn(highlightKey === weekKey),
                  )}
                >
                  {row.map((c) => {
                    const n = (assignmentsByDate.get(c.iso) ?? []).length;
                    const dayKey = `day:${c.iso}`;
                    return (
                      <div
                        key={c.iso}
                        className="border-l border-slate-100 last:border-l-0 p-0.5 text-center"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDay(c.iso);
                          }}
                          className={clsx(
                            "w-5 h-5 text-[10px] rounded-full inline-flex items-center justify-center",
                            c.iso === todayIso && c.inMonth && "bg-[#1d5c8b] text-white",
                            !c.inMonth && "text-slate-300",
                            navFlashOn(highlightKey === dayKey),
                            navFlashFocus,
                          )}
                        >
                          {dayNumberFormatter.format(parseIsoDateToUtc(c.iso))}
                        </button>
                        {c.inMonth && n > 0 && (
                          <button
                            type="button"
                            title={`${n} משמרות · ליום מלא`}
                            aria-label="פתח את היום"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDay(c.iso);
                            }}
                            className="mx-auto mt-0.5 block h-1 w-1 shrink-0 cursor-pointer rounded-full border-0 bg-[#1d5c8b] p-0"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
