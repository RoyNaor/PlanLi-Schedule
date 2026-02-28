import { Copy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WeekSummary } from "../types";
import {
  addDaysToIsoDate,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../../utils/date.utils";

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

type Props = {
  isOpen: boolean;
  weeks: WeekSummary[];
  defaultSourceWeek: string;
  defaultTargetWeek: string;
  onClose: () => void;
  onSubmit: (values: { sourceWeekStart: string; targetWeekStart: string }) => Promise<void>;
};

function formatWeekRangeLabel(weekStart: string) {
  const weekEnd = addDaysToIsoDate(weekStart, 6);
  if (!weekEnd) return weekStart;

  return `${dateFormatter.format(parseIsoDateToUtc(weekStart))} - ${dateFormatter.format(
    parseIsoDateToUtc(weekEnd),
  )}`;
}

export default function DuplicateWeekModal({
  isOpen,
  weeks,
  defaultSourceWeek,
  defaultTargetWeek,
  onClose,
  onSubmit,
}: Props) {
  const [sourceWeekStart, setSourceWeekStart] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fallbackSourceWeek = defaultSourceWeek || weeks[0]?.weekStart || "";
    const fallbackTargetWeek =
      defaultTargetWeek || (fallbackSourceWeek ? addDaysToIsoDate(fallbackSourceWeek, 7) : "");

    setSourceWeekStart(fallbackSourceWeek);
    setTargetDate(fallbackTargetWeek || "");
  }, [defaultSourceWeek, defaultTargetWeek, isOpen, weeks]);

  const normalizedTargetWeekStart = useMemo(
    () => startOfWeekSundayIso(targetDate),
    [targetDate],
  );

  const targetWeekRangeLabel = useMemo(() => {
    if (!normalizedTargetWeekStart) return "";
    return formatWeekRangeLabel(normalizedTargetWeekStart);
  }, [normalizedTargetWeekStart]);

  const sourceOptions = useMemo(
    () =>
      weeks.map((week) => ({
        value: week.weekStart,
        label: `${formatWeekRangeLabel(week.weekStart)} (${week.shiftsCount} משמרות)`,
      })),
    [weeks],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center px-4">
      <section className="w-full max-w-xl bg-white rounded-2xl border-2 border-slate-800 shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold text-slate-900">שכפול שבוע</h2>
          <button type="button" onClick={onClose} className="text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();

            const normalizedSourceWeek = startOfWeekSundayIso(sourceWeekStart);
            const normalizedTargetWeek = startOfWeekSundayIso(targetDate);

            if (!normalizedSourceWeek || !normalizedTargetWeek) {
              alert("יש לבחור שבוע מקור ושבוע יעד תקינים.");
              return;
            }

            if (normalizedSourceWeek === normalizedTargetWeek) {
              alert("שבוע המקור ושבוע היעד חייבים להיות שונים.");
              return;
            }

            try {
              setSaving(true);
              await onSubmit({
                sourceWeekStart: normalizedSourceWeek,
                targetWeekStart: normalizedTargetWeek,
              });
              onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">שבוע מקור</span>
            <select
              value={sourceWeekStart}
              onChange={(event) => setSourceWeekStart(event.target.value)}
              required
              className="h-11 rounded-xl border border-slate-300 px-3 bg-white"
            >
              <option value="" disabled>
                בחר שבוע מקור
              </option>
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">תאריך בשבוע יעד</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              required
              className="h-11 rounded-xl border border-slate-300 px-3"
            />
          </label>

          <p className="text-sm text-slate-600">
            שבוע היעד שיווצר:{" "}
            <strong className="text-slate-900">
              {targetWeekRangeLabel || "בחר תאריך יעד"}
            </strong>
          </p>

          <p className="text-xs text-slate-500">
            המשמרות יועתקו עם אותן שעות ודרישות כוח אדם, לימים המקבילים בשבוע היעד.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl border border-slate-300 text-slate-700"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || sourceOptions.length === 0}
              className="h-11 px-5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {saving ? "משכפל..." : "שכפול"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
