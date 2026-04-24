export function ChatHeader() {
  return (
    <div className="bg-[#0f2a44] px-4 py-3 flex items-center gap-3" dir="rtl">
      {/* Bot avatar */}
      <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
        </svg>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">עוזר שיבוצים</p>
        <p className="text-[11px] text-white/50">מוכן לעזור</p>
      </div>
    </div>
  );
}
