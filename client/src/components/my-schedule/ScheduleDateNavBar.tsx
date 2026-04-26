import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  centerLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function ScheduleDateNavBar({ centerLabel, onPrev, onNext, onToday }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onToday}
        className="flex h-9 shrink-0 select-none items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-all duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] active:bg-slate-100"
      >
        היום
      </button>

      <button
        type="button"
        className="flex select-none items-center gap-2 rounded-lg px-2 py-1.5 -my-0.5 text-base font-semibold text-slate-800 transition-all duration-150 ease-out active:scale-[0.99] active:bg-slate-100/80"
        onClick={onToday}
      >
        <CalendarDays className="w-4 h-4 text-[#1d5c8b]" />
        {centerLabel}
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          className="flex h-9 w-9 select-none items-center justify-center rounded-lg border border-slate-200 transition-all duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] active:bg-slate-100"
          aria-label="לפני"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex h-9 w-9 select-none items-center justify-center rounded-lg border border-slate-200 transition-all duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] active:bg-slate-100"
          aria-label="אחרי"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </div>
  );
}
