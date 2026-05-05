import { Moon, Pencil, Trash2 } from "lucide-react";
import { getNonZeroStaffingSummary } from "../../utils/staffing";
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
  const staffingSummary = getNonZeroStaffingSummary(shift);

  return (
    <article
      className={`rounded-lg border-l-4 px-2.5 py-2 text-xs space-y-1.5 ${
        overnight
          ? "border-indigo-500 bg-indigo-50/50 border border-indigo-100"
          : "border-[#1d5c8b] bg-[#ebf4fb]/70 border border-blue-100"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className={`font-semibold text-sm ${overnight ? "text-indigo-800" : "text-[#1d5c8b]"}`}>
          {shift.startTime}
          {" – "}
          <span>{shift.endTime}</span>
        </p>
        {overnight && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 shrink-0">
            <Moon className="w-2.5 h-2.5" />
            +1
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-500">
        {staffingSummary.length === 0 ? (
          <p className="col-span-2">אין דרישות צוות</p>
        ) : (
          staffingSummary.map((field) => (
            <p key={field.field} className="truncate">
              {field.label}: {field.value}
            </p>
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => onEdit(shift)}
          className="p-1.5 rounded-md hover:bg-blue-100 text-slate-400 hover:text-[#1d5c8b] transition-colors"
          title="עריכת משמרת"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(shift.id)}
          className="p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
          title="מחיקת משמרת"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </article>
  );
}
