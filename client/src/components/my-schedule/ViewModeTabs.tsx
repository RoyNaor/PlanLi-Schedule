import { clsx } from "clsx";
import type { ViewMode } from "./types";

const TABS: { id: ViewMode; label: string }[] = [
  { id: "day", label: "יום" },
  { id: "week", label: "שבוע" },
  { id: "month", label: "חודש" },
  { id: "year", label: "שנה" },
];

export function ViewModeTabs({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center">
      <div
        className="inline-flex p-1 rounded-full bg-slate-100/90 border border-slate-200/80 gap-0.5"
        role="tablist"
        aria-label="תצוגה לפי יום שבוע חודש שנה"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={value === id}
            onClick={() => onChange(id)}
            className={clsx(
              "px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
              value === id
                ? "bg-[#1d5c8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-white/60",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
