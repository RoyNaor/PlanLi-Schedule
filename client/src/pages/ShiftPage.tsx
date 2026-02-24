import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { AuthService } from "../services/auth.service";

import WeekBar from "../components/shifts/WeekBar";
import WeekPickerModal from "../components/shifts/WeekPickerModal";
import WeekShiftGrid from "../components/shifts/WeekShiftGrid";

import type { WeekSummary, Shift } from "../components/types";
import ShiftFormModal from "../components/shifts/ShiftFormModal";
import {
  getWeekDates,
  parseIsoDateToUtc,
  addDaysToIsoDate,
  normalizeApiDateToIso,
} from "../utils/date.utils";

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

export default function ShiftPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";

  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [loadingWeeks, setLoadingWeeks] = useState(true);

  const [showWeekModal, setShowWeekModal] = useState(false);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalMode, setShiftModalMode] = useState<"create" | "edit">("create");
  const [draftShiftDate, setDraftShiftDate] = useState("");
  const [shiftToEdit, setShiftToEdit] = useState<Shift | null>(null);

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
        return loadedWeeks.some((w) => w.weekStart === current)
          ? current
          : (loadedWeeks[0]?.weekStart ?? "");
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
    void fetchWeeks();
  }, [fetchWeeks]);

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
      minDoctors: number;
      minNurses: number;
    }) => {
      if (!selectedWeek) return;

      const payload = {
        week_start: selectedWeek,
        shift_date: values.shiftDate,
        start_time: values.startTime,
        end_time: values.endTime,
        min_doctors: values.minDoctors,
        min_nurses: values.minNurses,
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
              min_doctors: payload.min_doctors,
              min_nurses: payload.min_nurses,
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
          onPrev={() => navigateWeekByOffset(-7)}
          onNext={() => navigateWeekByOffset(7)}
          onOpenPicker={() => setShowWeekModal(true)}
        />

        <WeekPickerModal
          isOpen={showWeekModal}
          weeks={weeks}
          selectedWeek={selectedWeek}
          onClose={() => setShowWeekModal(false)}
          onSelectWeekStart={handleSelectWeekStart}
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
