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
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          aria-label="לפני"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          aria-label="אחרי"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      <button
        type="button"
        className="flex items-center gap-2 text-base font-semibold text-slate-800"
        onClick={onToday}
      >
        <CalendarDays className="w-4 h-4 text-[#1d5c8b]" />
        {centerLabel}
      </button>

      <button
        type="button"
        onClick={onToday}
        className="text-sm text-[#1d5c8b] font-medium hover:underline"
      >
        היום
      </button>
    </div>
  );
}
