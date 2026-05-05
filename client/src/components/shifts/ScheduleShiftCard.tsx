import { Moon, Plus, X } from "lucide-react";
import { getRoleIcon, getRoleLabel } from "../../utils/staffing";
import { LoadingSpinner } from "../ui/LoadingIndicator";
import type { Shift } from "../types";

export type ShiftAssignmentEntry = {
  userId: string;
  userFullName: string;
  userRole: string;
  source: "solver" | "manual";
};

type StaffOption = { id: string; full_name: string; role: string };

type Props = {
  shift: Shift;
  assignments: ShiftAssignmentEntry[];
  editMode?: boolean;
  saving?: boolean;
  availableStaff?: StaffOption[];
  selectedAddUserId?: string;
  onSelectAddUser?: (shiftId: number, userId: string) => void;
  onAddAssignment?: (shiftId: number) => void;
  onRemoveAssignment?: (shiftId: number, userId: string) => void;
};

function isOvernightShift(startTime: string, endTime: string): boolean {
  return endTime !== "" && startTime !== "" && endTime <= startTime;
}

export default function ScheduleShiftCard({
  shift,
  assignments,
  editMode = false,
  saving = false,
  availableStaff = [],
  selectedAddUserId = "",
  onSelectAddUser,
  onAddAssignment,
  onRemoveAssignment,
}: Props) {
  const overnight = isOvernightShift(shift.startTime, shift.endTime);

  return (
    <article
      className={`rounded-lg border-l-4 border-green-600 bg-green-50/70 border border-green-200 px-2.5 py-2 text-xs space-y-1.5 ${
        editMode ? "ring-1 ring-green-300" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="font-semibold text-sm text-green-800">
          {shift.startTime}
          {" – "}
          <span>{shift.endTime}</span>
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {overnight && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              <Moon className="w-2.5 h-2.5" />
              +1
            </span>
          )}
          <span className="text-[10px] font-semibold text-green-700 bg-white border border-green-200 rounded-full px-1.5 py-0.5">
            {assignments.length}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {assignments.map((a) => {
          const Icon = getRoleIcon(a.userRole);
          return (
            <div
              key={`${shift.id}-${a.userId}`}
              className="flex items-center gap-1.5 bg-white rounded-md px-1.5 py-1"
            >
              <Icon className="w-3 h-3 text-green-700 shrink-0" />
              <span className="text-[11px] font-medium text-slate-800 truncate flex-1">
                {a.userFullName}
              </span>
              <span className="text-[10px] text-green-700 shrink-0">
                {getRoleLabel(a.userRole)}
              </span>
              {a.source === "manual" && (
                <span className="text-[9px] rounded-full bg-slate-100 text-slate-600 px-1 font-semibold shrink-0">
                  ידני
                </span>
              )}
              {editMode && onRemoveAssignment && (
                <button
                  type="button"
                  onClick={() => onRemoveAssignment(shift.id, a.userId)}
                  disabled={saving}
                  className="w-4 h-4 rounded-full bg-red-100 hover:bg-red-200 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
                  title="הסר שיבוץ"
                >
                  {saving ? (
                    <LoadingSpinner className="w-2.5 h-2.5 text-red-600" />
                  ) : (
                    <X className="w-2.5 h-2.5 text-red-600" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editMode && (
        <div className="flex items-center gap-1 pt-1 border-t border-dashed border-green-200">
          <select
            value={selectedAddUserId}
            onChange={(e) => onSelectAddUser?.(shift.id, e.target.value)}
            disabled={saving}
            className="flex-1 min-w-0 text-[10px] rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">+ עובד</option>
            {availableStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({getRoleLabel(s.role)})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onAddAssignment?.(shift.id)}
            disabled={!selectedAddUserId || saving}
            className="h-5 w-5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
            title="הוסף עובד"
          >
            {saving ? (
              <LoadingSpinner className="w-2.5 h-2.5 text-white" />
            ) : (
              <Plus className="w-2.5 h-2.5 text-white" />
            )}
          </button>
        </div>
      )}
    </article>
  );
}
