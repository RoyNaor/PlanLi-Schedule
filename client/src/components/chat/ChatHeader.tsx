export function ChatHeader() {
  return (
    <header
      dir="rtl"
      className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-l from-emerald-50 via-white to-emerald-100/60 px-6 py-6 shadow-sm"
    >
      {/* Glow effect */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_45%)]" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Right side – Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
            🤖
          </div>

          <div>
            <h1 className="text-xl font-semibold text-emerald-900">
              עוזר שיבוצים אישי
            </h1>
            <p className="text-sm text-emerald-700">
              מתזמנים חכם. עובדים רגוע.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
