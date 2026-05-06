import { CalendarDays, Clock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "../ui/LoadingIndicator";
import type { Shift, WorkerType } from "../types";

export type MonthlyShiftFormValues = {
  shiftDate: string;
  startTime: string;
  endTime: string;
  label: string;
  requirements: Array<{ workerTypeId: string; count: number }>;
};

type Props = {
  isOpen: boolean;
  mode: "create" | "edit";
  initialShiftDate: string;
  shiftToEdit: Shift | null;
  workerTypes: WorkerType[];
  onClose: () => void;
  onSubmit: (values: MonthlyShiftFormValues) => Promise<void>;
};

function initialRequirementMap(workerTypes: WorkerType[], shift: Shift | null) {
  const map: Record<string, number> = {};
  for (const workerType of workerTypes) {
    map[workerType.id] = 0;
  }
  for (const requirement of shift?.requirements ?? []) {
    map[requirement.workerTypeId] = requirement.count;
  }
  return map;
}

export default function MonthlyShiftFormModal({
  isOpen,
  mode,
  initialShiftDate,
  shiftToEdit,
  workerTypes,
  onClose,
  onSubmit,
}: Props) {
  const [shiftDate, setShiftDate] = useState(initialShiftDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [label, setLabel] = useState("");
  const [requirements, setRequirements] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShiftDate(shiftToEdit?.shiftDate ?? initialShiftDate);
    setStartTime(shiftToEdit?.startTime?.slice(0, 5) ?? "08:00");
    setEndTime(shiftToEdit?.endTime?.slice(0, 5) ?? "16:00");
    setLabel(shiftToEdit?.label ?? shiftToEdit?.arrangementName ?? "");
    setRequirements(initialRequirementMap(workerTypes, shiftToEdit));
  }, [initialShiftDate, isOpen, shiftToEdit, workerTypes]);

  const title = mode === "create" ? "הוספת משמרת חודשית" : "עריכת משמרת חודשית";
  const isOvernight = endTime <= startTime;
  const activeWorkerTypes = useMemo(
    () => workerTypes.filter((workerType) => workerType.isActive),
    [workerTypes],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
      <section dir="rtl" className="w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-[#0f2a44] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label="סגירה"
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
              await onSubmit({
                shiftDate,
                startTime,
                endTime,
                label: label.trim(),
                requirements: Object.entries(requirements)
                  .map(([workerTypeId, count]) => ({ workerTypeId, count: Number(count) || 0 }))
                  .filter((requirement) => requirement.count > 0),
              });
              onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                תאריך משמרת
              </span>
              <input
                type="date"
                value={shiftDate}
                onChange={(event) => setShiftDate(event.target.value)}
                required
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">שם/סידור</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="לדוגמה: חדר לידה, מיון, מרפאה"
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                שעת התחלה
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">
                שעת סיום {isOvernight ? <span className="text-indigo-600 font-bold">(+1)</span> : null}
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none"
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">דרישות כוח אדם לפי סוג עובד</p>
            {activeWorkerTypes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                עדיין אין סוגי עובדים. ייבא אקסל או צור סוג עובד במסך המשתמשים.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeWorkerTypes.map((workerType) => (
                  <label key={workerType.id} className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-500">{workerType.name}</span>
                    <input
                      type="number"
                      min={0}
                      value={requirements[workerType.id] ?? 0}
                      onChange={(event) =>
                        setRequirements((prev) => ({
                          ...prev,
                          [workerType.id]: Number(event.target.value),
                        }))
                      }
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || activeWorkerTypes.length === 0}
              className="flex-1 h-11 rounded-xl bg-[#1d5c8b] text-white font-semibold text-sm hover:bg-[#164e78] disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving ? <LoadingSpinner className="w-4 h-4" /> : null}
              {saving ? "שומר..." : mode === "create" ? "הוספה" : "שמירת שינויים"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              ביטול
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
