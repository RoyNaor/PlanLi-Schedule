import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { WeekSummary } from "../types";
import {
  addDaysToIsoDate,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../../utils/date.utils";

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const monthFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const dayNumberFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const calendarWeekDayLabels = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

type Props = {
  isOpen: boolean;
  weeks: WeekSummary[];
  selectedWeek: string;
  onClose: () => void;

  // מה יקרה כשבוחרים שבוע: אם קיים -> setSelected, אם לא -> create ואז setSelected
  onSelectWeekStart: (weekStart: string) => Promise<void>;
};

export default function WeekPickerModal({
  isOpen,
  weeks,
  selectedWeek,
  onClose,
  onSelectWeekStart,
}: Props) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });

  const monthFirstIso = `${monthCursor.getUTCFullYear()}-${String(
    monthCursor.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;

  const calendarStartIso = startOfWeekSundayIso(monthFirstIso);

  const calendarDays = useMemo(
    () =>
      Array.from({ length: 35 }, (_, i) =>
        addDaysToIsoDate(calendarStartIso, i),
      ),
    [calendarStartIso],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center px-4">
      <section className="w-full max-w-xl bg-white rounded-2xl border-2 border-slate-800 shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-3xl font-semibold text-slate-900">בחירת שבוע</h2>
          <button type="button" onClick={onClose} className="text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() =>
              setMonthCursor(
                (prev) =>
                  new Date(
                    Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1),
                  ),
              )
            }
            className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <p className="text-lg font-semibold">
            {monthFormatter.format(monthCursor)}
          </p>

          <button
            type="button"
            onClick={() =>
              setMonthCursor(
                (prev) =>
                  new Date(
                    Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1),
                  ),
              )
            }
            className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-slate-500 mb-2">
          {calendarWeekDayLabels.map((label) => (
            <p key={label} className="text-sm">
              {label}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((isoDate) => {
            const date = parseIsoDateToUtc(isoDate);
            const weekStart = startOfWeekSundayIso(isoDate);

            const inCurrentMonth =
              date.getUTCMonth() === monthCursor.getUTCMonth() &&
              date.getUTCFullYear() === monthCursor.getUTCFullYear();

            const isSelected = selectedWeek === weekStart;

            return (
              <button
                key={isoDate}
                type="button"
                onClick={async () => {
                  await onSelectWeekStart(weekStart);
                  onClose();
                }}
                className={`h-11 rounded-lg text-sm font-medium ${
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : inCurrentMonth
                      ? "bg-slate-100 text-slate-900 hover:bg-emerald-100"
                      : "bg-slate-50 text-slate-400"
                }`}
              >
                {dayNumberFormatter.format(date)}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 mt-4">
          * בחירה ביום כלשהו בוחרת את השבוע שמתחיל ביום א׳ של אותו שבוע.
        </p>
      </section>
    </div>
  );
}
