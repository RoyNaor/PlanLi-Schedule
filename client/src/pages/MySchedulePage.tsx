import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, Stethoscope, UserRoundPlus, Moon } from "lucide-react";
import { AuthService } from "../services/auth.service";
import {
  addDaysToIsoDate,
  getJerusalemTodayIsoDate,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

interface ScheduleVersionSummary {
  id: string;
  weekStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
}

interface ScheduleAssignment {
  shiftId: number;
  shiftDate: string;
  startTime: string;
  endTime: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  userRole: string;
  source: "solver" | "manual";
}

interface SchedulePayload {
  weekStart: string;
  version: ScheduleVersionSummary;
  assignments: ScheduleAssignment[];
}

interface ScheduleResponse {
  schedule: SchedulePayload;
}

const weekDayLabels = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const dayNumberFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const monthYearFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

function isOvernight(startTime: string, endTime: string) {
  return endTime !== "" && startTime !== "" && endTime <= startTime;
}

export default function MySchedulePage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekSundayIso(getJerusalemTodayIsoDate()),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysToIsoDate(weekStart, i)),
    [weekStart],
  );

  const monthYearLabel = useMemo(() => {
    const d = parseIsoDateToUtc(weekStart);
    if (Number.isNaN(d.getTime())) return "";
    return monthYearFormatter.format(d);
  }, [weekStart]);

  const todayIso = getJerusalemTodayIsoDate();

  useEffect(() => {
    if (!token || !weekStart) return;

    const fetchSchedule = async () => {
      try {
        setLoading(true);
        setError("");
        setSchedule(null);

        const response = await axios.get<ScheduleResponse>(`${API_BASE}/my-schedule`, {
          params: { week_start: weekStart },
          headers: authHeaders,
        });

        setSchedule(response.data.schedule);
      } catch (requestError: any) {
        const status = requestError?.response?.status;
        if (status === 404) {
          setSchedule(null);
          setError("עדיין לא פורסם סידור לשבוע הנבחר.");
          return;
        }
        const message = requestError?.response?.data?.error ?? "שגיאה בטעינת הסידור";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchSchedule();
  }, [authHeaders, token, weekStart]);

  const assignmentsByDate = useMemo(() => {
    if (!schedule) return new Map<string, ScheduleAssignment[]>();
    const map = new Map<string, ScheduleAssignment[]>();
    for (const a of schedule.assignments) {
      if (!map.has(a.shiftDate)) map.set(a.shiftDate, []);
      map.get(a.shiftDate)!.push(a);
    }
    return map;
  }, [schedule]);

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הסידור שלי</h1>
          <p className="text-sm text-slate-500 mt-0.5">המשמרות המאושרות שלך לשבוע הנבחר.</p>
        </div>

        {/* Week navigation — Google Calendar style */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekStart((w) => addDaysToIsoDate(w, -7))}
              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
              aria-label="שבוע קודם"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart((w) => addDaysToIsoDate(w, 7))}
              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
              aria-label="שבוע הבא"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 text-base font-semibold text-slate-800"
            onClick={() => setWeekStart(startOfWeekSundayIso(getJerusalemTodayIsoDate()))}
          >
            <CalendarDays className="w-4 h-4 text-[#1d5c8b]" />
            {monthYearLabel}
          </button>

          <button
            type="button"
            onClick={() => setWeekStart(startOfWeekSundayIso(getJerusalemTodayIsoDate()))}
            className="text-sm text-[#1d5c8b] font-medium hover:underline"
          >
            היום
          </button>
        </div>

        {/* Calendar week view */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {weekDates.map((isoDate, index) => {
              const isToday = isoDate === todayIso;
              return (
                <div
                  key={isoDate}
                  className="py-3 text-center border-l border-slate-200 last:border-l-0"
                >
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    יום {weekDayLabels[index]}
                  </p>
                  <div className="flex justify-center">
                    <span
                      className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-[#1d5c8b] text-white" : "text-slate-800"
                      }`}
                    >
                      {dayNumberFormatter.format(parseIsoDateToUtc(isoDate))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Week body */}
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">טוען סידור...</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 min-h-[300px]" style={{ minWidth: "560px" }}>
                {weekDates.map((isoDate) => {
                  const dayAssignments = assignmentsByDate.get(isoDate) ?? [];
                  const isToday = isoDate === todayIso;

                  return (
                    <div
                      key={isoDate}
                      className={`border-l border-slate-200 last:border-l-0 p-2 flex flex-col gap-1.5 ${
                        isToday ? "bg-blue-50/40" : ""
                      }`}
                    >
                      {dayAssignments.length === 0 ? (
                        <div className="flex-1" />
                      ) : (
                        dayAssignments.map((a) => {
                          const overnight = isOvernight(a.startTime, a.endTime);
                          return (
                            <div
                              key={`${a.shiftId}-${a.userId}`}
                              className={`rounded-lg border-l-4 px-2 py-1.5 text-xs ${
                                overnight
                                  ? "border-indigo-500 bg-indigo-50/60 border border-indigo-100"
                                  : "border-[#1d5c8b] bg-[#ebf4fb]/80 border border-blue-100"
                              }`}
                            >
                              <p className={`font-semibold ${overnight ? "text-indigo-800" : "text-[#1d5c8b]"}`}>
                                {a.startTime} – {a.endTime}
                                {overnight && (
                                  <Moon className="w-2.5 h-2.5 inline ml-1 text-indigo-600" />
                                )}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5 text-slate-500">
                                {a.userRole === "doctor" ? (
                                  <Stethoscope className="w-2.5 h-2.5" />
                                ) : (
                                  <UserRoundPlus className="w-2.5 h-2.5" />
                                )}
                                <span>{a.userRole === "doctor" ? "רופא" : "אחות"}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Error / empty state */}
        {!loading && error ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {error}
          </div>
        ) : null}

        {!loading && schedule ? (
          <p className="text-xs text-slate-400 text-center">
            גרסה #{schedule.version.versionNumber} · {schedule.assignments.length} משמרות
          </p>
        ) : null}
      </div>
    </div>
  );
}
