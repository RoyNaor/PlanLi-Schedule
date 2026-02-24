import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Shift } from "../types";

type ShiftFormValues = {
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
};

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
    return {
      shiftDate,
      startTime: "08:00",
      endTime: "16:00",
      minDoctors: 1,
      minNurses: 1,
    };
  }

  return {
    shiftDate: shiftToEdit.shiftDate,
    startTime: shiftToEdit.startTime,
    endTime: shiftToEdit.endTime,
    minDoctors: shiftToEdit.minDoctors,
    minNurses: shiftToEdit.minNurses,
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

  const submitLabel = useMemo(
    () => (saving ? "שומר..." : mode === "create" ? "הוספה" : "שמירת שינויים"),
    [mode, saving],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center px-4">
      <section className="w-full max-w-lg bg-white rounded-2xl border-2 border-slate-800 shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form
          className="space-y-4"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">week_start</span>
              <input
                value={weekStart}
                readOnly
                className="h-11 rounded-xl border border-slate-300 bg-slate-100 px-3 text-slate-700"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">shift_date</span>
              <input
                type="date"
                value={values.shiftDate}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, shiftDate: event.target.value }))
                }
                required
                className="h-11 rounded-xl border border-slate-300 px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">start_time</span>
              <input
                type="time"
                value={values.startTime}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, startTime: event.target.value }))
                }
                required
                className="h-11 rounded-xl border border-slate-300 px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">end_time</span>
              <input
                type="time"
                value={values.endTime}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, endTime: event.target.value }))
                }
                required
                className="h-11 rounded-xl border border-slate-300 px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">min_doctors</span>
              <input
                type="number"
                min={0}
                value={values.minDoctors}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    minDoctors: Number(event.target.value),
                  }))
                }
                required
                className="h-11 rounded-xl border border-slate-300 px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">min_nurses</span>
              <input
                type="number"
                min={0}
                value={values.minNurses}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    minNurses: Number(event.target.value),
                  }))
                }
                required
                className="h-11 rounded-xl border border-slate-300 px-3"
              />
            </label>
          </div>

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
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
