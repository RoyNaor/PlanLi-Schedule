import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  AlertTriangle,
  Users,
  Send,
  Stethoscope,
  UserRoundPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import {
  addDaysToIsoDate,
  getJerusalemTodayIsoDate,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const roleLabels: Record<string, string> = {
  doctor: "רופא",
  nurse: "אחות",
  admin: "מנהל",
};

function hebrewRole(role: string) {
  return roleLabels[role] ?? role;
}

interface ScheduleVersionSummary {
  id: string;
  weekStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
  solverMeta: Record<string, unknown> | null;
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

interface ScheduleVersionDetail {
  id: string;
  weekStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignments: ScheduleAssignment[];
}

interface ListVersionsResponse {
  week_start: string;
  versions: ScheduleVersionSummary[];
}

interface VersionDetailResponse {
  version: ScheduleVersionDetail;
}

interface PublishedScheduleResponse {
  schedule: {
    weekStart: string;
    version: ScheduleVersionSummary;
    assignments: ScheduleAssignment[];
  };
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: ISRAEL_TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ISRAEL_TIMEZONE,
});

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTimeFormatter.format(parsed);
}

function SolverQualityBadge({ solverMeta }: { solverMeta: Record<string, unknown> | null }) {
  if (!solverMeta) return null;
  const violations =
    typeof solverMeta.soft_violations === "number" ? solverMeta.soft_violations : null;
  const wallTime =
    typeof solverMeta.wall_time_seconds === "number" ? solverMeta.wall_time_seconds : null;
  const isOptimal = solverMeta.solver_status === "optimal";

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {violations !== null && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            violations === 0
              ? "bg-emerald-100 text-emerald-700"
              : violations <= 2
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {violations === 0 ? (
            <CheckCircle2 className="w-2.5 h-2.5" />
          ) : (
            <AlertTriangle className="w-2.5 h-2.5" />
          )}
          {violations === 0 ? "ללא הפרות" : `${violations} הפרות`}
        </span>
      )}
      {isOptimal && (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
          <CheckCircle2 className="w-2.5 h-2.5" />
          אופטימלי
        </span>
      )}
      {wallTime !== null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
          <Clock className="w-2.5 h-2.5" />
          {wallTime.toFixed(1)} שנ׳
        </span>
      )}
    </div>
  );
}

export default function ScheduleReviewPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekSundayIso(getJerusalemTodayIsoDate()),
  );
  const [versions, setVersions] = useState<ScheduleVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<ScheduleVersionDetail | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<ScheduleVersionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  const navigateWeek = useCallback(
    (offset: number) => {
      setWeekStart((prev) => addDaysToIsoDate(prev, offset));
    },
    [],
  );

  const fetchPublished = useCallback(async () => {
    try {
      const response = await axios.get<PublishedScheduleResponse>(`${API_BASE}/admin/schedule`, {
        params: { week_start: weekStart },
        headers: authHeaders,
      });
      setPublishedVersion(response.data.schedule.version);
    } catch (requestError: any) {
      if (requestError?.response?.status === 404) {
        setPublishedVersion(null);
        return;
      }
      throw requestError;
    }
  }, [authHeaders, weekStart]);

  const fetchVersionDetail = useCallback(
    async (versionId: string) => {
      if (!versionId) {
        setSelectedVersion(null);
        return;
      }
      const response = await axios.get<VersionDetailResponse>(
        `${API_BASE}/schedule-versions/${versionId}`,
        { headers: authHeaders },
      );
      setSelectedVersion(response.data.version);
    },
    [authHeaders],
  );

  const handleFocusPublishedVersion = useCallback(async () => {
    if (!publishedVersion) return;
    setSelectedVersionId(publishedVersion.id);
    await fetchVersionDetail(publishedVersion.id);
  }, [fetchVersionDetail, publishedVersion]);

  const publishedVersionSummary = useMemo(() => {
    if (!publishedVersion) return null;
    return versions.find((version) => version.id === publishedVersion.id) ?? null;
  }, [publishedVersion, versions]);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get<ListVersionsResponse>(
        `${API_BASE}/weeks/${weekStart}/schedule-versions`,
        { headers: authHeaders },
      );
      const items = response.data.versions ?? [];
      setVersions(items);

      const nextSelected =
        selectedVersionId && items.some((version) => version.id === selectedVersionId)
          ? selectedVersionId
          : items[0]?.id ?? "";
      setSelectedVersionId(nextSelected);

      if (nextSelected) {
        await fetchVersionDetail(nextSelected);
      } else {
        setSelectedVersion(null);
      }

      await fetchPublished();
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error ?? "שגיאה בטעינת הגרסאות";
      setError(message);
      setVersions([]);
      setSelectedVersion(null);
      setPublishedVersion(null);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, fetchPublished, fetchVersionDetail, selectedVersionId, weekStart]);

  useEffect(() => {
    if (!token || !weekStart) return;
    void fetchVersions();
  }, [fetchVersions, token, weekStart]);

  const handlePublish = async () => {
    if (!selectedVersionId) return;
    try {
      setPublishing(true);
      setError("");
      await axios.post(
        `${API_BASE}/schedule-versions/${selectedVersionId}/publish`,
        {},
        { headers: authHeaders },
      );
      await fetchVersions();
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error ?? "שגיאה בפרסום הגרסה";
      setError(message);
    } finally {
      setPublishing(false);
    }
  };

  // Group assignments by shift date for better readability
  const groupedAssignments = useMemo(() => {
    if (!selectedVersion) return [];
    const map = new Map<string, ScheduleAssignment[]>();
    for (const a of selectedVersion.assignments) {
      const key = `${a.shiftDate}|${a.startTime}-${a.endTime}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries()).map(([key, assignments]) => {
      const doctors = assignments.filter((a) => a.userRole === "doctor");
      const nurses = assignments.filter((a) => a.userRole === "nurse");
      return {
        key,
        shiftDate: assignments[0].shiftDate,
        startTime: assignments[0].startTime,
        endTime: assignments[0].endTime,
        doctors,
        nurses,
        total: assignments.length,
      };
    });
  }, [selectedVersion]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/schedule" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">סקירת סידור</h1>
            <p className="text-sm text-slate-500 mt-0.5">סקירה, השוואה ופרסום גרסאות סידור לצוות.</p>
          </div>
          <button
            type="button"
            className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm inline-flex items-center gap-2 self-start"
            onClick={handlePublish}
            disabled={!selectedVersionId || publishing}
          >
            <Send className="w-4 h-4" />
            {publishing ? "מפרסם..." : "פרסם גרסה נבחרת"}
          </button>
        </div>

        {/* Week navigator */}
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigateWeek(7)}
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>

          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-900">{weekLabel}</span>
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeekSundayIso(getJerusalemTodayIsoDate()))}
              className="text-xs text-emerald-600 font-medium hover:underline"
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

        {/* Published status bar */}
        {publishedVersion ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <BadgeCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  גרסה #{publishedVersion.versionNumber} פעילה
                </p>
                <p className="text-xs text-emerald-700">
                  {publishedVersionSummary?.assignmentCount ?? 0} שיבוצים
                  {" · "}
                  פורסמה {formatDateTime(publishedVersion.createdAt)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleFocusPublishedVersion()}
              className="h-9 px-4 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-xs font-medium hover:bg-emerald-50 inline-flex items-center gap-1.5 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              הצג
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">אין גרסה מפורסמת</p>
              <p className="text-xs text-amber-700">יש לבחור גרסה ולפרסם כדי להציג את הסידור לצוות.</p>
            </div>
          </div>
        )}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {loading ? <p className="text-slate-500 text-sm">טוען...</p> : null}

        {!loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Versions sidebar */}
            <div className="lg:col-span-3 space-y-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                גרסאות ({versions.length})
              </h2>
              {versions.length === 0 ? (
                <p className="text-sm text-slate-500 px-1">אין גרסאות לשבוע זה.</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => {
                    const isSelected = selectedVersionId === version.id;
                    return (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => {
                          setSelectedVersionId(version.id);
                          void fetchVersionDetail(version.id);
                        }}
                        className={`w-full text-right rounded-xl border p-3 transition-all ${
                          isSelected
                            ? "border-emerald-400 bg-white shadow-md ring-1 ring-emerald-100"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold ${isSelected ? "text-emerald-700" : "text-slate-800"}`}>
                            #{version.versionNumber}
                          </p>
                          {version.isPublished && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              <BadgeCheck className="w-2.5 h-2.5" />
                              פעילה
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {version.assignmentCount} שיבוצים
                        </p>
                        <SolverQualityBadge solverMeta={version.solverMeta} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Schedule detail */}
            <div className="lg:col-span-9">
              {!selectedVersion ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                  <p className="text-sm text-slate-500">בחר גרסה מהרשימה לצפייה בפרטי הסידור.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Version header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-slate-900">
                        גרסה #{selectedVersion.versionNumber}
                      </h2>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Users className="w-3.5 h-3.5" />
                        {selectedVersion.assignments.length} שיבוצים
                      </span>
                    </div>
                    {selectedVersion.isPublished && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        גרסה פעילה
                      </span>
                    )}
                  </div>

                  {/* Shift cards */}
                  {groupedAssignments.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                      <p className="text-sm text-slate-500">אין שיבוצים בגרסה זו.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedAssignments.map((group) => (
                        <div
                          key={group.key}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                        >
                          {/* Shift header */}
                          <div className="bg-gradient-to-l from-slate-50 to-slate-100 px-4 py-3 border-b border-slate-200">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-slate-800">
                                {shortDateFormatter.format(parseIsoDateToUtc(group.shiftDate))}
                              </p>
                              <span className="text-xs font-mono text-slate-600 bg-white rounded-lg px-2 py-0.5 border border-slate-200">
                                {group.startTime} - {group.endTime}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" />
                                {group.doctors.length} רופאים
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <UserRoundPlus className="w-3 h-3" />
                                {group.nurses.length} אחיות
                              </span>
                            </div>
                          </div>

                          {/* Staff rows */}
                          <div className="divide-y divide-slate-100">
                            {group.doctors.map((a) => (
                              <div
                                key={`${a.shiftId}-${a.userId}`}
                                className="px-4 py-2.5 flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                    <Stethoscope className="w-3 h-3 text-blue-600" />
                                  </div>
                                  <span className="text-sm font-medium text-slate-800">
                                    {a.userFullName}
                                  </span>
                                </div>
                                <span className="text-[11px] font-semibold text-blue-600">
                                  {hebrewRole(a.userRole)}
                                </span>
                              </div>
                            ))}
                            {group.nurses.map((a) => (
                              <div
                                key={`${a.shiftId}-${a.userId}`}
                                className="px-4 py-2.5 flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center">
                                    <UserRoundPlus className="w-3 h-3 text-pink-600" />
                                  </div>
                                  <span className="text-sm font-medium text-slate-800">
                                    {a.userFullName}
                                  </span>
                                </div>
                                <span className="text-[11px] font-semibold text-pink-600">
                                  {hebrewRole(a.userRole)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
