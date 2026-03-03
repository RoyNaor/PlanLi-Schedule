import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
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

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

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

  const weekLabel = useMemo(() => {
    const end = addDaysToIsoDate(weekStart, 6);
    const startDate = parseIsoDateToUtc(weekStart);
    const endDate = parseIsoDateToUtc(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return weekStart;
    }
    return `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`;
  }, [weekStart]);

  useEffect(() => {
    if (!token || !weekStart) {
      return;
    }

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

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">הסידור שפורסם</h1>
          <p className="text-slate-500 mt-1">צפייה במשמרות המאושרות שלך בלבד.</p>
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
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">טווח השבוע: {weekLabel}</p>
          {schedule ? (
            <p className="text-sm text-slate-600 mt-1">
              גרסה שפורסמה: #{schedule.version.versionNumber} | משמרות:{" "}
              {schedule.assignments.length}
            </p>
          ) : null}
        </div>

        {loading ? <p className="text-slate-500">טוען...</p> : null}
        {!loading && error ? <p className="text-rose-600">{error}</p> : null}

        {!loading && schedule ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right px-4 py-3">תאריך</th>
                  <th className="text-right px-4 py-3">שעה</th>
                  <th className="text-right px-4 py-3">תפקיד</th>
                </tr>
              </thead>
              <tbody>
                {schedule.assignments.map((assignment) => (
                  <tr key={`${assignment.shiftId}-${assignment.userId}`} className="border-t">
                    <td className="px-4 py-3">
                      {dateFormatter.format(parseIsoDateToUtc(assignment.shiftDate))}
                    </td>
                    <td className="px-4 py-3">
                      {assignment.startTime} - {assignment.endTime}
                    </td>
                    <td className="px-4 py-3">{assignment.userRole}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
