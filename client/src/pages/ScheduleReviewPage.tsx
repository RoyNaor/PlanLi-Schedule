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
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  Plus,
  ShieldAlert,
  Shield,
} from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner, LoadingState } from "../components/ui/LoadingIndicator";
import {
  getRoleIcon,
  getRoleLabel,
  getRolePluralLabel,
  isStaffRole,
  staffRoleOptions,
} from "../utils/staffing";
import {
  addDaysToIsoDate,
  getJerusalemTodayIsoDate,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

function hebrewRole(role: string) {
  return getRoleLabel(role);
}

function hebrewRoleCount(role: string, count: number) {
  return count === 1 ? getRoleLabel(role) : getRolePluralLabel(role);
}

const staffRoleOrder = new Map<string, number>(
  staffRoleOptions.map((role, index) => [role.value, index]),
);

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

interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

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
              ? "bg-[#ebf4fb] text-[#1d5c8b]"
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
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
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

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [addSelections, setAddSelections] = useState<Record<number, string>>({});

  // Constraints tab state
  const [activeTab, setActiveTab] = useState<"schedule" | "constraints">("schedule");
  const [constraintsSummary, setConstraintsSummary] = useState<StaffConstraintSummary[]>([]);
  const [constraintsLoading, setConstraintsLoading] = useState(false);

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

  const fetchAllStaff = useCallback(async () => {
    try {
      const response = await axios.get<StaffMember[]>(`${API_BASE}/users`, {
        headers: authHeaders,
      });
      setAllStaff(response.data.filter((u) => isStaffRole(u.role)));
    } catch {
      // non-critical, just won't show add dropdown
    }
  }, [authHeaders]);

  const fetchConstraintsSummary = useCallback(async () => {
    setConstraintsLoading(true);
    try {
      const response = await axios.get<ConstraintsSummaryResponse>(
        `${API_BASE}/weeks/${weekStart}/constraints-summary`,
        { headers: authHeaders },
      );
      setConstraintsSummary(response.data.summary);
    } catch {
      setConstraintsSummary([]);
    } finally {
      setConstraintsLoading(false);
    }
  }, [authHeaders, weekStart]);

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
    setEditMode(false);
    setAddSelections({});
  }, [token, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === "constraints") {
      void fetchConstraintsSummary();
    }
  }, [activeTab, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleEnterEditMode = () => {
    void fetchAllStaff();
    setEditMode(true);
    setAddSelections({});
  };

  const handleRemoveAssignment = async (shiftId: number, userId: string) => {
    if (!selectedVersionId) return;
    setSaving(true);
    setError("");
    try {
      await axios.delete(
        `${API_BASE}/schedule-versions/${selectedVersionId}/assignments/${shiftId}/${userId}`,
        { headers: authHeaders },
      );
      await fetchVersionDetail(selectedVersionId);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error ?? "שגיאה בהסרת שיבוץ");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignment = async (shiftId: number) => {
    const userId = addSelections[shiftId];
    if (!selectedVersionId || !userId) return;
    setSaving(true);
    setError("");
    try {
      await axios.post(
        `${API_BASE}/schedule-versions/${selectedVersionId}/assignments`,
        { shift_id: shiftId, user_id: userId },
        { headers: authHeaders },
      );
      setAddSelections((prev) => ({ ...prev, [shiftId]: "" }));
      await fetchVersionDetail(selectedVersionId);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error ?? "שגיאה בהוספת שיבוץ");
    } finally {
      setSaving(false);
    }
  };

  // Group assignments by shift for display
  const groupedAssignments = useMemo(() => {
    if (!selectedVersion) return [];
    const map = new Map<number, ScheduleAssignment[]>();
    for (const a of selectedVersion.assignments) {
      if (!map.has(a.shiftId)) map.set(a.shiftId, []);
      map.get(a.shiftId)!.push(a);
    }
    return Array.from(map.entries()).map(([shiftId, assignments]) => {
      const orderedAssignments = [...assignments].sort(
        (a, b) =>
          (staffRoleOrder.get(a.userRole) ?? 999) - (staffRoleOrder.get(b.userRole) ?? 999) ||
          a.userFullName.localeCompare(b.userFullName),
      );
      const roleCounts = orderedAssignments.reduce<Record<string, number>>((acc, assignment) => {
        acc[assignment.userRole] = (acc[assignment.userRole] ?? 0) + 1;
        return acc;
      }, {});
      return {
        shiftId,
        shiftDate: assignments[0].shiftDate,
        startTime: assignments[0].startTime,
        endTime: assignments[0].endTime,
        assignments: orderedAssignments,
        roleCounts,
        total: assignments.length,
        assignedUserIds: new Set(assignments.map((a) => a.userId)),
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
            className="h-10 px-5 rounded-xl bg-[#1d5c8b] text-white text-sm font-semibold hover:bg-[#164e78] disabled:opacity-50 transition-colors shadow-sm inline-flex items-center gap-2 self-start"
            onClick={handlePublish}
            disabled={!selectedVersionId || publishing}
          >
            {publishing ? <LoadingSpinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
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

        {/* Published status bar */}
        {publishedVersion ? (
          <div className="rounded-2xl border border-[#1d5c8b]/20 bg-[#ebf4fb] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1d5c8b] flex items-center justify-center shrink-0">
                <BadgeCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0f2a44]">
                  גרסה #{publishedVersion.versionNumber} פעילה
                </p>
                <p className="text-xs text-[#1d5c8b]">
                  {publishedVersionSummary?.assignmentCount ?? 0} שיבוצים
                  {" · "}
                  פורסמה {formatDateTime(publishedVersion.createdAt)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleFocusPublishedVersion()}
              className="h-9 px-4 rounded-lg border border-[#1d5c8b]/30 bg-white text-[#1d5c8b] text-xs font-medium hover:bg-[#ebf4fb] inline-flex items-center gap-1.5 transition-colors"
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
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <LoadingState label="טוען סידור..." />
          </div>
        ) : null}

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
                          setEditMode(false);
                          setAddSelections({});
                          void fetchVersionDetail(version.id);
                        }}
                        className={`w-full text-right rounded-xl border p-3 transition-all ${
                          isSelected
                            ? "border-[#1d5c8b]/40 bg-white shadow-md ring-1 ring-[#ebf4fb]"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold ${isSelected ? "text-[#1d5c8b]" : "text-slate-800"}`}>
                            #{version.versionNumber}
                          </p>
                          {version.isPublished && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ebf4fb] px-1.5 py-0.5 text-[10px] font-bold text-[#1d5c8b]">
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

            {/* Main content area */}
            <div className="lg:col-span-9">
              {/* Tab bar */}
              <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setActiveTab("schedule")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "schedule"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  סידור
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("constraints")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "constraints"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  מגבלות עובדים
                </button>
              </div>

              {/* Schedule tab */}
              {activeTab === "schedule" && (
                <>
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
                          {selectedVersion.isPublished && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#ebf4fb] px-2.5 py-1 text-xs font-semibold text-[#1d5c8b]">
                              <BadgeCheck className="w-3.5 h-3.5" />
                              גרסה פעילה
                            </span>
                          )}
                        </div>
                        {/* Edit toggle */}
                        {editMode ? (
                          <button
                            type="button"
                            onClick={() => { setEditMode(false); setAddSelections({}); }}
                            className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors"
                            disabled={saving}
                          >
                            {saving ? (
                              <LoadingSpinner className="w-3.5 h-3.5 text-[#1d5c8b]" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#1d5c8b]" />
                            )}
                            סיים עריכה
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleEnterEditMode}
                            className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            עריכה ידנית
                          </button>
                        )}
                      </div>

                      {editMode && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
                          <Pencil className="w-3.5 h-3.5 shrink-0" />
                          מצב עריכה פעיל — ניתן להסיר עובדים משיבוץ או להוסיף עובדים חדשים לכל משמרת.
                        </div>
                      )}

                      {/* Shift cards */}
                      {groupedAssignments.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                          <p className="text-sm text-slate-500">אין שיבוצים בגרסה זו.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {groupedAssignments.map((group) => {
                            const availableStaff = allStaff.filter(
                              (s) => !group.assignedUserIds.has(s.id),
                            );
                            const selectedAddUserId = addSelections[group.shiftId] ?? "";

                            return (
                              <div
                                key={group.shiftId}
                                className={`rounded-2xl border bg-white overflow-hidden shadow-sm transition-all ${
                                  editMode ? "border-blue-200 ring-1 ring-blue-50" : "border-slate-200"
                                }`}
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
                                    {Object.entries(group.roleCounts).map(([role, count]) => {
                                      const Icon = getRoleIcon(role);
                                      return (
                                        <span key={role} className="inline-flex items-center gap-1">
                                          <Icon className="w-3 h-3" />
                                          {count} {hebrewRoleCount(role, count)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Staff rows */}
                                <div className="divide-y divide-slate-100">
                                  {group.assignments.map((a) => {
                                    const Icon = getRoleIcon(a.userRole);
                                    return (
                                      <div
                                        key={`${a.shiftId}-${a.userId}`}
                                        className="px-4 py-2.5 flex items-center justify-between"
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-full bg-[#ebf4fb] flex items-center justify-center">
                                            <Icon className="w-3 h-3 text-[#1d5c8b]" />
                                          </div>
                                          <span className="text-sm font-medium text-slate-800">
                                            {a.userFullName}
                                          </span>
                                          {a.source === "manual" && (
                                            <span className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-semibold">
                                              ידני
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-semibold text-[#1d5c8b]">
                                            {hebrewRole(a.userRole)}
                                          </span>
                                          {editMode && (
                                            <button
                                              type="button"
                                              onClick={() => void handleRemoveAssignment(a.shiftId, a.userId)}
                                              disabled={saving}
                                              className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors disabled:opacity-50"
                                              title="הסר שיבוץ"
                                            >
                                              {saving ? (
                                                <LoadingSpinner className="w-3 h-3 text-red-600" />
                                              ) : (
                                                <X className="w-3 h-3 text-red-600" />
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Add employee row (edit mode only) */}
                                {editMode && (
                                  <div className="px-4 py-2.5 border-t border-dashed border-blue-200 bg-blue-50/50 flex items-center gap-2">
                                    <select
                                      value={selectedAddUserId}
                                      onChange={(e) =>
                                        setAddSelections((prev) => ({
                                          ...prev,
                                          [group.shiftId]: e.target.value,
                                        }))
                                      }
                                      className="flex-1 text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      disabled={saving}
                                    >
                                      <option value="">בחר עובד להוספה...</option>
                                      {availableStaff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.full_name} ({hebrewRole(s.role)})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => void handleAddAssignment(group.shiftId)}
                                      disabled={!selectedAddUserId || saving}
                                      className="h-7 w-7 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center transition-colors"
                                      title="הוסף עובד"
                                    >
                                      {saving ? (
                                        <LoadingSpinner className="w-3.5 h-3.5 text-white" />
                                      ) : (
                                        <Plus className="w-3.5 h-3.5 text-white" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Constraints tab */}
              {activeTab === "constraints" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700">
                      מגבלות עובדים לשבוע זה
                    </h2>
                    <span className="text-xs text-slate-400">
                      {constraintsSummary.filter((s) => s.constraints.length > 0).length} עובדים עם מגבלות
                    </span>
                  </div>

                  {constraintsLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white">
                      <LoadingState label="טוען מגבלות..." className="p-6" />
                    </div>
                  ) : constraintsSummary.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                      <p className="text-sm text-slate-500">אין עובדים במערכת.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {constraintsSummary.map((staff) => {
                        const Icon = getRoleIcon(staff.role);
                        return (
                        <div
                          key={staff.userId}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                        >
                          {/* Staff header */}
                          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#ebf4fb] flex items-center justify-center">
                                <Icon className="w-4 h-4 text-[#1d5c8b]" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-800">
                                  {staff.fullName}
                                </p>
                                <p className="text-[11px] text-slate-400">{staff.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#ebf4fb] text-[#1d5c8b]">
                                {hebrewRole(staff.role)}
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

                          {/* Constraint rows */}
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
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
