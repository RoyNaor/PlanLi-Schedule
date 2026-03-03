import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { BadgeCheck, Eye, Sparkles } from "lucide-react";
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

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ISRAEL_TIMEZONE,
});

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return dateTimeFormatter.format(parsed);
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
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return weekStart;
    }
    return `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`;
  }, [weekStart]);

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
    if (!publishedVersion) {
      return;
    }

    setSelectedVersionId(publishedVersion.id);
    await fetchVersionDetail(publishedVersion.id);
  }, [fetchVersionDetail, publishedVersion]);

  const publishedVersionSummary = useMemo(() => {
    if (!publishedVersion) {
      return null;
    }
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
    if (!token || !weekStart) {
      return;
    }
    void fetchVersions();
  }, [fetchVersions, token, weekStart]);

  const handlePublish = async () => {
    if (!selectedVersionId) {
      return;
    }

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

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/schedule" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">סקירה ופרסום סידור</h1>
          <p className="text-slate-500 mt-1">בחירת גרסת סידור, סקירה ופרסום לשבוע.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">תחילת שבוע</label>
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
            onClick={() => setWeekStart(startOfWeekSundayIso(getJerusalemTodayIsoDate()))}
          >
            השבוע הנוכחי
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-60"
            onClick={handlePublish}
            disabled={!selectedVersionId || publishing}
          >
            {publishing ? "מפרסם..." : "פרסם גרסה נבחרת"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">טווח השבוע: {weekLabel}</p>
          <p className="text-sm text-slate-600 mt-1">
            גרסה שפורסמה:{" "}
            {publishedVersion ? `#${publishedVersion.versionNumber}` : "עדיין לא פורסמה"}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Published Snapshot
              </p>
              <h2 className="text-xl font-bold text-slate-900 mt-1 inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-700" />
                {publishedVersion
                  ? `Version #${publishedVersion.versionNumber}`
                  : "No published version yet"}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                {publishedVersion
                  ? "This is the schedule currently visible to staff for this week."
                  : "Publish one of the available versions to make it visible to staff."}
              </p>
            </div>

            {publishedVersion ? (
              <button
                type="button"
                onClick={() => void handleFocusPublishedVersion()}
                className="h-10 px-4 rounded-lg border border-emerald-300 bg-white/80 text-emerald-900 text-sm font-medium hover:bg-white inline-flex items-center gap-2 self-start"
              >
                <Eye className="w-4 h-4" />
                Focus Published Version
              </button>
            ) : null}
          </div>

          {publishedVersion ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/80 border border-white px-3 py-3">
                <p className="text-xs text-slate-500">Assignments</p>
                <p className="text-base font-semibold text-slate-900 mt-1">
                  {publishedVersionSummary?.assignmentCount ?? "-"}
                </p>
              </div>
              <div className="rounded-xl bg-white/80 border border-white px-3 py-3">
                <p className="text-xs text-slate-500">Version Created At</p>
                <p className="text-base font-semibold text-slate-900 mt-1">
                  {formatDateTime(publishedVersion.createdAt)}
                </p>
              </div>
              <div className="rounded-xl bg-white/80 border border-white px-3 py-3">
                <p className="text-xs text-slate-500">Status</p>
                <p className="text-base font-semibold text-emerald-700 mt-1 inline-flex items-center gap-1">
                  <BadgeCheck className="w-4 h-4" />
                  Live
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="text-rose-600">{error}</p> : null}
        {loading ? <p className="text-slate-500">טוען...</p> : null}

        {!loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">גרסאות זמינות</h2>
              {versions.length === 0 ? (
                <p className="text-sm text-slate-500">אין גרסאות לשבוע הזה.</p>
              ) : (
                versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => {
                      setSelectedVersionId(version.id);
                      void fetchVersionDetail(version.id);
                    }}
                    className={`w-full text-right rounded-lg border px-3 py-3 transition ${
                      selectedVersionId === version.id
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-medium text-slate-900">גרסה #{version.versionNumber}</p>
                    <p className="text-xs text-slate-500 mt-1">שיבוצים: {version.assignmentCount}</p>
                    {version.isPublished ? (
                      <p className="text-xs text-emerald-700 mt-1">פורסם</p>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">פרטי גרסה</h2>
              {!selectedVersion ? (
                <p className="text-sm text-slate-500">בחר גרסה להצגה.</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    גרסה #{selectedVersion.versionNumber} | שיבוצים:{" "}
                    {selectedVersion.assignments.length}
                  </p>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="text-right px-4 py-3">תאריך</th>
                          <th className="text-right px-4 py-3">שעה</th>
                          <th className="text-right px-4 py-3">עובד</th>
                          <th className="text-right px-4 py-3">תפקיד</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVersion.assignments.map((assignment) => (
                          <tr
                            key={`${assignment.shiftId}-${assignment.userId}`}
                            className="border-t border-slate-100"
                          >
                            <td className="px-4 py-3">
                              {dateFormatter.format(parseIsoDateToUtc(assignment.shiftDate))}
                            </td>
                            <td className="px-4 py-3">
                              {assignment.startTime} - {assignment.endTime}
                            </td>
                            <td className="px-4 py-3">{assignment.userFullName}</td>
                            <td className="px-4 py-3">{assignment.userRole}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
