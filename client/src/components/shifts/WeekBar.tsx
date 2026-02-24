import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  selectedWeekRangeLabel: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenPicker: () => void;
};

export default function WeekBar({
  selectedWeekRangeLabel,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onOpenPicker,
}: Props) {
  return (
    <section className="bg-white border-2 border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canGoPrev}
          className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center disabled:opacity-40"
          aria-label="שבוע קודם"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onOpenPicker}
          className="flex items-center gap-2 text-lg font-semibold text-slate-900"
        >
          <CalendarDays className="w-5 h-5 text-emerald-600" />
          {selectedWeekRangeLabel}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center disabled:opacity-40"
          aria-label="שבוע הבא"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
