import { CalendarDays, ChevronLeft, ChevronRight, Copy } from "lucide-react";

type Props = {
  selectedWeekRangeLabel: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  canDuplicate: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenPicker: () => void;
  onOpenDuplicate: () => void;
};

export default function WeekBar({
  selectedWeekRangeLabel,
  canGoPrev,
  canGoNext,
  canDuplicate,
  onPrev,
  onNext,
  onOpenPicker,
  onOpenDuplicate,
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

        <button
          type="button"
          onClick={onOpenDuplicate}
          disabled={!canDuplicate}
          className="h-11 px-4 rounded-xl border border-slate-300 text-slate-700 inline-flex items-center gap-2 hover:bg-slate-50 disabled:opacity-40"
        >
          <Copy className="w-4 h-4" />
          שכפול שבוע
        </button>
      </div>
    </section>
  );
}
