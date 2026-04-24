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
    <section className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoPrev}
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors"
            aria-label="שבוע קודם"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors"
            aria-label="שבוע הבא"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenPicker}
          className="flex items-center gap-2 text-base font-semibold text-slate-800 hover:text-[#1d5c8b] transition-colors"
        >
          <CalendarDays className="w-4 h-4 text-[#1d5c8b]" />
          {selectedWeekRangeLabel}
        </button>

        <button
          type="button"
          onClick={onOpenDuplicate}
          disabled={!canDuplicate}
          className="h-9 px-3 rounded-lg border border-slate-200 text-slate-600 text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          שכפול שבוע
        </button>
      </div>
    </section>
  );
}
