import { getJerusalemTodayIsoDate, parseIsoDateToUtc } from "../../utils/date.utils";
import type { Shift } from "../types";
import ShiftCard from "./ShiftCard";

type Props = {
  weekStart: string;
  weekDates: string[];
  shifts: Shift[];
  loading?: boolean;
  onAddShift: (shiftDate: string) => void;
  onEditShift: (shift: Shift) => void;
  onDeleteShift: (shiftId: number) => void;
};

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const weekDayLabels = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const dayNumberFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

export default function WeekShiftGrid({
  weekStart,
  weekDates,
  shifts,
  loading = false,
  onAddShift,
  onEditShift,
  onDeleteShift,
}: Props) {
  const todayIso = getJerusalemTodayIsoDate();

  const shiftsByDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const list = shiftsByDate.get(s.shiftDate) ?? [];
    list.push(s);
    shiftsByDate.set(s.shiftDate, list);
  }
  for (const [, list] of shiftsByDate) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Day header row */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekDates.map((isoDate, index) => {
          const isToday = isoDate === todayIso;
          return (
            <div
              key={isoDate}
              className="py-3 text-center border-l border-slate-200 last:border-l-0"
            >
              <p className="text-xs font-medium text-slate-500 mb-1">
                יום {weekDayLabels[index]}
              </p>
              <div className="flex justify-center">
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isToday
                      ? "bg-[#1d5c8b] text-white"
                      : "text-slate-800"
                  }`}
                >
                  {dayNumberFormatter.format(parseIsoDateToUtc(isoDate))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-400 text-sm">טוען משמרות...</div>
      ) : !weekStart || weekDates.length !== 7 ? (
        <div className="p-6 text-center text-slate-400 text-sm">בחר שבוע כדי להציג משמרות.</div>
      ) : (
        /* Horizontal scroll on mobile */
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 min-h-[420px]" style={{ minWidth: "560px" }}>
            {weekDates.map((shiftDate) => {
              const dayShifts = shiftsByDate.get(shiftDate) ?? [];
              const isToday = shiftDate === todayIso;

              return (
                <div
                  key={shiftDate}
                  className={`border-l border-slate-200 last:border-l-0 flex flex-col gap-2 p-2 ${
                    isToday ? "bg-blue-50/40" : ""
                  }`}
                >
                  {/* Add button at top */}
                  <button
                    type="button"
                    onClick={() => onAddShift(shiftDate)}
                    className="self-end w-6 h-6 rounded-full border border-slate-300 text-slate-400 hover:border-[#1d5c8b] hover:text-[#1d5c8b] hover:bg-[#ebf4fb] flex items-center justify-center transition-colors text-sm leading-none"
                    title="הוסף משמרת"
                    aria-label="הוסף משמרת"
                  >
                    +
                  </button>

                  <div className="space-y-1.5">
                    {dayShifts.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        onEdit={onEditShift}
                        onDelete={onDeleteShift}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
