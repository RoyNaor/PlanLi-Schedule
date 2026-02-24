interface ChatHeaderProps {
  displayName?: string;
  role?: string;
  weekStart?: string;
  onRefresh?: () => void;
  loading: boolean;
}

const roleLabels: Record<string, string> = {
  doctor: "רופא/ה",
  nurse: "אח/ות",
  admin: "מנהל/ת",
};

const roleStyles: Record<string, string> = {
  doctor: "bg-sky-100/80 text-sky-800 ring-sky-200",
  nurse: "bg-violet-100/80 text-violet-800 ring-violet-200",
  admin: "bg-amber-100/80 text-amber-800 ring-amber-200",
};

export function ChatHeader({
  displayName,
  role,
  weekStart,
  onRefresh,
  loading,
}: ChatHeaderProps) {
  const normalizedRole = role?.toLowerCase().trim() ?? "";
  const roleLabel = roleLabels[normalizedRole] ?? "צוות רפואי";
  const roleStyle = roleStyles[normalizedRole] ?? "bg-slate-100/80 text-slate-700 ring-slate-200";

  return (
    <header
      dir="rtl"
      className="relative overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-l from-slate-50 via-white to-cyan-50/60 px-4 py-4 shadow-sm backdrop-blur sm:px-6 sm:py-5"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.12),_transparent_42%)]" />

      <div className="relative flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-cyan-700/80">מערכת תזמון חכמה</p>
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">עוזר השיבוץ הרפואי</h1>
            <p className="text-sm text-slate-600">ניהול שיחות והעדפות משמרות עבור מחלקות וצוותים</p>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${roleStyle}`}>
              {roleLabel}
            </span>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="רענון נתוני שיחה"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden="true" className={loading ? "animate-spin" : ""}>
                  ↻
                </span>
                <span>{loading ? "מרענן" : "רענון"}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">משתמש מחובר</p>
            <p className="truncate text-sm font-semibold text-slate-800 sm:text-base">{displayName?.trim() || "משתמש/ת מערכת"}</p>
          </div>

          <div className="text-right sm:text-left">
            <p className="text-xs font-medium text-slate-500">שבוע פעיל</p>
            <p className="text-sm font-semibold text-slate-800 sm:text-base">{weekStart?.trim() || "לא נבחר שבוע"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
