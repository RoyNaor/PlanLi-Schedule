import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Shield,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingState } from "../components/ui/LoadingIndicator";
import { getRoleIcon, getRoleLabel } from "../utils/staffing";
import {
  addDaysToIsoDate,
  getJerusalemTodayIsoDate,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

interface ConstraintEntry {
  id: string;
  startTime: string;
  endTime: string;
  priority: "HARD" | "SOFT";
  reason: string | null;
  isFullDay: boolean;
}

interface StaffConstraintSummary {
  userId: string;
  fullName: string;
  role: string;
  email: string;
  constraints: ConstraintEntry[];
}

interface ConstraintsSummaryResponse {
  week_start: string;
  summary: StaffConstraintSummary[];
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const constraintDateFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: ISRAEL_TIMEZONE,
});

const constraintTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ISRAEL_TIMEZONE,
});

export default function ScheduleReviewPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekSundayIso(getJerusalemTodayIsoDate()),
  );
  const [summary, setSummary] = useState<StaffConstraintSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const weekLabel = useMemo(() => {
    const end = addDaysToIsoDate(weekStart, 6);
    const startDate = parseIsoDateToUtc(weekStart);
    const endDate = parseIsoDateToUtc(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return weekStart;
    return `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`;
  }, [weekStart]);

  const navigateWeek = useCallback((offset: number) => {
    setWeekStart((prev) => addDaysToIsoDate(prev, offset));
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!token || !weekStart) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.get<ConstraintsSummaryResponse>(
        `${API_BASE}/weeks/${weekStart}/constraints-summary`,
        { headers: authHeaders },
      );
      setSummary(response.data.summary);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "שגיאה בטעינת מגבלות");
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token, weekStart]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/schedule" replace />;

  const totalWithConstraints = summary.filter((s) => s.constraints.length > 0).length;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מגבלות עובדים</h1>
          <p className="text-sm text-slate-500 mt-0.5">סקירת מגבלות הצוות לשבוע נבחר.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigateWeek(7)}
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>

          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-[#1d5c8b]" />
            <span className="font-semibold text-slate-900">{weekLabel}</span>
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeekSundayIso(getJerusalemTodayIsoDate()))}
              className="text-xs text-[#1d5c8b] font-medium hover:underline"
            >
              היום
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigateWeek(-7)}
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">מגבלות עובדים לשבוע זה</h2>
          <span className="text-xs text-slate-400">
            {totalWithConstraints} עובדים עם מגבלות
          </span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <LoadingState label="טוען מגבלות..." className="p-6" />
          </div>
        ) : summary.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-500">אין עובדים במערכת.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {summary.map((staff) => {
              const Icon = getRoleIcon(staff.role);
              return (
                <div
                  key={staff.userId}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#ebf4fb] flex items-center justify-center">
                        <Icon className="w-4 h-4 text-[#1d5c8b]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{staff.fullName}</p>
                        <p className="text-[11px] text-slate-400">{staff.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#ebf4fb] text-[#1d5c8b]">
                        {getRoleLabel(staff.role)}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          staff.constraints.length === 0
                            ? "bg-[#ebf4fb] text-[#1d5c8b]"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {staff.constraints.length === 0
                          ? "ללא מגבלות"
                          : `${staff.constraints.length} מגבלות`}
                      </span>
                    </div>
                  </div>

                  {staff.constraints.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center">
                      לא הוגשו מגבלות לשבוע זה
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {staff.constraints.map((c) => {
                        const start = new Date(c.startTime);
                        const end = new Date(c.endTime);
                        return (
                          <div key={c.id} className="px-4 py-2.5 flex items-start gap-3">
                            <div className="mt-0.5">
                              {c.priority === "HARD" ? (
                                <ShieldAlert className="w-4 h-4 text-red-500" />
                              ) : (
                                <Shield className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                                    c.priority === "HARD"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {c.priority === "HARD" ? "חובה" : "העדפה"}
                                </span>
                                <span className="text-xs text-slate-600 font-medium">
                                  {constraintDateFormatter.format(start)}
                                </span>
                                {c.isFullDay ? (
                                  <span className="text-[11px] text-slate-500">כל היום</span>
                                ) : (
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    {constraintTimeFormatter.format(start)}–{constraintTimeFormatter.format(end)}
                                  </span>
                                )}
                              </div>
                              {c.reason && (
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                  {c.reason}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
