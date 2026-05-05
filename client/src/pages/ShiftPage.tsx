import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Link, Navigate } from "react-router-dom";
import { BrainCircuit, CheckCircle2, Eye, Lock, XCircle } from "lucide-react";
import { AuthService } from "../services/auth.service";
import { LoadingSpinner } from "../components/ui/LoadingIndicator";
import { staffingFields, type StaffingField } from "../utils/staffing";

import WeekBar from "../components/shifts/WeekBar";
import WeekPickerModal from "../components/shifts/WeekPickerModal";
import WeekShiftGrid from "../components/shifts/WeekShiftGrid";
import DuplicateWeekModal from "../components/shifts/DuplicateWeekModal";
import CollectionDeadlineModal from "../components/shifts/CollectionDeadlineModal";

import type { Shift, WeekStatus, WeekSummary } from "../components/types";
import ShiftFormModal from "../components/shifts/ShiftFormModal";
import {
  getWeekDates,
  parseIsoDateToUtc,
  addDaysToIsoDate,
  normalizeApiDateToIso,
  normalizeApiTimeToHourMinute,
  getJerusalemTodayIsoDate,
  startOfWeekSundayIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

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

export default function ShiftPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";

  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(() =>
    startOfWeekSundayIso(getJerusalemTodayIsoDate()),
  );
  const [loadingWeeks, setLoadingWeeks] = useState(true);

  const [showWeekModal, setShowWeekModal] = useState(false);
  const [showDuplicateWeekModal, setShowDuplicateWeekModal] = useState(false);
  const [showCollectionDeadlineModal, setShowCollectionDeadlineModal] = useState(false);
  const [openingCollection, setOpeningCollection] = useState(false);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalMode, setShiftModalMode] = useState<"create" | "edit">("create");
  const [draftShiftDate, setDraftShiftDate] = useState("");
  const [shiftToEdit, setShiftToEdit] = useState<Shift | null>(null);

  // Solver flow state
  type SolveRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  const [activeSolveRun, setActiveSolveRun] = useState<{
    runId: string;
    status: SolveRunStatus;
    errorMessage: string | null;
  } | null>(null);
  const [solving, setSolving] = useState(false);
  const [forceLocking, setForceLocking] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const fetchWeeks = useCallback(async () => {
    if (!token) return;

    try {
      setLoadingWeeks(true);

      const res = await axios.get<{ weeks: WeekSummary[] }>(
        `${API_BASE}/weeks`,
        {
          headers: authHeaders,
        },
      );

      const loadedWeeks = (res.data.weeks ?? []).map((w) => ({
        ...w,
        weekStart: normalizeApiDateToIso(w.weekStart),
      }));

      setWeeks(loadedWeeks);

      setSelectedWeek((current) => {
        if (!current) return loadedWeeks[0]?.weekStart ?? "";
        return current;
      });
    } catch (error: any) {
      console.error("Error loading weeks:", error);
      alert(
        `שגיאה בטעינת השבועות: ${error.response?.data?.error ?? "Unknown error"}`,
      );
      setWeeks([]);
      setSelectedWeek("");
    } finally {
      setLoadingWeeks(false);
    }
  }, [authHeaders, token]);

  const fetchShifts = useCallback(
    async (weekStart: string) => {
      if (!token || !weekStart) return;

      try {
        setLoadingShifts(true);

        const res = await axios.get<{ shifts: Shift[] }>(
          `${API_BASE}/shifts/week/${weekStart}`,
          { headers: authHeaders },
        );

        setShifts(
          (res.data.shifts ?? []).map((shift) => ({
            ...shift,
            weekStart: normalizeApiDateToIso(shift.weekStart),
            shiftDate: normalizeApiDateToIso(shift.shiftDate),
            startTime: normalizeApiTimeToHourMinute(shift.startTime) || shift.startTime,
            endTime: normalizeApiTimeToHourMinute(shift.endTime) || shift.endTime,
          })),
        );
      } catch (error: any) {
        console.error("Error loading shifts:", error);
        alert(
          `שגיאה בטעינת המשמרות: ${error.response?.data?.error ?? "Unknown error"}`,
        );
        setShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    },
    [authHeaders, token],
  );

  useEffect(() => {
    if (!token) return;

    const initializeCurrentWeek = async () => {
      const currentWeekStart = startOfWeekSundayIso(getJerusalemTodayIsoDate());
      setSelectedWeek(currentWeekStart);

      try {
        await axios.post(
          `${API_BASE}/weeks`,
          { week_start: currentWeekStart },
          { headers: authHeaders },
        );
      } catch (error) {
        console.error("Error ensuring current week:", error);
      }

      await fetchWeeks();
    };

    void initializeCurrentWeek();
  }, [authHeaders, fetchWeeks, token]);

  useEffect(() => {
    if (selectedWeek) void fetchShifts(selectedWeek);
    else setShifts([]);
  }, [selectedWeek, fetchShifts]);

  const weekDates = useMemo(
    () => (selectedWeek ? getWeekDates(selectedWeek) : []),
    [selectedWeek],
  );

  const selectedWeekRangeLabel = useMemo(() => {
    if (weekDates.length !== 7)
      return loadingWeeks ? "טוען..." : "בחר שבוע לתצוגה";
    return `${dateFormatter.format(parseIsoDateToUtc(weekDates[0]))} - ${dateFormatter.format(
      parseIsoDateToUtc(weekDates[6]),
    )}`;
  }, [weekDates, loadingWeeks]);

  const defaultDuplicateTargetWeek = useMemo(
    () => (selectedWeek ? addDaysToIsoDate(selectedWeek, 7) : ""),
    [selectedWeek],
  );

  const selectedWeekSummary = useMemo(
    () => weeks.find((week) => week.weekStart === selectedWeek) ?? null,
    [selectedWeek, weeks],
  );

  const selectedWeekDeadlineLabel = useMemo(() => {
    const deadline = selectedWeekSummary?.collectionDeadline;
    if (!deadline) return "לא נקבע";

    const parsed = new Date(deadline);
    if (Number.isNaN(parsed.getTime())) return deadline;

    return dateTimeFormatter.format(parsed);
  }, [selectedWeekSummary]);

  const canOpenCollection = useMemo(() => {
    if (!selectedWeekSummary) return false;
    if (selectedWeekSummary.shiftsCount <= 0) return false;
    if (
      selectedWeekSummary.status === "LOCKED" ||
      selectedWeekSummary.status === "SOLVED" ||
      selectedWeekSummary.status === "PUBLISHED"
    ) {
      return false;
    }
    return true;
  }, [selectedWeekSummary]);

  const handleSelectWeekStart = useCallback(
    async (weekStart: string) => {
      if (!token) return;

      try {
        const exists = weeks.some((w) => w.weekStart === weekStart);

        if (!exists) {
          await axios.post(
            `${API_BASE}/weeks`,
            { week_start: weekStart },
            { headers: authHeaders },
          );
          await fetchWeeks();
        }

        setSelectedWeek(weekStart);
      } catch (error: any) {
        console.error("Error selecting/creating week:", error);
        alert(
          `שגיאה בבחירת שבוע: ${error.response?.data?.error ?? "Unknown error"}`,
        );
      }
    },
    [authHeaders, fetchWeeks, token, weeks],
  );

  const navigateWeekByOffset = useCallback(
    async (daysOffset: number) => {
      if (!selectedWeek) return;

      const newWeekStart = addDaysToIsoDate(selectedWeek, daysOffset);

      try {
        const exists = weeks.some((w) => w.weekStart === newWeekStart);

        if (!exists) {
          await axios.post(
            `${API_BASE}/weeks`,
            { week_start: newWeekStart },
            { headers: authHeaders },
          );

          await fetchWeeks();
        }

        setSelectedWeek(newWeekStart);
      } catch (error: any) {
        console.error("Error navigating week:", error);
        alert(
          `שגיאה במעבר שבוע: ${error.response?.data?.error ?? "Unknown error"}`,
        );
      }
    },
    [selectedWeek, weeks, authHeaders, fetchWeeks],
  );

  const handleAddShift = (shiftDate: string) => {
    setShiftModalMode("create");
    setDraftShiftDate(shiftDate);
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
    async (values: {
      shiftDate: string;
      startTime: string;
      endTime: string;
    } & Record<StaffingField, number>) => {
      if (!selectedWeek) return;
      const normalizedStartTime = normalizeApiTimeToHourMinute(values.startTime);
      const normalizedEndTime = normalizeApiTimeToHourMinute(values.endTime);

      if (!normalizedStartTime || !normalizedEndTime) {
        alert("שעת התחלה ושעת סיום חייבות להיות בפורמט HH:mm.");
        throw new Error("Invalid shift time format");
      }

      const payload = {
        week_start: selectedWeek,
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

        await fetchShifts(selectedWeek);
        await fetchWeeks();
      } catch (error: any) {
        console.error("Error saving shift:", error);
        alert(`שגיאה בשמירת משמרת: ${error.response?.data?.error ?? "Unknown error"}`);
        throw error;
      }
    },
    [authHeaders, fetchShifts, fetchWeeks, selectedWeek, shiftModalMode, shiftToEdit],
  );

  const handleDeleteShift = async (shiftId: number) => {
    const ok = window.confirm("למחוק את המשמרת הזו?");
    if (!ok) return;

    try {
      await axios.delete(`${API_BASE}/shifts/${shiftId}`, {
        headers: authHeaders,
      });
      if (selectedWeek) await fetchShifts(selectedWeek);
      await fetchWeeks(); // כדי לעדכן shiftsCount
    } catch (error: any) {
      console.error("Error deleting shift:", error);
      alert(
        `שגיאה במחיקת משמרת: ${error.response?.data?.error ?? "Unknown error"}`,
      );
    }
  };

  const handleDuplicateWeek = useCallback(
    async (values: { sourceWeekStart: string; targetWeekStart: string }) => {
      if (!token) return;

      try {
        const normalizedSourceWeek = startOfWeekSundayIso(values.sourceWeekStart);
        const normalizedTargetWeek = startOfWeekSundayIso(values.targetWeekStart);

        if (!normalizedSourceWeek || !normalizedTargetWeek) {
          throw new Error("source and target weeks must be valid ISO dates");
        }

        await axios.post(
          `${API_BASE}/weeks/duplicate`,
          {
            source_week_start: normalizedSourceWeek,
            target_week_start: normalizedTargetWeek,
          },
          { headers: authHeaders },
        );

        await fetchWeeks();
        setSelectedWeek(normalizedTargetWeek);
        await fetchShifts(normalizedTargetWeek);
      } catch (error: any) {
        console.error("Error duplicating week:", error);
        alert(`שגיאה בשכפול שבוע: ${error.response?.data?.error ?? "Unknown error"}`);
        throw error;
      }
    },
    [authHeaders, fetchShifts, fetchWeeks, token],
  );

  const openConstraintCollection = useCallback(
    async (deadlineIso: string) => {
      if (!selectedWeek) return;

      try {
        setOpeningCollection(true);
        await axios.post(
          `${API_BASE}/weeks/${selectedWeek}/open-collection`,
          { collection_deadline: deadlineIso },
          { headers: authHeaders },
        );
        await fetchWeeks();
      } catch (error: any) {
        console.error("Error opening collection:", error);
        alert(
          `שגיאה בפתיחת איסוף אילוצים: ${error.response?.data?.error ?? "שגיאה לא ידועה"}`,
        );
        throw error;
      } finally {
        setOpeningCollection(false);
      }
    },
    [authHeaders, fetchWeeks, selectedWeek],
  );

  const handleOpenCollectionNow = useCallback(async () => {
    try {
      await openConstraintCollection(new Date().toISOString());
    } catch {
      // Error alert is handled inside openConstraintCollection.
    }
  }, [openConstraintCollection]);

  // Clear polling interval on unmount.
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Reset solver run state when the selected week changes.
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setActiveSolveRun(null);
  }, [selectedWeek]);

  const pollSolveRun = useCallback(
    async (runId: string) => {
      try {
        const res = await axios.get<{ run: { id: string; status: string; errorMessage: string | null } }>(
          `${API_BASE}/solve-runs/${runId}`,
          { headers: authHeaders },
        );
        const run = res.data.run;
        const status = run.status as "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
        setActiveSolveRun({ runId, status, errorMessage: run.errorMessage });

        if (status === "SUCCEEDED" || status === "FAILED") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          if (status === "SUCCEEDED") {
            await fetchWeeks();
          }
        }
      } catch {
        // Ignore transient network errors during polling.
      }
    },
    [authHeaders, fetchWeeks],
  );

  const handleSolveWeek = useCallback(async () => {
    if (!selectedWeek) return;
    try {
      setSolving(true);
      const res = await axios.post<{ queued: boolean; run: { id: string; status: string } }>(
        `${API_BASE}/weeks/${selectedWeek}/solve`,
        {},
        { headers: authHeaders },
      );
      const run = res.data.run;
      setActiveSolveRun({ runId: run.id, status: run.status as "QUEUED", errorMessage: null });

      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(() => {
        void pollSolveRun(run.id);
      }, 2000);
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? "שגיאה לא ידועה";
      alert(`שגיאה בהפעלת השיבוץ: ${msg}`);
    } finally {
      setSolving(false);
    }
  }, [authHeaders, selectedWeek, pollSolveRun]);

  const handleForceLock = useCallback(async () => {
    if (!selectedWeek) return;
    try {
      setForceLocking(true);
      await axios.post(`${API_BASE}/weeks/${selectedWeek}/lock`, {}, { headers: authHeaders });
      await fetchWeeks();
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? "שגיאה לא ידועה";
      alert(`שגיאה בנעילת השבוע: ${msg}`);
    } finally {
      setForceLocking(false);
    }
  }, [authHeaders, selectedWeek, fetchWeeks]);

  const isSolverRunning =
    activeSolveRun?.status === "QUEUED" || activeSolveRun?.status === "RUNNING";

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">ניהול משמרות</h1>
          <p className="text-slate-500 mt-1">
            בחירת שבוע וניהול משמרות לפי ימים.
          </p>
        </div>

        <WeekBar
          selectedWeekRangeLabel={selectedWeekRangeLabel}
          canGoPrev={!!selectedWeek}
          canGoNext={!!selectedWeek}
          canDuplicate={weeks.length > 0}
          onPrev={() => navigateWeekByOffset(-7)}
          onNext={() => navigateWeekByOffset(7)}
          onOpenPicker={() => setShowWeekModal(true)}
          onOpenDuplicate={() => setShowDuplicateWeekModal(true)}
        />

        {/* Compact toolbar: status + all actions in one strip */}
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm space-y-2">
          {/* Top row: status info + all action buttons */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Status badge */}
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                selectedWeekSummary
                  ? weekStatusStyle[selectedWeekSummary.status]
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {selectedWeekSummary
                ? weekStatusLabel[selectedWeekSummary.status]
                : "לא נבחר שבוע"}
            </span>

            {/* Deadline */}
            <span className="text-xs text-slate-500">
              דדליין: <strong className="text-slate-800">{selectedWeekDeadlineLabel}</strong>
            </span>

            {/* Warning */}
            {selectedWeekSummary?.shiftsCount === 0 ? (
              <span className="text-xs text-amber-700">
                יש להוסיף משמרת לפני פתיחת איסוף.
              </span>
            ) : null}

            {/* Spacer pushes buttons right */}
            <div className="flex-1" />

            {/* All action buttons in one row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowCollectionDeadlineModal(true)}
                disabled={!canOpenCollection || openingCollection}
                className="h-8 px-3 rounded-lg bg-[#1d5c8b] text-white text-xs font-medium hover:bg-[#164e78] disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                {openingCollection ? <LoadingSpinner className="w-3 h-3" /> : null}
                {openingCollection ? "פותח..." : "פתח איסוף"}
              </button>
              <button
                type="button"
                onClick={() => void handleOpenCollectionNow()}
                disabled={!canOpenCollection || openingCollection}
                className="h-8 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 disabled:opacity-40 transition-colors"
              >
                דדליין עכשיו
              </button>

              {selectedWeekSummary?.status === "COLLECTING" && (
                <button
                  type="button"
                  onClick={() => void handleForceLock()}
                  disabled={forceLocking}
                  className="h-8 px-3 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                >
                  {forceLocking ? <LoadingSpinner className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {forceLocking ? "נועל..." : "נעל שבוע"}
                </button>
              )}

              {selectedWeekSummary && (selectedWeekSummary.status === "LOCKED" ||
                selectedWeekSummary.status === "SOLVED" ||
                selectedWeekSummary.status === "PUBLISHED") && (
                <button
                  type="button"
                  onClick={() => void handleSolveWeek()}
                  disabled={solving || isSolverRunning}
                  className="h-8 px-3 rounded-lg bg-[#0f7a82] text-white text-xs font-medium hover:bg-[#0a6169] disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                >
                  {isSolverRunning ? (
                    <LoadingSpinner className="w-3 h-3" />
                  ) : (
                    <BrainCircuit className="w-3 h-3" />
                  )}
                  {solving ? "מתחיל..." : isSolverRunning ? "מחשב..." : "שיבוץ חכם"}
                </button>
              )}

              {selectedWeekSummary && (selectedWeekSummary.status === "SOLVED" ||
                selectedWeekSummary.status === "PUBLISHED") && (
                <Link
                  to="/review"
                  className="h-8 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  סקירה
                </Link>
              )}
            </div>
          </div>

          {/* Solver run status — only shows when active */}
          {activeSolveRun && (
            <div
              className={`rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${
                activeSolveRun.status === "SUCCEEDED"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : activeSolveRun.status === "FAILED"
                    ? "bg-red-50 border border-red-200 text-red-800"
                    : "bg-teal-50 border border-teal-200 text-teal-800"
              }`}
            >
              {(activeSolveRun.status === "QUEUED" || activeSolveRun.status === "RUNNING") && (
                <LoadingSpinner className="w-3.5 h-3.5" />
              )}
              {activeSolveRun.status === "SUCCEEDED" && (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              )}
              {activeSolveRun.status === "FAILED" && (
                <XCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="flex-1">
                {activeSolveRun.status === "QUEUED" && "ממתין להפעלה..."}
                {activeSolveRun.status === "RUNNING" && "מחשב סידור אופטימלי..."}
                {activeSolveRun.status === "SUCCEEDED" && "השיבוץ הושלם — ניתן לסקור ולפרסם."}
                {activeSolveRun.status === "FAILED" &&
                  `נכשל: ${activeSolveRun.errorMessage ?? "שגיאה לא ידועה"}`}
              </span>
              {activeSolveRun.status === "SUCCEEDED" && (
                <Link to="/review" className="font-semibold underline underline-offset-2 shrink-0">
                  לסקירה
                </Link>
              )}
            </div>
          )}
        </section>

        <WeekPickerModal
          isOpen={showWeekModal}
          weeks={weeks}
          selectedWeek={selectedWeek}
          onClose={() => setShowWeekModal(false)}
          onSelectWeekStart={handleSelectWeekStart}
        />

        <DuplicateWeekModal
          isOpen={showDuplicateWeekModal}
          weeks={weeks}
          defaultSourceWeek={selectedWeek}
          defaultTargetWeek={defaultDuplicateTargetWeek}
          onClose={() => setShowDuplicateWeekModal(false)}
          onSubmit={handleDuplicateWeek}
        />

        <CollectionDeadlineModal
          isOpen={showCollectionDeadlineModal}
          weekStart={selectedWeek}
          currentDeadline={selectedWeekSummary?.collectionDeadline ?? null}
          onClose={() => setShowCollectionDeadlineModal(false)}
          onSubmit={openConstraintCollection}
        />


        <ShiftFormModal
          isOpen={isShiftModalOpen}
          mode={shiftModalMode}
          weekStart={selectedWeek}
          initialShiftDate={draftShiftDate}
          shiftToEdit={shiftToEdit}
          onClose={() => setIsShiftModalOpen(false)}
          onSubmit={handleSubmitShift}
        />

        <WeekShiftGrid
          weekStart={selectedWeek}
          weekDates={weekDates}
          shifts={shifts}
          loading={loadingShifts}
          onAddShift={handleAddShift}
          onEditShift={handleEditShift}
          onDeleteShift={handleDeleteShift}
        />

        {!loadingWeeks && weeks.length === 0 && (
          <p className="text-slate-500">
            אין שבועות עדיין. פתח את הקאלנדר ובחר תאריך כדי ליצור שבוע חדש.
          </p>
        )}
      </div>
    </div>
  );
}
