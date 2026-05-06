import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, CalendarDays, FileUp, RefreshCcw, Users } from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner, LoadingState } from "../components/ui/LoadingIndicator";
import ResizableSplit from "../components/ui/ResizableSplit";
import { useStoredNumber } from "../hooks/useStoredNumber";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

export default function ShiftPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const navigate = useNavigate();

  type DeptStatus = {
    id: string;
    name: string;
    code: string;
    totalMembers: number;
    activeMembers: number;
    inactiveMembers: number;
    inactiveBreakdown?: Record<string, number>;

    requiredTotal?: number;
    requiredSenior?: number;
    requiredRegular?: number;
    requiredIntern?: number;

    metAssigned?: boolean;
    missingAssigned?: { total?: number; senior?: number; regular?: number; intern?: number };
    metActive?: boolean;
    missingActive?: { total?: number; senior?: number; regular?: number; intern?: number };
  };

  type MonthPlan = {
    department: { id: string; name: string; code: string };
    month: string; // YYYY-MM
    timezone?: string;
    days: Array<{
      date: string; // YYYY-MM-DD
      shifts?: Array<{
        id: string | number;
        label?: string;
        startTime?: string;
        endTime?: string;
        assignmentsCount?: number;
      }>;
    }>;
  };

  const [month, setMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const [deptStatuses, setDeptStatuses] = useState<DeptStatus[]>([]);
  const [loadingDeptStatuses, setLoadingDeptStatuses] = useState(true);
  const [deptStatusesError, setDeptStatusesError] = useState("");

  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [monthPlan, setMonthPlan] = useState<MonthPlan | null>(null);
  const [loadingMonthPlan, setLoadingMonthPlan] = useState(false);
  const [monthPlanError, setMonthPlanError] = useState("");
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelImportMessage, setExcelImportMessage] = useState("");

  const splitPct = useStoredNumber("planli:controlRoomSplitPct", 38, {
    min: 26,
    max: 55,
  });

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const getApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (!axios.isAxiosError(error)) return fallback;
    const data = error.response?.data;
    if (!data || typeof data !== "object") return fallback;
    if (!("error" in data)) return fallback;
    const record = data as Record<string, unknown>;
    return typeof record.error === "string" ? record.error : fallback;
  }, []);

  const monthLabel = useMemo(() => {
    const parsed = new Date(`${month}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return month;
    return new Intl.DateTimeFormat("he-IL", {
      year: "numeric",
      month: "long",
      timeZone: ISRAEL_TIMEZONE,
    }).format(parsed);
  }, [month]);

  const fetchDeptStatuses = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingDeptStatuses(true);
      setDeptStatusesError("");
      const res = await axios.get<{ departments: DeptStatus[] }>(
        `${API_BASE}/departments/status?month=${encodeURIComponent(month)}`,
        { headers: authHeaders },
      );
      const list = res.data.departments ?? [];
      setDeptStatuses(list);
      setSelectedDeptId((current) => {
        if (current && list.some((d) => d.id === current)) return current;
        return list[0]?.id ?? "";
      });
    } catch (e: unknown) {
      setDeptStatuses([]);
      setDeptStatusesError(getApiErrorMessage(e, "שגיאה בטעינת סטטוס מחלקות"));
      setSelectedDeptId("");
    } finally {
      setLoadingDeptStatuses(false);
    }
  }, [authHeaders, getApiErrorMessage, month, token]);

  const fetchMonthPlan = useCallback(
    async (departmentId: string) => {
      if (!token || !departmentId) return;
      try {
        setLoadingMonthPlan(true);
        setMonthPlanError("");
        const res = await axios.get<MonthPlan>(
          `${API_BASE}/departments/${encodeURIComponent(departmentId)}/month-plan?month=${encodeURIComponent(month)}`,
          { headers: authHeaders },
        );
        setMonthPlan(res.data);
      } catch (e: unknown) {
        setMonthPlan(null);
        setMonthPlanError(getApiErrorMessage(e, "שגיאה בטעינת תוכנית חודשית"));
      } finally {
        setLoadingMonthPlan(false);
      }
    },
    [authHeaders, getApiErrorMessage, month, token],
  );

  const handleExcelImport = useCallback(
    async (file: File) => {
      if (!token) return;
      try {
        setImportingExcel(true);
        setExcelImportMessage("");
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const workbookBase64 = dataUrl.split(",", 2)[1] ?? "";
        await axios.post(
          `${API_BASE}/imports/excel/month`,
          {
            workbook_base64: workbookBase64,
            month,
          },
          { headers: authHeaders },
        );
        setExcelImportMessage("האקסל יובא בהצלחה");
        await fetchDeptStatuses();
      } catch (e: unknown) {
        setExcelImportMessage(getApiErrorMessage(e, "שגיאה בייבוא האקסל"));
      } finally {
        setImportingExcel(false);
      }
    },
    [authHeaders, fetchDeptStatuses, getApiErrorMessage, month, token],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDeptStatuses();
  }, [fetchDeptStatuses]);

  useEffect(() => {
    if (!selectedDeptId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMonthPlan(null);
      setMonthPlanError("");
      return;
    }
    void fetchMonthPlan(selectedDeptId);
  }, [fetchMonthPlan, selectedDeptId]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-slate-900">חדר בקרה · משמרות</h1>
            <p className="text-slate-500 mt-1">מבט-על מחלקתי, סטטוס צוות, ותוכנית חודשית.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <CalendarDays className="w-4 h-4 text-[#1d5c8b]" />
              <span className="text-xs font-semibold text-slate-600">חודש</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                aria-label="בחר חודש"
              />
            </label>

            <button
              type="button"
              onClick={() => void fetchDeptStatuses()}
              disabled={loadingDeptStatuses}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            >
              {loadingDeptStatuses ? (
                <LoadingSpinner className="w-4 h-4 text-[#1d5c8b]" />
              ) : (
                <RefreshCcw className="w-4 h-4 text-slate-500" />
              )}
              רענן סטטוס
            </button>

            <label className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 inline-flex items-center gap-2 shadow-sm cursor-pointer">
              {importingExcel ? (
                <LoadingSpinner className="w-4 h-4 text-[#1d5c8b]" />
              ) : (
                <FileUp className="w-4 h-4 text-slate-500" />
              )}
              ייבוא אקסל
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={importingExcel}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleExcelImport(file);
                }}
              />
            </label>
          </div>
        </header>

        {excelImportMessage ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {excelImportMessage}
          </div>
        ) : null}

        <ResizableSplit
          direction="horizontal"
          initialPrimarySizePct={splitPct.value}
          minPrimarySizePct={26}
          maxPrimarySizePct={55}
          onPrimarySizePctChange={(next) => splitPct.set(next)}
          className="min-h-[72vh]"
          primary={
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-full flex flex-col">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">מחלקות</h2>
                    <p className="text-xs text-slate-500 mt-0.5">סטטוס לחודש {monthLabel}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Users className="w-3.5 h-3.5" />
                    {deptStatuses.length}
                  </span>
                </div>
              </div>

              {deptStatusesError ? (
                <div className="p-4 text-sm text-rose-700 bg-rose-50 border-b border-rose-200">
                  {deptStatusesError}
                </div>
              ) : null}

              <div className="p-3 sm:p-4 overflow-y-auto min-h-0">
                {loadingDeptStatuses ? (
                  <LoadingState label="טוען סטטוס מחלקות..." className="p-8" />
                ) : deptStatuses.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <Building2 className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">אין מחלקות להצגה</p>
                    <p className="mt-1 text-xs text-slate-500">
                      ודא שקיימות מחלקות פעילות ושיש נתונים לחודש זה.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {deptStatuses.map((d) => {
                      const isSelected = d.id === selectedDeptId;
                      const inactivePct =
                        d.totalMembers > 0
                          ? Math.round((d.inactiveMembers / d.totalMembers) * 100)
                          : 0;
                      const activePct =
                        d.totalMembers > 0
                          ? Math.round((d.activeMembers / d.totalMembers) * 100)
                          : 0;

                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setSelectedDeptId(d.id);
                            navigate(`/shifts/department/${encodeURIComponent(d.id)}/month?month=${encodeURIComponent(month)}`);
                          }}
                          className={`text-right rounded-2xl border p-3 transition-all focus:outline-none focus:ring-2 focus:ring-[#1d5c8b] ${
                            isSelected
                              ? "border-[#1d5c8b]/35 bg-[#ebf4fb]/35 shadow-sm"
                              : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{d.name}</p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                                {d.code}
                              </p>
                            </div>
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              {d.totalMembers}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                              <p className="text-[10px] text-slate-500 font-semibold">סה״כ</p>
                              <p className="text-lg font-extrabold text-slate-900 leading-none mt-1">
                                {d.totalMembers}
                              </p>
                            </div>
                            <div className="rounded-xl border border-teal-200/70 bg-teal-50/40 px-2.5 py-2">
                              <p className="text-[10px] text-teal-700 font-semibold">
                                פעילים · {activePct}%
                              </p>
                              <p className="text-lg font-extrabold text-teal-800 leading-none mt-1">
                                {d.activeMembers}
                              </p>
                            </div>
                            <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 px-2.5 py-2">
                              <p className="text-[10px] text-amber-800 font-semibold">
                                לא פעילים · {inactivePct}%
                              </p>
                              <p className="text-lg font-extrabold text-amber-900 leading-none mt-1">
                                {d.inactiveMembers}
                              </p>
                            </div>
                          </div>

                          {d.metAssigned === false ? (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold">חסר שיבוץ למחלקה</p>
                                <p className="text-amber-800/90 mt-0.5">
                                  סה״כ חסר: {d.missingAssigned?.total ?? "—"} · בכירים:{" "}
                                  {d.missingAssigned?.senior ?? "—"} · רגילים:{" "}
                                  {d.missingAssigned?.regular ?? "—"} · מתמחים:{" "}
                                  {d.missingAssigned?.intern ?? "—"}
                                </p>
                              </div>
                            </div>
                          ) : d.metActive === false ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold">חסר כוח אדם פעיל</p>
                                <p className="text-slate-600 mt-0.5">
                                  סה״כ חסר: {d.missingActive?.total ?? "—"} · בכירים:{" "}
                                  {d.missingActive?.senior ?? "—"} · רגילים:{" "}
                                  {d.missingActive?.regular ?? "—"} · מתמחים:{" "}
                                  {d.missingActive?.intern ?? "—"}
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          }
          secondary={
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-full flex flex-col">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">תוכנית חודשית</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedDeptId ? `מחלקה נבחרת · ${monthLabel}` : "בחר מחלקה כדי להציג תוכנית"}
                    </p>
                  </div>
                  {selectedDeptId ? (
                    <button
                      type="button"
                      onClick={() => void fetchMonthPlan(selectedDeptId)}
                      disabled={loadingMonthPlan}
                      className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {loadingMonthPlan ? (
                        <LoadingSpinner className="w-3.5 h-3.5 text-[#1d5c8b]" />
                      ) : (
                        <RefreshCcw className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      רענן
                    </button>
                  ) : null}
                </div>
              </div>

              {monthPlanError ? (
                <div className="p-4 text-sm text-rose-700 bg-rose-50 border-b border-rose-200">
                  {monthPlanError}
                </div>
              ) : null}

              <div className="p-3 sm:p-4 overflow-y-auto min-h-0">
                {!selectedDeptId ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <CalendarDays className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">בחר מחלקה משמאל</p>
                    <p className="mt-1 text-xs text-slate-500">
                      ואז תוכל לראות את התכנון החודשי למחלקה.
                    </p>
                  </div>
                ) : loadingMonthPlan ? (
                  <LoadingState label="טוען תוכנית חודשית..." className="p-10" />
                ) : monthPlan ? (
                  <div className="space-y-2">
                    {monthPlan.days?.length ? (
                      monthPlan.days.map((day) => {
                        const shiftCount = day.shifts?.length ?? 0;
                        return (
                          <div key={day.date} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900">{day.date}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {shiftCount ? `${shiftCount} משמרות` : "אין משמרות"}
                                </p>
                              </div>
                            </div>

                            {shiftCount ? (
                              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                                {day.shifts?.map((s) => (
                                  <div
                                    key={String(s.id)}
                                    className="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-bold text-slate-900 truncate">
                                        {s.label ?? "משמרת"}
                                      </p>
                                      {typeof s.assignmentsCount === "number" ? (
                                        <span className="text-[11px] font-semibold text-slate-500">
                                          שובצו: {s.assignmentsCount}
                                        </span>
                                      ) : null}
                                    </div>
                                    {(s.startTime || s.endTime) && (
                                      <p className="text-xs text-slate-600 mt-1" dir="ltr">
                                        {s.startTime ?? "--:--"} – {s.endTime ?? "--:--"}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                        <p className="text-sm font-semibold text-slate-700">אין ימים בתגובה</p>
                        <p className="mt-1 text-xs text-slate-500">ה-backend צריך להחזיר `days[]` לחודש.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <p className="text-sm font-semibold text-slate-700">אין תוכנית להצגה</p>
                    <p className="mt-1 text-xs text-slate-500">
                      נסה לרענן, או ודא שיש נתונים למחלקה ולחודש הנבחר.
                    </p>
                  </div>
                )}
              </div>
            </section>
          }
        />
      </div>
    </div>
  );
}
