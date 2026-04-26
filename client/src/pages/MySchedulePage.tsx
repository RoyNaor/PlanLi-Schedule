import { Navigate } from "react-router-dom";
import { AuthService } from "../services/auth.service";
import { useMySchedule } from "../hooks/useMySchedule";
import { ViewModeTabs } from "../components/my-schedule/ViewModeTabs";
import { ScheduleDateNavBar } from "../components/my-schedule/ScheduleDateNavBar";
import { ScheduleWeekView } from "../components/my-schedule/ScheduleWeekView";
import { ScheduleDayView } from "../components/my-schedule/ScheduleDayView";
import { ScheduleMonthView } from "../components/my-schedule/ScheduleMonthView";
import { ScheduleYearView } from "../components/my-schedule/ScheduleYearView";

export default function MySchedulePage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const s = useMySchedule(token);

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הסידור שלי</h1>
          <p className="text-sm text-slate-500 mt-0.5">{s.subtitle}</p>
        </div>

        <ViewModeTabs value={s.viewMode} onChange={s.setViewMode} />

        <ScheduleDateNavBar
          centerLabel={s.centerLabel}
          onPrev={s.onPrev}
          onNext={s.onNext}
          onToday={s.onToday}
        />

        {s.viewMode === "week" && (
          <ScheduleWeekView
            weekDates={s.weekDates}
            todayIso={s.todayIso}
            loading={s.loading}
            assignmentsByDate={s.assignmentsByDate}
            onSelectDay={s.goToDay}
            highlightKey={s.highlightKey}
          />
        )}

        {s.viewMode === "day" && (
          <ScheduleDayView
            focusIso={s.focusIso}
            focusWeekdayLabel={s.focusWeekdayLabel}
            loading={s.loading}
            assignments={s.assignmentsByDate.get(s.focusIso) ?? []}
            displayWeekStart={s.displayWeekStart}
          />
        )}

        {s.viewMode === "month" && (
          <ScheduleMonthView
            monthRows={s.monthRows}
            todayIso={s.todayIso}
            loading={s.loading}
            assignmentsByDate={s.assignmentsByDate}
            onSelectDay={s.goToDay}
            onSelectWeek={s.goToWeek}
            highlightKey={s.highlightKey}
          />
        )}

        {s.viewMode === "year" && (
          <ScheduleYearView
            yForYear={s.yForYear}
            yearWeekStarts={s.requiredWeekStarts}
            weekCache={s.weekCache}
            todayIso={s.todayIso}
            loading={s.loading}
            onSelectDay={s.goToDay}
            onSelectMonth={s.goToMonth}
            onSelectWeek={s.goToWeek}
            highlightKey={s.highlightKey}
          />
        )}

        {!s.loading && s.error ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {s.error}
          </div>
        ) : null}

        {s.showEmpty ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            עדיין לא פורסם סידור לתקופה הנבחרת.
          </div>
        ) : null}

        {!s.loading && (s.viewMode === "week" || s.viewMode === "day") && s.singleWeekPayload ? (
          <p className="text-xs text-slate-400 text-center">
            גרסה #{s.singleWeekPayload.version.versionNumber} · {s.singleWeekPayload.assignments.length} משמרות
          </p>
        ) : null}

        {!s.loading && (s.viewMode === "month" || s.viewMode === "year") && s.totalInView > 0 ? (
          <p className="text-xs text-slate-400 text-center">סה״כ {s.totalInView} משמרות</p>
        ) : null}
      </div>
    </div>
  );
}
