import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner, LoadingState } from "../components/ui/LoadingIndicator";
import MonthlyShiftFormModal, {
  type MonthlyShiftFormValues,
} from "../components/shifts/MonthlyShiftFormModal";
import type { Shift, WorkerType } from "../components/types";
import {
  addMonthsToIsoDate,
  firstOfMonthIso,
  getCalendarMonthMatrix,
  getJerusalemTodayIsoDate,
  normalizeApiDateToIso,
  normalizeApiTimeToHourMinute,
  parseIsoDateToUtc,
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

type MonthPlanResponse = {
  department: { id: string; name: string; code: string };
  month: string;
  timezone?: string;
  days: Array<{
    date: string;
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

type RunSummary = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  createdAt: string;
  errorMessage: string | null;
};

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data;
  if (!data || typeof data !== "object" || !("error" in data)) return fallback;
  const record = data as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : fallback;
}

function monthStartFromMonth(month: string) {
  return `${month}-01`;
}

function withLegacyStaffingDefaults(shift: Shift): Shift {
  return {
    ...shift,
    shiftDate: normalizeApiDateToIso(shift.shiftDate),
    startTime: normalizeApiTimeToHourMinute(shift.startTime) || shift.startTime,
    endTime: normalizeApiTimeToHourMinute(shift.endTime) || shift.endTime,
    minDoctors: shift.minDoctors ?? 0,
    minNurses: shift.minNurses ?? 0,
    minMidwives: shift.minMidwives ?? 0,
    minObgyns: shift.minObgyns ?? 0,
    minAnesthesiologists: shift.minAnesthesiologists ?? 0,
    minOrderlies: shift.minOrderlies ?? 0,
    minPediatricians: shift.minPediatricians ?? 0,
    minShabbatScribes: shift.minShabbatScribes ?? 0,
    minSecretaries: shift.minSecretaries ?? 0,
  };
}

export default function ShiftMonthPlanningPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [monthPlan, setMonthPlan] = useState<MonthPlanResponse | null>(null);
  const [loadingMonthPlan, setLoadingMonthPlan] = useState(true);
  const [monthPlanError, setMonthPlanError] = useState("");
  const [workerTypes, setWorkerTypes] = useState<WorkerType[]>([]);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [openingCollection, setOpeningCollection] = useState(false);
  const [lockingMonth, setLockingMonth] = useState(false);
  const [solvingMonth, setSolvingMonth] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState("");
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
    return getJerusalemTodayIsoDate().slice(0, 7);
  }, [searchParams]);

  const monthStart = useMemo(() => monthStartFromMonth(month), [month]);
  const monthCells = useMemo(() => getCalendarMonthMatrix(monthStart), [monthStart]);
  const monthTitle = useMemo(() => {
    const parsed = new Date(`${monthStart}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? month : monthTitleFormatter.format(parsed);
  }, [month, monthStart]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const day of monthPlan?.days ?? []) {
      map.set(day.date, day.shifts ?? []);
    }
    return map;
  }, [monthPlan]);

  const latestVersion = versions[0] ?? null;

  const setMonthParam = (nextMonth: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("month", nextMonth);
    setSearchParams(params, { replace: true });
  };

  const fetchWorkerTypes = useCallback(async () => {
    if (!token) return;
    const res = await axios.get<{ worker_types: WorkerType[] }>(`${API_BASE}/worker-types`, {
      headers: authHeaders,
    });
    setWorkerTypes(res.data.worker_types ?? []);
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

      setMonthPlan({
        ...res.data,
        days: (res.data.days ?? []).map((day) => ({
          ...day,
          date: normalizeApiDateToIso(day.date),
          shifts: (day.shifts ?? []).map(withLegacyStaffingDefaults),
        })),
      });
    } catch (error: unknown) {
      setMonthPlan(null);
      setMonthPlanError(getApiErrorMessage(error, "שגיאה בטעינת התוכנית החודשית"));
    } finally {
      setLoadingMonthPlan(false);
    }
  }, [authHeaders, departmentId, month, token]);

  const fetchMonthMeta = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingMeta(true);
      const [versionsRes, runsRes] = await Promise.all([
        axios.get<{ versions: VersionSummary[] }>(
          `${API_BASE}/months/${monthStart}/schedule-versions`,
          { headers: authHeaders },
        ),
        axios.get<{ runs: RunSummary[] }>(
          `${API_BASE}/months/${monthStart}/solve-runs`,
          { headers: authHeaders },
        ),
      ]);
      setVersions(versionsRes.data.versions ?? []);
      setRuns(runsRes.data.runs ?? []);
    } catch {
      setVersions([]);
      setRuns([]);
    } finally {
      setLoadingMeta(false);
    }
  }, [authHeaders, monthStart, token]);

  useEffect(() => {
    void fetchWorkerTypes();
  }, [fetchWorkerTypes]);

  useEffect(() => {
    void fetchMonthPlan();
    void fetchMonthMeta();
  }, [fetchMonthMeta, fetchMonthPlan]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchMonthPlan(), fetchMonthMeta(), fetchWorkerTypes()]);
  }, [fetchMonthMeta, fetchMonthPlan, fetchWorkerTypes]);

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
    async (values: MonthlyShiftFormValues) => {
      if (!token || !departmentId) return;

      const payload = {
        month_start: monthStart,
        department_id: departmentId,
        arrangement_id: shiftModalMode === "edit" ? shiftToEdit?.arrangementId ?? null : null,
        shift_date: values.shiftDate,
        start_time: values.startTime,
        end_time: values.endTime,
        label: values.label || null,
        requirements: values.requirements.map((requirement) => ({
          worker_type_id: requirement.workerTypeId,
          count: requirement.count,
        })),
      };

      if (shiftModalMode === "create") {
        await axios.post(`${API_BASE}/monthly-shifts`, payload, { headers: authHeaders });
      } else if (shiftToEdit) {
        await axios.put(`${API_BASE}/monthly-shifts/${shiftToEdit.id}`, {
          arrangement_id: payload.arrangement_id,
          shift_date: payload.shift_date,
          start_time: payload.start_time,
          end_time: payload.end_time,
          label: payload.label,
          requirements: payload.requirements,
        }, { headers: authHeaders });
      }

      await refreshAll();
    },
    [authHeaders, departmentId, monthStart, refreshAll, shiftModalMode, shiftToEdit, token],
  );

  const handleDeleteShift = useCallback(
    async (shift: Shift) => {
      if (!window.confirm("למחוק את המשמרת הזו?")) return;
      await axios.delete(`${API_BASE}/monthly-shifts/${shift.id}`, { headers: authHeaders });
      await refreshAll();
    },
    [authHeaders, refreshAll],
  );

  const handleOpenCollection = useCallback(async () => {
    const defaultDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const deadline = window.prompt("הכנס דדליין ISO לאיסוף אילוצים", defaultDeadline);
    if (!deadline) return;

    try {
      setOpeningCollection(true);
      await axios.post(
        `${API_BASE}/months/${monthStart}/open-collection`,
        { collection_deadline: deadline },
        { headers: authHeaders },
      );
      await refreshAll();
    } catch (error: unknown) {
      alert(getApiErrorMessage(error, "שגיאה בפתיחת איסוף"));
    } finally {
      setOpeningCollection(false);
    }
  }, [authHeaders, monthStart, refreshAll]);

  const handleLockMonth = useCallback(async () => {
    try {
      setLockingMonth(true);
      await axios.post(`${API_BASE}/months/${monthStart}/lock`, {}, { headers: authHeaders });
      await refreshAll();
    } catch (error: unknown) {
      alert(getApiErrorMessage(error, "שגיאה בנעילת החודש"));
    } finally {
      setLockingMonth(false);
    }
  }, [authHeaders, monthStart, refreshAll]);

  const handleSolveMonth = useCallback(async () => {
    try {
      setSolvingMonth(true);
      await axios.post(`${API_BASE}/months/${monthStart}/solve`, {}, { headers: authHeaders });
      await refreshAll();
    } catch (error: unknown) {
      alert(getApiErrorMessage(error, "שגיאה בהרצת השיבוץ"));
    } finally {
      setSolvingMonth(false);
    }
  }, [authHeaders, monthStart, refreshAll]);

  const handlePublishLatest = useCallback(async () => {
    if (!latestVersion || latestVersion.isPublished) return;
    try {
      setPublishingVersionId(latestVersion.id);
      await axios.post(
        `${API_BASE}/monthly-schedule-versions/${latestVersion.id}/publish`,
        {},
        { headers: authHeaders },
      );
      await refreshAll();
    } catch (error: unknown) {
      alert(getApiErrorMessage(error, "שגיאה בפרסום השיבוץ"));
    } finally {
      setPublishingVersionId("");
    }
  }, [authHeaders, latestVersion, refreshAll]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;
  if (!departmentId) return <Navigate to="/shifts" replace />;

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
              חזרה לחדר הבקרה
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
                onClick={() => setMonthParam(addMonthsToIsoDate(monthStart, -1).slice(0, 7))}
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
                  onChange={(event) => setMonthParam(event.target.value)}
                  className="bg-transparent outline-none font-bold text-slate-800"
                  aria-label="בחר חודש"
                />
              </div>
              <button
                type="button"
                onClick={() => setMonthParam(addMonthsToIsoDate(monthStart, 1).slice(0, 7))}
                className="w-10 h-10 inline-flex items-center justify-center hover:bg-slate-50"
                aria-label="חודש הבא"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={loadingMonthPlan || loadingMeta}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            >
              {loadingMonthPlan || loadingMeta ? (
                <LoadingSpinner className="w-4 h-4 text-[#1d5c8b]" />
              ) : (
                <RefreshCcw className="w-4 h-4 text-slate-500" />
              )}
              רענן
            </button>
          </div>
        </header>

        {monthPlanError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {monthPlanError}
          </div>
        ) : null}

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-extrabold text-slate-900">לוח חודש</h2>
                <p className="text-xs text-slate-500 mt-0.5">קליק על יום מוסיף משמרת למחלקה הנבחרת.</p>
              </div>
              <span className="text-xs text-slate-500 font-semibold">
                {workerTypes.length} סוגי עובדים
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
                        className={`rounded-2xl border p-2 text-right transition-colors min-h-[104px] focus:outline-none focus:ring-2 focus:ring-[#1d5c8b] ${
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
                          {dayShifts.slice(0, 2).map((shift) => (
                            <div
                              key={String(shift.id)}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-[11px] text-slate-700"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleEditShift(shift);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="flex items-center justify-between gap-2" dir="ltr">
                                <span className="font-semibold">{shift.startTime}–{shift.endTime}</span>
                                <span className="text-slate-400">#{shift.id}</span>
                              </div>
                              <div className="truncate text-right mt-0.5">
                                {shift.label ?? shift.arrangementName ?? "משמרת"}
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
              <h2 className="font-extrabold text-slate-900">פעולות חודשיות</h2>
              <p className="text-xs text-slate-500 mt-0.5">איסוף אילוצים, נעילה, פתרון ופרסום לכל החודש.</p>
            </div>

            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpenCollection()}
                  disabled={openingCollection}
                  className="h-10 rounded-xl bg-[#1d5c8b] text-white text-xs font-bold hover:bg-[#164e78] disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {openingCollection ? <LoadingSpinner className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
                  פתח איסוף
                </button>
                <button
                  type="button"
                  onClick={() => void handleLockMonth()}
                  disabled={lockingMonth}
                  className="h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {lockingMonth ? <LoadingSpinner className="w-3.5 h-3.5 text-[#1d5c8b]" /> : <Lock className="w-3.5 h-3.5 text-slate-500" />}
                  נעל חודש
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleSolveMonth()}
                disabled={solvingMonth}
                className="w-full h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {solvingMonth ? <LoadingSpinner className="w-3.5 h-3.5 text-teal-700" /> : <Sparkles className="w-3.5 h-3.5 text-teal-700" />}
                שיבוץ חכם לחודש
              </button>

              <button
                type="button"
                onClick={() => void handlePublishLatest()}
                disabled={!latestVersion || latestVersion.isPublished || publishingVersionId === latestVersion.id}
                className="w-full h-10 rounded-xl bg-[#1d5c8b] text-white text-xs font-bold hover:bg-[#164e78] disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                {publishingVersionId === latestVersion?.id ? <LoadingSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                פרסם גרסה אחרונה
              </button>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-slate-900">גרסאות</p>
                  <button
                    type="button"
                    onClick={() => void fetchMonthMeta()}
                    disabled={loadingMeta}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600"
                  >
                    רענן
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-xs text-slate-500">אין גרסאות שיבוץ עדיין.</p>
                  ) : (
                    versions.slice(0, 4).map((version) => (
                      <div key={version.id} className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">#{version.versionNumber}</span>
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Users className="w-3.5 h-3.5" />
                            {version.assignmentCount}
                          </span>
                        </div>
                        {version.isPublished ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-teal-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            פורסם
                          </span>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
                <p className="text-sm font-extrabold text-slate-900">הרצות אחרונות</p>
                <div className="mt-2 space-y-2">
                  {runs.length === 0 ? (
                    <p className="text-xs text-slate-500">אין הרצות solver לחודש זה.</p>
                  ) : (
                    runs.slice(0, 4).map((run) => (
                      <div key={run.id} className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">{run.status}</span>
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        {run.errorMessage ? (
                          <p className="mt-1 text-rose-700">{run.errorMessage}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70">
            <h2 className="font-extrabold text-slate-900">רשימת משמרות לחודש</h2>
            <p className="text-xs text-slate-500 mt-0.5">עריכה ומחיקה מהירה לפי ימים.</p>
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
                      {day.shifts.map((shift) => (
                        <div key={String(shift.id)} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900">
                                {shift.label ?? shift.arrangementName ?? "משמרת"}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5" dir="ltr">
                                {shift.startTime} – {shift.endTime}
                              </p>
                              {shift.requirements?.length ? (
                                <p className="text-[11px] text-slate-500 mt-1">
                                  {shift.requirements.map((requirement) => `${requirement.workerTypeName}: ${requirement.count}`).join(" · ")}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditShift(shift)}
                                className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50"
                                aria-label="ערוך משמרת"
                              >
                                <Sparkles className="w-4 h-4 text-slate-500 mx-auto" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteShift(shift)}
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

      <MonthlyShiftFormModal
        isOpen={isShiftModalOpen}
        mode={shiftModalMode}
        initialShiftDate={draftShiftDate || firstOfMonthIso(monthStart)}
        shiftToEdit={shiftToEdit}
        workerTypes={workerTypes}
        onClose={() => setIsShiftModalOpen(false)}
        onSubmit={handleSubmitShift}
      />
    </div>
  );
}
