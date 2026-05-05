import { CalendarDays, Clock, Moon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { normalizeApiTimeToHourMinute } from "../../utils/date.utils";
import {
  getDefaultStaffingValues,
  staffingFields,
  type StaffingField,
} from "../../utils/staffing";
import type { Shift } from "../types";
import { LoadingSpinner } from "../ui/LoadingIndicator";

type ShiftFormValues = {
  shiftDate: string;
  startTime: string;
  endTime: string;
} & Record<StaffingField, number>;

type Props = {
  isOpen: boolean;
  mode: "create" | "edit";
  weekStart: string;
  initialShiftDate: string;
  shiftToEdit: Shift | null;
  onClose: () => void;
  onSubmit: (values: ShiftFormValues) => Promise<void>;
};

function toFormValues(shiftDate: string, shiftToEdit: Shift | null): ShiftFormValues {
  if (!shiftToEdit) {
    const startTime = "08:00";
    return {
      shiftDate,
      startTime,
      endTime: "16:00",
      ...getDefaultStaffingValues(shiftDate, startTime),
    };
  }

  return {
    shiftDate: shiftToEdit.shiftDate,
    startTime: normalizeApiTimeToHourMinute(shiftToEdit.startTime) || "08:00",
    endTime: normalizeApiTimeToHourMinute(shiftToEdit.endTime) || "16:00",
    minDoctors: shiftToEdit.minDoctors,
    minNurses: shiftToEdit.minNurses,
    minMidwives: shiftToEdit.minMidwives,
    minObgyns: shiftToEdit.minObgyns,
    minAnesthesiologists: shiftToEdit.minAnesthesiologists,
    minOrderlies: shiftToEdit.minOrderlies,
    minPediatricians: shiftToEdit.minPediatricians,
    minShabbatScribes: shiftToEdit.minShabbatScribes,
    minSecretaries: shiftToEdit.minSecretaries,
  };
}

export default function ShiftFormModal({
  isOpen,
  mode,
  weekStart,
  initialShiftDate,
  shiftToEdit,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ShiftFormValues>(() =>
    toFormValues(initialShiftDate, shiftToEdit),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(toFormValues(initialShiftDate, shiftToEdit));
  }, [isOpen, initialShiftDate, shiftToEdit]);

  const title = mode === "create" ? "הוספת משמרת" : "עריכת משמרת";

  const isOvernight = useMemo(
    () => values.startTime !== "" && values.endTime !== "" && values.endTime <= values.startTime,
    [values.startTime, values.endTime],
  );

  const submitLabel = useMemo(
    () => (saving ? "שומר..." : mode === "create" ? "הוספה" : "שמירת שינויים"),
    [mode, saving],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
      <section dir="rtl" className="w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0f2a44] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <form
          className="p-6 space-y-5 overflow-y-auto"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              setSaving(true);
              await onSubmit(values);
              onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          {/* Date fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                תחילת שבוע
              </span>
              <input
                value={weekStart}
                readOnly
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 cursor-not-allowed"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                תאריך משמרת
              </span>
              <input
                type="date"
                value={values.shiftDate}
                onChange={(event) => {
                  const nextShiftDate = event.target.value;
                  setValues((prev) => ({
                    ...prev,
                    shiftDate: nextShiftDate,
                    ...(mode === "create"
                      ? getDefaultStaffingValues(nextShiftDate, prev.startTime)
                      : {}),
                  }));
                }}
                required
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none transition-all"
              />
            </label>
          </div>

          {/* Time fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                שעת התחלה
              </span>
              <input
                type="time"
                value={values.startTime}
                onChange={(event) => {
                  const nextStartTime = event.target.value;
                  setValues((prev) => ({
                    ...prev,
                    startTime: nextStartTime,
                    ...(mode === "create"
                      ? getDefaultStaffingValues(prev.shiftDate, nextStartTime)
                      : {}),
                  }));
                }}
                required
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none transition-all"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                שעת סיום
                {isOvernight && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-indigo-600 mr-1">
                    <Moon className="w-3 h-3" />+1
                  </span>
                )}
              </span>
              <input
                type="time"
                value={values.endTime}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, endTime: event.target.value }))
                }
                required
                className={`h-10 rounded-xl border px-3 text-sm outline-none transition-all ${
                  isOvernight
                    ? "border-indigo-300 bg-indigo-50/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    : "border-slate-200 focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb]"
                }`}
              />
            </label>
          </div>

          {/* Overnight banner */}
          {isOvernight && (
            <div className="flex items-center gap-2.5 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-800">
              <Moon className="w-4 h-4 shrink-0 text-indigo-600" />
              <span>
                <strong>משמרת לילה</strong> — שעת הסיום ({values.endTime}) היא ביום למחרת (+1).
              </span>
            </div>
          )}

          {/* Staff fields */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">הרכב צוות נדרש</p>
            <div className="grid grid-cols-2 gap-3">
              {staffingFields.map((field) => (
                <label key={field.field} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-500">{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    value={values[field.field]}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.field]: Number(event.target.value),
                      }))
                    }
                    required
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none transition-all"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-11 rounded-xl bg-[#1d5c8b] text-white font-semibold text-sm hover:bg-[#164e78] disabled:opacity-60 transition-colors shadow-sm inline-flex items-center justify-center gap-2"
            >
              {saving ? <LoadingSpinner className="w-4 h-4" /> : null}
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
