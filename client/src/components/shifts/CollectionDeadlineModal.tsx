import { CalendarClock, Clock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "../ui/LoadingIndicator";

type Props = {
  isOpen: boolean;
  weekStart: string;
  currentDeadline: string | null;
  onClose: () => void;
  onSubmit: (deadlineIso: string) => Promise<void>;
};

function toLocalDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeDeadlineForInput(deadlineIso: string | null) {
  if (!deadlineIso) {
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return toLocalDateTimeInputValue(fallback);
  }

  const parsed = new Date(deadlineIso);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return toLocalDateTimeInputValue(fallback);
  }

  return toLocalDateTimeInputValue(parsed);
}

function localInputToIso(localValue: string) {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

export default function CollectionDeadlineModal({
  isOpen,
  weekStart,
  currentDeadline,
  onClose,
  onSubmit,
}: Props) {
  const [deadlineInput, setDeadlineInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeadlineInput(normalizeDeadlineForInput(currentDeadline));
    setSaving(false);
  }, [currentDeadline, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
      <section dir="rtl" className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0f2a44] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-white/80" />
            <h2 className="text-lg font-bold text-white">קביעת דדליין לאיסוף</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <form
          className="p-6 space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();

            const deadlineIso = localInputToIso(deadlineInput);
            if (!deadlineIso) {
              alert("יש להזין תאריך ושעה תקינים.");
              return;
            }

            try {
              setSaving(true);
              await onSubmit(deadlineIso);
              onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          <p className="text-sm text-slate-600">
            תחילת שבוע: <strong className="text-slate-900">{weekStart || "-"}</strong>
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              דדליין לאיסוף אילוצים
            </span>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(event) => setDeadlineInput(event.target.value)}
              required
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#1d5c8b] focus:ring-2 focus:ring-[#ebf4fb] outline-none transition-all"
            />
          </label>

          <p className="text-xs text-slate-400">
            התאריך והשעה נשלחים לשרת עם מידע על אזור הזמן המקומי.
          </p>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[#1d5c8b] text-white font-semibold text-sm hover:bg-[#164e78] disabled:opacity-60 transition-colors shadow-sm inline-flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <LoadingSpinner className="w-4 h-4" />
                    שומר...
                  </>
                ) : (
                  "פתח איסוף אילוצים"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                ביטול
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDeadlineInput(toLocalDateTimeInputValue(new Date()))}
              className="w-full h-10 rounded-xl border border-amber-200 text-amber-800 bg-amber-50 text-sm font-medium hover:bg-amber-100 transition-colors"
            >
              קבע דדליין לעכשיו
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
