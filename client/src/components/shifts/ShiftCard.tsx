import { Moon, Pencil, Stethoscope, Trash2, UserRoundPlus } from "lucide-react";
import type { Shift } from "../types";

type Props = {
  shift: Shift;
  onEdit: (shift: Shift) => void;
  onDelete: (shiftId: number) => void;
};

function isOvernightShift(startTime: string, endTime: string): boolean {
  return endTime !== "" && startTime !== "" && endTime <= startTime;
}

export default function ShiftCard({ shift, onEdit, onDelete }: Props) {
  const overnight = isOvernightShift(shift.startTime, shift.endTime);

  return (
    <article className={`rounded-xl border p-3 text-xs shadow-sm space-y-2 ${overnight ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="font-semibold text-slate-800 text-sm">
          {shift.startTime} -{" "}
          <span className={overnight ? "text-indigo-700" : undefined}>
            {shift.endTime}
          </span>
        </p>
        {overnight && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 shrink-0">
            <Moon className="w-3 h-3" />
            +1
          </span>
        )}
      </div>

      <div className="space-y-1 text-slate-600">
        <p className="flex items-center gap-1">
          <Stethoscope className="w-3.5 h-3.5" />
          רופאים: {shift.minDoctors}
        </p>
        <p className="flex items-center gap-1">
          <UserRoundPlus className="w-3.5 h-3.5" />
          אחיות: {shift.minNurses}
        </p>
      </div>

      <div className="flex items-center justify-end gap-1 pt-1">
        <button
          type="button"
          onClick={() => onEdit(shift)}
          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700"
          title="עריכת משמרת"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(shift.id)}
          className="p-1.5 rounded-lg hover:bg-red-100 text-red-700"
          title="מחיקת משמרת"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}
