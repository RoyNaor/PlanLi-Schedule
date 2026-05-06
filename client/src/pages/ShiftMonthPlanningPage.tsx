import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner, LoadingState } from "../components/ui/LoadingIndicator";
import ShiftFormModal from "../components/shifts/ShiftFormModal";
import CollectionDeadlineModal from "../components/shifts/CollectionDeadlineModal";
import type { Shift, WeekStatus, WeekSummary } from "../components/types";
import { staffingFields, type StaffingField } from "../utils/staffing";
import {
  addMonthsToIsoDate,
  firstOfMonthIso,
  getCalendarMonthMatrix,
  getJerusalemTodayIsoDate,
  getWeekStartsOverlappingRange,
  lastOfMonthIso,
  normalizeApiDateToIso,
  normalizeApiTimeToHourMinute,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const monthTitleFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const dayNumberFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const weekStatusLabel: Record<WeekStatus, string> = {
  DRAFT: "טיוטה",
  COLLECTING: "איסוף אילוצים",
  LOCKED: "נעול",
  SOLVED: "שובץ",
  PUBLISHED: "פורסם",
};

const weekStatusStyle: Record<WeekStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  COLLECTING: "bg-blue-100 text-blue-800",
  LOCKED: "bg-amber-100 text-amber-800",
  SOLVED: "bg-teal-100 text-teal-800",
  PUBLISHED: "bg-green-100 text-green-800",
};

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data;
  if (!data || typeof data !== "object") return fallback;
  if (!("error" in data)) return fallback;
  const record = data as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : fallback;
}

type MonthPlanResponse = {
  department: { id: string; name: string; code: string };
  month: string; // YYYY-MM
  days: Array<{
    date: string; // YYYY-MM-DD
    shifts: Shift[];
  }>;
};

type VersionSummary = {
  id: string;
  versionNumber: number;
  isPublished: boolean;
  createdAt: string;
  assignmentCount: number;
};

export default function ShiftMonthPlanningPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [monthPlan, setMonthPlan] = useState<MonthPlanResponse | null>(null);
  const [loadingMonthPlan, setLoadingMonthPlan] = useState(true);
  const [monthPlanError, setMonthPlanError] = useState("");

  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);

  const [versionsByWeek, setVersionsByWeek] = useState<Record<string, VersionSummary[]>>({});
  const [loadingVersionsWeekStart, setLoadingVersionsWeekStart] = useState<string>("");

  const [publishingVersionId, setPublishingVersionId] = useState<string>("");
  const [solvingWeekStart, setSolvingWeekStart] = useState<string>("");
  const [lockingWeekStart, setLockingWeekStart] = useState<string>("");

  const [showCollectionDeadlineModal, setShowCollectionDeadlineModal] = useState(false);
  const [collectionWeekStart, setCollectionWeekStart] = useState<string>("");

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalMode, setShiftModalMode] = useState<"create" | "edit">("create");
  const [draftShiftDate, setDraftShiftDate] = useState("");
  const [shiftToEdit, setShiftToEdit] = useState<Shift | null>(null);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const month = useMemo(() => {
    const q = searchParams.get("month");
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    const today = getJerusalemTodayIsoDate();
    return today.slice(0, 7);
  }, [searchParams]);

  const monthAnchorIso = useMemo(() => `${month}-01`, [month]);

  const monthTitle = useMemo(() => {
    const parsed = new Date(`${month}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return month;
    return monthTitleFormatter.format(parsed);
  }, [month]);

  const monthFirstIso = useMemo(() => firstOfMonthIso(monthAnchorIso), [monthAnchorIso]);
  const monthLastIso = useMemo(() => lastOfMonthIso(monthAnchorIso), [monthAnchorIso]);

  const monthCells = useMemo(() => getCalendarMonthMatrix(monthAnchorIso), [monthAnchorIso]);

  const weekStartsInMonth = useMemo(() => {
    if (!monthFirstIso || !monthLastIso) return [];
    return getWeekStartsOverlappingRange(monthFirstIso, monthLastIso);
  }, [monthFirstIso, monthLastIso]);

  const weeksByStart = useMemo(() => {
    return Object.fromEntries(weeks.map((w) => [w.weekStart, w])) as Record<string, WeekSummary>;
  }, [weeks]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const day of monthPlan?.days ?? []) {
      map.set(day.date, day.shifts ?? []);
    }
    return map;
  }, [monthPlan?.days]);

  const setMonthParam = (nextMonth: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("month", nextMonth);
    setSearchParams(params, { replace: true });
  };

  const fetchWeeks = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingWeeks(true);
      const res = await axios.get<{ weeks: WeekSummary[] }>(`${API_BASE}/weeks`, {
        headers: authHeaders,
      });
      setWeeks(
        (res.data.weeks ?? []).map((w) => ({
          ...w,
          weekStart: normalizeApiDateToIso(w.weekStart),
        })),
      );
    } catch {
      setWeeks([]);
    } finally {
      setLoadingWeeks(false);
    }
  }, [authHeaders, token]);

  const fetchMonthPlan = useCallback(async () => {
    if (!token || !departmentId) return;
    try {
      setLoadingMonthPlan(true);
      setMonthPlanError("");
      const res = await axios.get<MonthPlanResponse>(
        `${API_BASE}/departments/${encodeURIComponent(departmentId)}/month-plan?month=${encodeURIComponent(month)}`,
        { headers: authHeaders },
      );

      const normalized: MonthPlanResponse = {
        ...res.data,
        days: (res.data.days ?? []).map((d) => ({
          ...d,
          date: normalizeApiDateToIso(d.date),
          shifts: (d.shifts ?? []).map((s) => ({
            ...s,
            weekStart: normalizeApiDateToIso(s.weekStart),
            shiftDate: normalizeApiDateToIso(s.shiftDate),
            startTime: normalizeApiTimeToHourMinute(s.startTime) || s.startTime,
            endTime: normalizeApiTimeToHourMinute(s.endTime) || s.endTime,
          })),
        })),
      };
      setMonthPlan(normalized);
    } catch (e: unknown) {
      setMonthPlan(null);
      setMonthPlanError(getApiErrorMessage(e, "שגיאה בטעינת תוכנית חודשית"));
    } finally {
      setLoadingMonthPlan(false);
    }
  }, [authHeaders, departmentId, month, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchWeeks();
  }, [fetchWeeks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMonthPlan();
  }, [fetchMonthPlan]);

  const handleAddShift = (isoDate: string) => {
    setShiftModalMode("create");
    setDraftShiftDate(isoDate);
    setShiftToEdit(null);
    setIsShiftModalOpen(true);
  };

  const handleEditShift = (shift: Shift) => {
    setShiftModalMode("edit");
    setDraftShiftDate(shift.shiftDate);
    setShiftToEdit(shift);
    setIsShiftModalOpen(true);
  };

  const handleSubmitShift = useCallback(
    async (
      values: {
        shiftDate: string;
        startTime: string;
        endTime: string;
      } & Record<StaffingField, number>,
    ) => {
      if (!token) return;

      const weekStart = startOfWeekSundayIso(values.shiftDate);
      if (!weekStart) {
        alert("תאריך משמרת לא תקין.");
        return;
      }

      const normalizedStartTime = normalizeApiTimeToHourMinute(values.startTime);
      const normalizedEndTime = normalizeApiTimeToHourMinute(values.endTime);
      if (!normalizedStartTime || !normalizedEndTime) {
        alert("שעת התחלה ושעת סיום חייבות להיות בפורמט HH:mm.");
        return;
      }

      const payload = {
        week_start: weekStart,
        shift_date: values.shiftDate,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime,
        ...Object.fromEntries(
          staffingFields.map((field) => [field.apiField, values[field.field]]),
        ),
      };

      try {
        if (shiftModalMode === "create") {
          await axios.post(`${API_BASE}/shifts`, payload, { headers: authHeaders });
        } else if (shiftToEdit) {
          await axios.put(
            `${API_BASE}/shifts/${shiftToEdit.id}`,
            {
              shift_date: payload.shift_date,
              start_time: payload.start_time,
              end_time: payload.end_time,
              ...Object.fromEntries(
                staffingFields.map((field) => [field.apiField, values[field.field]]),
              ),
            },
            { headers: authHeaders },
          );
        }
      } catch (e: unknown) {
        alert(`שגיאה בשמירת משמרת: ${getApiErrorMessage(e, "שגיאה לא ידועה")}`);
        throw e;
      }

      await fetchMonthPlan();
      await fetchWeeks();
    },
    [authHeaders, fetchMonthPlan, fetchWeeks, shiftModalMode, shiftToEdit, token],
  );

  const handleDeleteShift = useCallback(
    async (shift: Shift) => {
      const ok = window.confirm("למחוק את המשמרת הזו?");
      if (!ok) return;
      try {
        await axios.delete(`${API_BASE}/shifts/${shift.id}`, { headers: authHeaders });
      } catch (e: unknown) {
        alert(`שגיאה במחיקת משמרת: ${getApiErrorMessage(e, "שגיאה לא ידועה")}`);
        return;
      }
      await fetchMonthPlan();
      await fetchWeeks();
    },
    [authHeaders, fetchMonthPlan, fetchWeeks],
  );

  const ensureWeekExists = useCallback(
    async (weekStart: string) => {
      if (!token) return;
      try {
        await axios.post(
          `${API_BASE}/weeks`,
          { week_start: weekStart },
          { headers: authHeaders },
        );
      } catch {
        // ignore
      }
    },
    [authHeaders, token],
  );

  const openCollectionDeadline = (weekStart: string) => {
    setCollectionWeekStart(weekStart);
    setShowCollectionDeadlineModal(true);
  };

  const handleSolveWeek = useCallback(
    async (weekStart: string) => {
      if (!token) return;
      try {
        setSolvingWeekStart(weekStart);
        await ensureWeekExists(weekStart);
        await axios.post(`${API_BASE}/weeks/${weekStart}/solve`, {}, { headers: authHeaders });
        await fetchWeeks();
      } catch (e: unknown) {
        alert(`שגיאה בהפעלת השיבוץ: ${getApiErrorMessage(e, "שגיאה לא ידועה")}`);
      } finally {
        setSolvingWeekStart("");
      }
    },
    [authHeaders, ensureWeekExists, fetchWeeks, token],
  );

  const handleLockWeek = useCallback(
    async (weekStart: string) => {
      if (!token) return;
      try {
        setLockingWeekStart(weekStart);
        await ensureWeekExists(weekStart);
        await axios.post(`${API_BASE}/weeks/${weekStart}/lock`, {}, { headers: authHeaders });
        await fetchWeeks();
      } catch (e: unknown) {
        alert(`שגיאה בנעילת השבוע: ${getApiErrorMessage(e, "שגיאה לא ידועה")}`);
      } finally {
        setLockingWeekStart("");
      }
    },
    [authHeaders, ensureWeekExists, fetchWeeks, token],
  );

  const fetchVersionsForWeek = useCallback(
    async (weekStart: string) => {
      if (!token) return;
      try {
        setLoadingVersionsWeekStart(weekStart);
        const res = await axios.get<{ versions: VersionSummary[] }>(
          `${API_BASE}/weeks/${weekStart}/schedule-versions`,
          { headers: authHeaders },
        );
        setVersionsByWeek((prev) => ({ ...prev, [weekStart]: res.data.versions ?? [] }));
      } catch {
        setVersionsByWeek((prev) => ({ ...prev, [weekStart]: [] }));
      } finally {
        setLoadingVersionsWeekStart("");
      }
    },
    [authHeaders, token],
  );

  const handlePublishLatest = useCallback(
    async (weekStart: string) => {
      const versions = versionsByWeek[weekStart] ?? [];
      const latest = versions[0];
      if (!latest) return;
      if (latest.isPublished) return;
      try {
        setPublishingVersionId(latest.id);
        await axios.post(`${API_BASE}/schedule-versions/${latest.id}/publish`, {}, { headers: authHeaders });
        await fetchWeeks();
        await fetchVersionsForWeek(weekStart);
      } catch (e: unknown) {
        alert(`שגיאה בפרסום: ${getApiErrorMessage(e, "שגיאה לא ידועה")}`);
      } finally {
        setPublishingVersionId("");
      }
    },
    [authHeaders, fetchVersionsForWeek, fetchWeeks, versionsByWeek],
  );

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;
  if (!departmentId) return <Navigate to="/shifts" replace />;

  const canGoPrevMonth = Boolean(monthFirstIso);
  const canGoNextMonth = Boolean(monthFirstIso);

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate("/shifts")}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              <ArrowRight className="w-4 h-4" />
              חזרה לחדר בקרה
            </button>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
              תכנון חודשי · {monthTitle}
            </h1>
            <p className="text-slate-500 mt-1">
              מחלקה:{" "}
              <span className="font-semibold text-slate-800">
                {monthPlan?.department?.name ?? departmentId}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => canGoPrevMonth && setMonthParam(addMonthsToIsoDate(monthAnchorIso, -1).slice(0, 7))}
                className="w-10 h-10 inline-flex items-center justify-center hover:bg-slate-50"
                aria-label="חודש קודם"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
              <div className="px-3 py-2 text-sm font-bold text-slate-800 inline-flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#1d5c8b]" />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonthParam(e.target.value)}
                  className="bg-transparent outline-none font-bold text-slate-800"
                  aria-label="בחר חודש"
                />
              </div>
              <button
                type="button"
                onClick={() => canGoNextMonth && setMonthParam(addMonthsToIsoDate(monthAnchorIso, 1).slice(0, 7))}
                className="w-10 h-10 inline-flex items-center justify-center hover:bg-slate-50"
                aria-label="חודש הבא"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => void fetchMonthPlan()}
              disabled={loadingMonthPlan}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            >
              {loadingMonthPlan ? (
                <LoadingSpinner className="w-4 h-4 text-[#1d5c8b]" />
              ) : (
                <RefreshCcw className="w-4 h-4 text-slate-500" />
              )}
              רענן חודש
            </button>
          </div>
        </header>

        {monthPlanError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {monthPlanError}
          </div>
        ) : null}

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-extrabold text-slate-900">לוח חודש</h2>
                <p className="text-xs text-slate-500 mt-0.5">הוספה/עריכה מהירה של משמרות לפי ימים.</p>
              </div>
              <span className="text-xs text-slate-500 font-semibold">
                גרירה לא נדרשת · קליק ליום
              </span>
            </div>

            {loadingMonthPlan ? (
              <LoadingState label="טוען לוח חודש..." className="p-10" />
            ) : (
              <div className="p-3 sm:p-4">
                <div className="grid grid-cols-7 gap-2">
                  {["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"].map((label) => (
                    <div key={label} className="text-center text-[11px] font-bold text-slate-500">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2 mt-2">
                  {monthCells.map((cell) => {
                    const dayShifts = shiftsByDate.get(cell.iso) ?? [];
                    const isToday = cell.iso === getJerusalemTodayIsoDate();
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        onClick={() => handleAddShift(cell.iso)}
                        className={`rounded-2xl border p-2 text-right transition-colors min-h-[88px] focus:outline-none focus:ring-2 focus:ring-[#1d5c8b] ${
                          cell.inMonth ? "bg-white border-slate-200 hover:bg-slate-50" : "bg-slate-50 border-slate-100 opacity-70"
                        } ${isToday ? "ring-1 ring-[#1d5c8b]/20" : ""}`}
                        aria-label={`הוסף משמרת ל-${cell.iso}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-extrabold ${cell.inMonth ? "text-slate-900" : "text-slate-500"}`}>
                            {dayNumberFormatter.format(parseIsoDateToUtc(cell.iso))}
                          </span>
                          {dayShifts.length ? (
                            <span className="text-[11px] font-bold text-slate-600">
                              {dayShifts.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-1">
                          {dayShifts.slice(0, 2).map((s) => (
                            <div
                              key={String(s.id)}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-[11px] text-slate-700"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleEditShift(s);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="flex items-center justify-between gap-2" dir="ltr">
                                <span className="font-semibold">{s.startTime}–{s.endTime}</span>
                                <span className="text-slate-400">#{s.id}</span>
                              </div>
                            </div>
                          ))}
                          {dayShifts.length > 2 ? (
                            <div className="text-[11px] text-slate-500 font-semibold">
                              +{dayShifts.length - 2} נוספים
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b border-slate-200 bg-slate-50/70">
              <h2 className="font-extrabold text-slate-900">כלי שבוע</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                פעולות איסוף/נעילה/שיבוץ/פרסום לפי שבוע בתוך החודש.
              </p>
            </div>

            <div className="p-3 space-y-2">
              {loadingWeeks ? (
                <LoadingState label="טוען שבועות..." className="p-6" />
              ) : weekStartsInMonth.length === 0 ? (
                <p className="text-sm text-slate-500 p-3">אין שבועות לחודש זה.</p>
              ) : (
                weekStartsInMonth.map((weekStart) => {
                  const summary = weeksByStart[weekStart] ?? null;
                  const status = summary?.status ?? "DRAFT";
                  const deadline = summary?.collectionDeadline ?? null;
                  const versions = versionsByWeek[weekStart] ?? null;
                  const latest = versions?.[0] ?? null;
                  const canPublish = Boolean(latest && !latest.isPublished);
                  return (
                    <div key={weekStart} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-slate-900" dir="ltr">
                            {weekStart}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            דדליין:{" "}
                            <span className="font-semibold text-slate-700">
                              {deadline ? normalizeApiDateToIso(deadline) : "לא נקבע"}
                            </span>
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${
                            weekStatusStyle[status]
                          }`}
                        >
                          {weekStatusLabel[status]}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openCollectionDeadline(weekStart)}
                          className="h-9 rounded-xl bg-[#1d5c8b] text-white text-xs font-bold hover:bg-[#164e78] inline-flex items-center justify-center gap-2"
                        >
                          <CalendarDays className="w-3.5 h-3.5" />
                          דדליין איסוף
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleLockWeek(weekStart)}
                          disabled={lockingWeekStart === weekStart}
                          className="h-9 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                          {lockingWeekStart === weekStart ? (
                            <LoadingSpinner className="w-3.5 h-3.5 text-[#1d5c8b]" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          נעל
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleSolveWeek(weekStart)}
                          disabled={solvingWeekStart === weekStart}
                          className="h-9 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2 col-span-2"
                        >
                          {solvingWeekStart === weekStart ? (
                            <LoadingSpinner className="w-3.5 h-3.5 text-teal-700" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                          )}
                          שיבוץ חכם
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void fetchVersionsForWeek(weekStart)}
                          disabled={loadingVersionsWeekStart === weekStart}
                          className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                          {loadingVersionsWeekStart === weekStart ? (
                            <LoadingSpinner className="w-3.5 h-3.5 text-[#1d5c8b]" />
                          ) : (
                            <RefreshCcw className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          גרסאות
                        </button>

                        <button
                          type="button"
                          onClick={() => void handlePublishLatest(weekStart)}
                          disabled={!canPublish || publishingVersionId === latest?.id}
                          className="h-9 px-3 rounded-xl bg-[#1d5c8b] text-white text-xs font-bold hover:bg-[#164e78] disabled:opacity-40 inline-flex items-center gap-2"
                        >
                          {publishingVersionId === latest?.id ? (
                            <LoadingSpinner className="w-3.5 h-3.5" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          פרסם אחרונה
                        </button>
                      </div>

                      {latest ? (
                        <div className="mt-2 text-[11px] text-slate-500">
                          גרסה אחרונה:{" "}
                          <span className="font-semibold text-slate-700">#{latest.versionNumber}</span>{" "}
                          · שיבוצים: {latest.assignmentCount}{" "}
                          {latest.isPublished ? (
                            <span className="inline-flex items-center gap-1 text-teal-700 font-bold mr-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> פורסם
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </section>

        <ShiftFormModal
          isOpen={isShiftModalOpen}
          mode={shiftModalMode}
          weekStart={startOfWeekSundayIso(draftShiftDate)}
          initialShiftDate={draftShiftDate}
          shiftToEdit={shiftToEdit}
          onClose={() => setIsShiftModalOpen(false)}
          onSubmit={handleSubmitShift}
        />

        <CollectionDeadlineModal
          isOpen={showCollectionDeadlineModal}
          weekStart={collectionWeekStart}
          currentDeadline={weeksByStart[collectionWeekStart]?.collectionDeadline ?? null}
          onClose={() => {
            setShowCollectionDeadlineModal(false);
            setCollectionWeekStart("");
          }}
          onSubmit={async (deadlineIso) => {
            if (!collectionWeekStart) return;
            await axios.post(
              `${API_BASE}/weeks/${collectionWeekStart}/open-collection`,
              { collection_deadline: deadlineIso },
              { headers: authHeaders },
            );
            await fetchWeeks();
          }}
        />

        {/* Shift quick list (editable) */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70">
            <h2 className="font-extrabold text-slate-900">רשימת משמרות לחודש</h2>
            <p className="text-xs text-slate-500 mt-0.5">עריכה/מחיקה מהירה לפי ימים.</p>
          </div>
          {loadingMonthPlan ? (
            <LoadingState label="טוען משמרות..." className="p-8" />
          ) : (
            <div className="divide-y divide-slate-100">
              {(monthPlan?.days ?? []).map((day) => (
                <div key={day.date} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-900">{day.date}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{day.shifts.length} משמרות</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddShift(day.date)}
                      className="h-9 px-3 rounded-xl bg-[#1d5c8b] text-white text-xs font-bold hover:bg-[#164e78]"
                    >
                      הוסף
                    </button>
                  </div>

                  {day.shifts.length ? (
                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {day.shifts.map((s) => (
                        <div key={String(s.id)} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900" dir="ltr">
                                {s.startTime} – {s.endTime}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5" dir="ltr">
                                weekStart: {s.weekStart}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditShift(s)}
                                className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50"
                                aria-label="ערוך משמרת"
                              >
                                <Sparkles className="w-4 h-4 text-slate-500 mx-auto" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteShift(s)}
                                className="h-9 w-9 rounded-xl border border-rose-200 hover:bg-rose-50"
                                aria-label="מחק משמרת"
                              >
                                <Trash2 className="w-4 h-4 text-rose-600 mx-auto" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">אין משמרות ליום זה.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

