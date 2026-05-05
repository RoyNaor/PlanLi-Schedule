import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthService } from "../services/auth.service";
import { useMySchedule } from "../hooks/useMySchedule";
import { ViewModeTabs } from "../components/my-schedule/ViewModeTabs";
import { ScheduleDateNavBar } from "../components/my-schedule/ScheduleDateNavBar";
import { ScheduleWeekView } from "../components/my-schedule/ScheduleWeekView";
import { ScheduleDayView } from "../components/my-schedule/ScheduleDayView";
import { ScheduleMonthView } from "../components/my-schedule/ScheduleMonthView";
import { ScheduleYearView } from "../components/my-schedule/ScheduleYearView";
import {
  CalendarSyncService,
  type CalendarStatus,
} from "../services/calendar-sync.service";

export default function MySchedulePage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const s = useMySchedule(token);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");

  const statusLine = useMemo(() => {
    if (!calendarStatus) return "טוען סטטוס סנכרון...";
    if (!calendarStatus.connected) return "Google Calendar לא מחובר עדיין.";
    if (!calendarStatus.lastSyncAt) return "מחובר. עדיין אין סנכרון ראשון.";
    return `מחובר. סנכרון אחרון: ${new Date(calendarStatus.lastSyncAt).toLocaleString("he-IL")}`;
  }, [calendarStatus]);

  const loadCalendarStatus = async () => {
    if (!token) return;
    try {
      const status = await CalendarSyncService.getStatus(token);
      setCalendarStatus(status);
    } catch {
      setCalendarMessage("שגיאה בטעינת סטטוס סנכרון יומן.");
    }
  };

  useEffect(() => {
    if (token) {
      void CalendarSyncService.getStatus(token)
        .then((status) => setCalendarStatus(status))
        .catch(() => setCalendarMessage("שגיאה בטעינת סטטוס סנכרון יומן."));
    }

    const onConnected = () => {
      setCalendarMessage("החיבור ל-Google Calendar הצליח.");
      void loadCalendarStatus();
    };
    window.addEventListener("message", onConnected);
    return () => window.removeEventListener("message", onConnected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onConnectGoogle = async () => {
    try {
      setCalendarBusy(true);
      setCalendarMessage("");
      const authUrl = await CalendarSyncService.getConnectUrl(token);
      window.open(authUrl, "planli-google-oauth", "width=520,height=700");
    } catch {
      setCalendarMessage("שגיאה בהתחלת חיבור ל-Google Calendar.");
    } finally {
      setCalendarBusy(false);
    }
  };

  const onSyncWeek = async () => {
    if (!s.displayWeekStart) return;
    try {
      setCalendarBusy(true);
      setCalendarMessage("");
      await CalendarSyncService.syncOutbound(token, s.displayWeekStart);
      setCalendarMessage("הסידור פורסם וסונכרן ליומן Google.");
      await loadCalendarStatus();
    } catch {
      setCalendarMessage("שגיאה בסנכרון השבוע הנוכחי.");
    } finally {
      setCalendarBusy(false);
    }
  };

  const onCopyWebcal = async () => {
    if (!calendarStatus?.webcalUrl) return;
    try {
      await navigator.clipboard.writeText(calendarStatus.webcalUrl);
      setCalendarMessage("קישור WebCal הועתק.");
    } catch {
      setCalendarMessage("לא ניתן להעתיק קישור WebCal.");
    }
  };

  const onRotateToken = async () => {
    try {
      setCalendarBusy(true);
      setCalendarMessage("");
      const rotated = await CalendarSyncService.rotateFeedToken(token);
      setCalendarStatus((prev) =>
        prev
          ? {
              ...prev,
              webcalUrl: rotated.webcal_url,
            }
          : prev,
      );
      setCalendarMessage("נוצר קישור WebCal חדש.");
    } catch {
      setCalendarMessage("שגיאה בהחלפת קישור WebCal.");
    } finally {
      setCalendarBusy(false);
    }
  };

  const onDisconnect = async () => {
    try {
      setCalendarBusy(true);
      setCalendarMessage("");
      await CalendarSyncService.disconnect(token);
      setCalendarMessage("החיבור ל-Google Calendar נותק.");
      await loadCalendarStatus();
    } catch {
      setCalendarMessage("שגיאה בניתוק החיבור.");
    } finally {
      setCalendarBusy(false);
    }
  };

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הסידור שלי</h1>
          <p className="text-sm text-slate-500 mt-0.5">{s.subtitle}</p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">סנכרון יומן למכשיר</h2>
              <p className="text-sm text-slate-500 mt-1">{statusLine}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onConnectGoogle}
                disabled={calendarBusy}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                חבר Google Calendar
              </button>
              <button
                type="button"
                onClick={onSyncWeek}
                disabled={calendarBusy || !s.displayWeekStart}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                סנכרן שבוע נוכחי
              </button>
              <button
                type="button"
                onClick={onCopyWebcal}
                disabled={calendarBusy || !calendarStatus?.webcalUrl}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                העתק קישור WebCal
              </button>
              <button
                type="button"
                onClick={onRotateToken}
                disabled={calendarBusy}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                החלף קישור WebCal
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                disabled={calendarBusy || !calendarStatus?.connected}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                נתק חיבור
              </button>
            </div>
          </div>
          {calendarStatus?.webcalUrl ? (
            <p className="mt-3 text-xs break-all text-slate-500">{calendarStatus.webcalUrl}</p>
          ) : null}
          {calendarMessage ? <p className="mt-3 text-sm text-slate-600">{calendarMessage}</p> : null}
        </section>

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
