import { Pencil, Trash2, Stethoscope, UserRoundPlus } from "lucide-react";
import type { Shift } from "../types";

type Props = {
  shift: Shift;
  onEdit: (shift: Shift) => void;
  onDelete: (shiftId: number) => void;
};

export default function ShiftCard({ shift, onEdit, onDelete }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm space-y-2">
      <p className="font-semibold text-slate-800 text-sm">
        {shift.startTime} - {shift.endTime}
      </p>

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
