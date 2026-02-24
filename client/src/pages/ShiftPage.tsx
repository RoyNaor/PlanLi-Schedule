import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { AuthService } from "../services/auth.service";

import WeekBar from "../components/shifts/WeekBar";
import WeekPickerModal from "../components/shifts/WeekPickerModal";
import WeekShiftGrid from "../components/shifts/WeekShiftGrid";

import type { WeekSummary, Shift } from "../components/types";
import { getWeekDates, parseIsoDateToUtc } from "../utils/date.utils";

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
        weekStart: (w.weekStart ?? "").slice(0, 10),
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

        setShifts(res.data.shifts ?? []);
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

  const selectedWeekIndex = useMemo(
    () => weeks.findIndex((w) => w.weekStart === selectedWeek),
    [weeks, selectedWeek],
  );

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

  const handleAddShift = (shiftDate: string) => {
    alert(`נלחץ הוספה ליום: ${shiftDate}\n(בשלב הבא נחבר מודאל יצירה)`);
  };

  const handleEditShift = (shift: Shift) => {
    alert(`עריכה למשמרת #${shift.id}\n(בשלב הבא נחבר מודאל עריכה)`);
  };

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
          canGoPrev={selectedWeekIndex > 0}
          canGoNext={
            selectedWeekIndex >= 0 && selectedWeekIndex < weeks.length - 1
          }
          onPrev={() => {
            const prev = weeks[selectedWeekIndex - 1];
            if (prev) setSelectedWeek(prev.weekStart);
          }}
          onNext={() => {
            const next = weeks[selectedWeekIndex + 1];
            if (next) setSelectedWeek(next.weekStart);
          }}
          onOpenPicker={() => setShowWeekModal(true)}
        />

        <WeekPickerModal
          isOpen={showWeekModal}
          weeks={weeks}
          selectedWeek={selectedWeek}
          onClose={() => setShowWeekModal(false)}
          onSelectWeekStart={handleSelectWeekStart}
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
