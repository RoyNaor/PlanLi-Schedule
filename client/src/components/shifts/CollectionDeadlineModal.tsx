import { CalendarClock, X } from "lucide-react";
import { useEffect, useState } from "react";

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
    setDeadlineInput(normalizeDeadlineForInput(currentDeadline));
    setSaving(false);
  }, [currentDeadline, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center px-4">
      <section className="w-full max-w-xl bg-white rounded-2xl border-2 border-slate-800 shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-emerald-700" />
            <h2 className="text-2xl font-semibold text-slate-900">Set Collective Deadline</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();

            const deadlineIso = localInputToIso(deadlineInput);
            if (!deadlineIso) {
              alert("Please provide a valid deadline.");
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
            Week start: <strong className="text-slate-900">{weekStart || "-"}</strong>
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Collection deadline</span>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(event) => setDeadlineInput(event.target.value)}
              required
              className="h-11 rounded-xl border border-slate-300 px-3"
            />
          </label>

          <p className="text-xs text-slate-500">
            The selected date/time is sent with timezone information to the API.
          </p>

          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeadlineInput(toLocalDateTimeInputValue(new Date()))}
              className="h-11 px-4 rounded-xl border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
            >
              Set Deadline to Now
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl border border-slate-300 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-11 px-5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Open Collection"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
