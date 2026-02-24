import { Pencil, Trash2 } from "lucide-react";
import { parseIsoDateToUtc } from "../../utils/date.utils";

export type Shift = {
  id: number;
  weekStart: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
  createdAt: string;
};

type Props = {
  weekStart: string; // "YYYY-MM-DD"
  weekDates: string[]; // 7 dates ISO
  shifts: Shift[]; // shifts for selected week
  loading?: boolean;

  onAddShift: (shiftDate: string) => void;
  onEditShift: (shift: Shift) => void;
  onDeleteShift: (shiftId: number) => void;
};

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const weekDayLabels = [
  "יום א׳",
  "יום ב׳",
  "יום ג׳",
  "יום ד׳",
  "יום ה׳",
  "יום ו׳",
  "יום ש׳",
];

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
  // group shifts by date
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
    <section className="bg-white border-2 border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {/* header days */}
      <div className="grid grid-cols-7 border-b-2 border-slate-800">
        {weekDates.map((isoDate, index) => (
          <div
            key={isoDate}
            className="p-4 text-center border-l border-slate-300 last:border-l-0"
          >
            <p className="text-sm text-slate-600">{weekDayLabels[index]}</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {dayNumberFormatter.format(parseIsoDateToUtc(isoDate))}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="p-6 text-slate-500">טוען משמרות...</p>
      ) : !weekStart || weekDates.length !== 7 ? (
        <p className="p-6 text-slate-500">בחר שבוע כדי להציג משמרות.</p>
      ) : (
        <div className="grid grid-cols-7 min-h-[460px]">
          {weekDates.map((shiftDate) => {
            const dayShifts = shiftsByDate.get(shiftDate) ?? [];

            return (
              <div
                key={shiftDate}
                className="border-l border-slate-300 last:border-l-0 p-3 flex flex-col gap-3"
              >
                <button
                  type="button"
                  onClick={() => onAddShift(shiftDate)}
                  className="w-full border-2 border-dashed border-slate-300 rounded-xl py-2 text-slate-600 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                >
                  + הוספה
                </button>

                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <article
                      key={shift.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs space-y-1"
                    >
                      <p className="font-semibold text-slate-800">
                        {shift.startTime} - {shift.endTime}
                      </p>
                      <p className="text-slate-600">
                        רופאים: {shift.minDoctors}
                      </p>
                      <p className="text-slate-600">אחיות: {shift.minNurses}</p>

                      <div className="flex items-center justify-end gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => onEditShift(shift)}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700"
                          title="עריכת משמרת"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteShift(shift.id)}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-700"
                          title="מחיקת משמרת"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
