import { Bot } from "lucide-react";

export function ChatHeader() {
  return (
    <div className="bg-[#0f2a44] px-4 py-3 flex items-center gap-3" dir="rtl">
      <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
        <Bot className="w-5 h-5 text-white" aria-hidden="true" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">עוזר שיבוצים</p>
        <p className="text-[11px] text-white/50">מוכן לעזור</p>
      </div>
    </div>
  );
}
