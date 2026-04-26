import { clsx } from "clsx";
import type { KeyboardEvent } from "react";
import { parseIsoDateToUtc } from "../../utils/date.utils";
import { dayNumberFormatter, WEEK_DAY_LABELS } from "./formatters";
import {
  navFlashColumnHoverTransition,
  navFlashFocus,
  navFlashFrameOverlayClass,
  navFlashTargetLift,
} from "./scheduleNavFlash";
import { ScheduleShiftCard } from "./ShiftCard";
import type { ScheduleAssignment } from "./types";

type Props = {
  weekDates: string[];
  todayIso: string;
  loading: boolean;
  assignmentsByDate: Map<string, ScheduleAssignment[]>;
  onSelectDay: (iso: string) => void;
  highlightKey: string | null;
};

function columnA11y(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

export function ScheduleWeekView({
  weekDates,
  todayIso,
  loading,
  assignmentsByDate,
  onSelectDay,
  highlightKey,
}: Props) {
  return (
    <div className="overflow-x-visible overflow-y-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto p-0.5">
        {loading ? (
          <>
            <div
              className="grid grid-cols-7 border-b border-slate-200 bg-slate-50"
              style={{ minWidth: "560px" }}
            >
              {weekDates.map((isoDate, index) => {
                const isToday = isoDate === todayIso;
                return (
                  <div
                    key={isoDate}
                    className="py-3 text-center border-l border-slate-200 last:border-l-0"
                  >
                    <p className="text-xs font-medium text-slate-500 mb-1">
                      יום {WEEK_DAY_LABELS[index]}
                    </p>
                    <div className="flex justify-center">
                      <span
                        className={clsx(
                          "w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold",
                          isToday ? "bg-[#1d5c8b] text-white" : "text-slate-800",
                        )}
                      >
                        {dayNumberFormatter.format(parseIsoDateToUtc(isoDate))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-8 text-center text-slate-400 text-sm">טוען סידור...</div>
          </>
        ) : (
          <div
            className="grid grid-cols-7 min-h-[300px] border-b border-slate-200 bg-white"
            style={{ minWidth: "560px" }}
          >
            {weekDates.map((isoDate, index) => {
              const isToday = isoDate === todayIso;
              const list = assignmentsByDate.get(isoDate) ?? [];
              const dayKey = `day:${isoDate}`;
              const h = () => onSelectDay(isoDate);
              const isFlash = highlightKey === dayKey;
              return (
                <div
                  key={isoDate}
                  {...columnA11y(h)}
                  className={clsx(
                    "group relative z-0 flex h-full min-h-0 flex-col border-l border-slate-200 last:border-l-0 text-center bg-white",
                    "cursor-pointer",
                    navFlashColumnHoverTransition,
                    isFlash && navFlashTargetLift,
                    navFlashFocus,
                  )}
                >
                  {isFlash && (
                    <div className={navFlashFrameOverlayClass} aria-hidden />
                  )}
                  <div
                    className={clsx(
                      "py-3 border-b border-slate-200 bg-slate-50/80 group-hover:bg-slate-100/85",
                      navFlashColumnHoverTransition,
                    )}
                  >
                    <p className="text-xs font-medium text-slate-500 mb-1">
                      יום {WEEK_DAY_LABELS[index]}
                    </p>
                    <div className="flex justify-center">
                      <span
                        className={clsx(
                          "w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold",
                          isToday ? "bg-[#1d5c8b] text-white" : "text-slate-800",
                        )}
                      >
                        {dayNumberFormatter.format(parseIsoDateToUtc(isoDate))}
                      </span>
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "flex min-h-[200px] flex-1 flex-col gap-1.5 p-2 group-hover:bg-slate-50/70",
                      navFlashColumnHoverTransition,
                    )}
                  >
                    {list.length === 0 ? (
                      <div className="flex-1" />
                    ) : (
                      list.map((a) => (
                        <ScheduleShiftCard key={`${a.shiftId}-${a.userId}`} a={a} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
