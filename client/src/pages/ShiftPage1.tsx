import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { AuthService } from "../services/auth.service";

type WeekSummary = {
  weekStart: string;
  createdAt: string;
  shiftsCount: number;
};

type Shift = {
  id: number;
  weekStart: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
  createdAt: string;
};

const API_BASE = "http://localhost:3000/api";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

const emptyShiftForm = {
  shift_date: "",
  start_time: "08:00",
  end_time: "16:00",
  min_doctors: 1,
  min_nurses: 1,
};

const weekDayLabels = [
  "יום א׳",
  "יום ב׳",
  "יום ג׳",
  "יום ד׳",
  "יום ה׳",
  "יום ו׳",
  "שבת",
];
const calendarWeekDayLabels = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const monthFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const dayNumberFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  timeZone: ISRAEL_TIMEZONE,
});

const israelDatePartsFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ISRAEL_TIMEZONE,
});

function parseIsoDateToUtc(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function formatUtcDateToIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const date = parseIsoDateToUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDateToIso(date);
}

function startOfWeekSundayIso(isoDate: string) {
  const date = parseIsoDateToUtc(isoDate);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return formatUtcDateToIso(date);
}

function getWeekDates(weekStart: string) {
  if (!weekStart) {
    return [] as string[];
  }

  const start = parseIsoDateToUtc(weekStart);
  if (Number.isNaN(start.getTime())) {
    return [] as string[];
  }

  return Array.from({ length: 7 }, (_, index) =>
    addDaysToIsoDate(weekStart, index),
  );
}

function getIsraelTodayIso() {
  const parts = israelDatePartsFormatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return formatUtcDateToIso(new Date());
  }

  return `${year}-${month}-${day}`;
}

export default function ShiftPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [shiftFormData, setShiftFormData] = useState(emptyShiftForm);
  const [monthCursor, setMonthCursor] = useState(() => {
    const israelToday = parseIsoDateToUtc(getIsraelTodayIso());
    return new Date(
      Date.UTC(israelToday.getUTCFullYear(), israelToday.getUTCMonth(), 1),
    );
  });

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const fetchWeeks = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setLoadingWeeks(true);
      const response = await axios.get<{ weeks: WeekSummary[] }>(
        `${API_BASE}/weeks`,
        {
          headers: authHeaders,
        },
      );
      const loadedWeeks = response.data.weeks.map((w) => ({
        ...w,
        weekStart: w.weekStart.slice(0, 10),
      }));
      setWeeks(loadedWeeks);
      setSelectedWeek((currentWeek) => {
        if (!currentWeek) {
          return loadedWeeks[0]?.weekStart ?? "";
        }

        return loadedWeeks.some((week) => week.weekStart === currentWeek)
          ? currentWeek
          : (loadedWeeks[0]?.weekStart ?? "");
      });
    } catch (error: any) {
      console.error("Error loading weeks:", error);
      alert(
        `שגיאה בטעינת השבועות: ${error.response?.data?.error ?? "Unknown error"}`,
      );
    } finally {
      setLoadingWeeks(false);
    }
  }, [authHeaders, token]);

  const fetchShifts = useCallback(async () => {
    if (!token || !selectedWeek) {
      setShifts([]);
      return;
    }

    try {
      setLoadingShifts(true);
      const response = await axios.get<{ shifts: Shift[] }>(
        `${API_BASE}/shifts/week/${selectedWeek}`,
        {
          headers: authHeaders,
        },
      );
      setShifts(response.data.shifts);
    } catch (error: any) {
      console.error("Error loading shifts:", error);
      alert(
        `שגיאה בטעינת המשמרות: ${error.response?.data?.error ?? "Unknown error"}`,
      );
    } finally {
      setLoadingShifts(false);
    }
  }, [authHeaders, selectedWeek, token]);

  useEffect(() => {
    void fetchWeeks();
  }, [fetchWeeks]);

  useEffect(() => {
    void fetchShifts();
  }, [fetchShifts]);

  const handleCreateWeek = useCallback(
    async (weekStart: string) => {
      try {
        await axios.post(
          `${API_BASE}/weeks`,
          { week_start: weekStart },
          { headers: authHeaders },
        );
        await fetchWeeks();
        setSelectedWeek(weekStart);
      } catch (error: any) {
        if (error.response?.status === 409) {
          setSelectedWeek(weekStart);
          await fetchWeeks();
          return;
        }

        console.error("Error creating week:", error);
        alert(
          `שגיאה ביצירת שבוע: ${error.response?.data?.error ?? "Unknown error"}`,
        );
      }
    },
    [authHeaders, fetchWeeks],
  );

  const handleCreateCurrentWeek = async () => {
    const israelToday = getIsraelTodayIso();
    const currentWeekStart = startOfWeekSundayIso(israelToday);
    await handleCreateWeek(currentWeekStart);
  };

  const handleDeleteWeek = async (weekStart: string) => {
    const confirmed = window.confirm("האם למחוק את השבוע וכל המשמרות שבו?");
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE}/weeks/${weekStart}`, {
        headers: authHeaders,
      });
      if (selectedWeek === weekStart) {
        setSelectedWeek("");
      }
      await fetchWeeks();
      await fetchShifts();
    } catch (error: any) {
      console.error("Error deleting week:", error);
      alert(
        `שגיאה במחיקת שבוע: ${error.response?.data?.error ?? "Unknown error"}`,
      );
    }
  };

  const resetShiftForm = () => {
    setShiftFormData(emptyShiftForm);
    setEditingShiftId(null);
    setShowShiftModal(false);
  };

  const openCreateShiftModal = (shiftDate: string) => {
    setEditingShiftId(null);
    setShiftFormData({ ...emptyShiftForm, shift_date: shiftDate });
    setShowShiftModal(true);
  };

  const handleSubmitShift = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedWeek) {
      alert("צריך לבחור או ליצור שבוע לפני הוספת משמרות.");
      return;
    }

    try {
      if (editingShiftId) {
        await axios.put(`${API_BASE}/shifts/${editingShiftId}`, shiftFormData, {
          headers: authHeaders,
        });
      } else {
        await axios.post(
          `${API_BASE}/shifts`,
          {
            ...shiftFormData,
            week_start: selectedWeek,
          },
          { headers: authHeaders },
        );
      }

      resetShiftForm();
      await fetchWeeks();
      await fetchShifts();
    } catch (error: any) {
      console.error("Error saving shift:", error);
      alert(
        `שגיאה בשמירת משמרת: ${error.response?.data?.error ?? "Unknown error"}`,
      );
    }
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShiftId(shift.id);
    setShiftFormData({
      shift_date: shift.shiftDate,
      start_time: shift.startTime,
      end_time: shift.endTime,
      min_doctors: shift.minDoctors,
      min_nurses: shift.minNurses,
    });
    setShowShiftModal(true);
  };

  const handleDeleteShift = async (shiftId: number) => {
    const confirmed = window.confirm("למחוק את המשמרת הזו?");
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE}/shifts/${shiftId}`, {
        headers: authHeaders,
      });
      await fetchWeeks();
      await fetchShifts();
    } catch (error: any) {
      console.error("Error deleting shift:", error);
      alert(
        `שגיאה במחיקת משמרת: ${error.response?.data?.error ?? "Unknown error"}`,
      );
    }
  };

  const weekDates = useMemo(() => getWeekDates(selectedWeek), [selectedWeek]);

  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, Shift[]>();
    shifts.forEach((shift) => {
      const current = grouped.get(shift.shiftDate) ?? [];
      current.push(shift);
      grouped.set(shift.shiftDate, current);
    });

    grouped.forEach((items) => {
      items.sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    return grouped;
  }, [shifts]);

  const selectedWeekRange = useMemo(() => {
    if (weekDates.length !== 7) {
      return "בחר שבוע לתצוגה";
    }

    return `${dateFormatter.format(parseIsoDateToUtc(weekDates[0]))} - ${dateFormatter.format(parseIsoDateToUtc(weekDates[6]))}`;
  }, [weekDates]);

  const selectedWeekIndex = weeks.findIndex(
    (week) => week.weekStart === selectedWeek,
  );

  const monthFirstIso = `${monthCursor.getUTCFullYear()}-${String(monthCursor.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const calendarStartIso = startOfWeekSundayIso(monthFirstIso);
  const calendarDays = Array.from({ length: 35 }, (_, index) =>
    addDaysToIsoDate(calendarStartIso, index),
  );

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;

  const totalShifts = weeks.reduce((sum, week) => sum + week.shiftsCount, 0);

  return (
    <div dir="rtl" className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">ניהול משמרות</h1>
            <p className="text-slate-500 mt-1">
              ניהול שבועות ומשמרות עם הוספה מהירה לכל יום.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCreateCurrentWeek()}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            בחירה בשבוע הנוכחי
          </button>
        </div>

        <section className="bg-white border-2 border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <button
              type="button"
              onClick={() => {
                const previousWeek = weeks[selectedWeekIndex - 1];
                if (previousWeek) setSelectedWeek(previousWeek.weekStart);
              }}
              disabled={selectedWeekIndex <= 0}
              className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center disabled:opacity-40"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowWeekModal(true)}
              className="flex items-center gap-2 text-lg font-semibold text-slate-900"
            >
              <CalendarDays className="w-5 h-5 text-emerald-600" />
              {selectedWeekRange}
            </button>

            <button
              type="button"
              onClick={() => {
                const nextWeek = weeks[selectedWeekIndex + 1];
                if (nextWeek) setSelectedWeek(nextWeek.weekStart);
              }}
              disabled={
                selectedWeekIndex < 0 || selectedWeekIndex >= weeks.length - 1
              }
              className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center disabled:opacity-40"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </section>

        <section className="bg-white border-2 border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b-2 border-slate-800">
            {weekDates.map((isoDate, index) => (
              <div
                key={isoDate}
                className="p-4 text-center border-l border-slate-300 last:border-l-0"
              >
                <p className="text-sm text-slate-600">{weekDayLabels[index]}</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">
                  {dayNumberFormatter.format(parseIsoDateToUtc(isoDate))}
                </p>
              </div>
            ))}
          </div>

          {loadingShifts ? (
            <p className="p-6 text-slate-500">טוען משמרות...</p>
          ) : !selectedWeek ? (
            <p className="p-6 text-slate-500">
              בחר שבוע או צור שבוע חדש כדי להתחיל.
            </p>
          ) : (
            <div className="grid grid-cols-7 min-h-[460px]">
              {weekDates.map((shiftDate) => {
                const dayShifts = shiftsByDate.get(shiftDate) ?? [];

                return (
                  <div
                    key={shiftDate}
                    className="border-l border-slate-300 last:border-l-0 p-3 flex flex-col gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => openCreateShiftModal(shiftDate)}
                      className="w-full border-2 border-dashed border-slate-300 rounded-xl py-2 text-slate-600 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                    >
                      + הוספה
                    </button>

                    <div className="space-y-2">
                      {dayShifts.map((shift) => (
                        <article
                          key={shift.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs space-y-1"
                        >
                          <p className="font-semibold text-slate-800">
                            {shift.startTime} - {shift.endTime}
                          </p>
                          <p className="text-slate-600">
                            רופאים: {shift.minDoctors}
                          </p>
                          <p className="text-slate-600">
                            אחיות: {shift.minNurses}
                          </p>
                          <div className="flex items-center justify-end gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => handleEditShift(shift)}
                              className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700"
                              title="עריכת משמרת"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteShift(shift.id)}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-700"
                              title="מחיקת משמרת"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">רשימת שבועות קיימים</h2>
          {loadingWeeks ? (
            <p className="text-slate-500">טוען שבועות...</p>
          ) : weeks.length === 0 ? (
            <p className="text-slate-500">עדיין לא הוגדרו שבועות.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {weeks.map((week) => (
                <article
                  key={week.weekStart}
                  className={`border rounded-2xl p-4 transition-all ${
                    week.weekStart === selectedWeek
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    className="text-right w-full"
                    onClick={() => setSelectedWeek(week.weekStart)}
                  >
                    <p className="text-sm text-slate-500">שבוע התחלה</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {week.weekStart}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      משמרות: {week.shiftsCount}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteWeek(week.weekStart)}
                    className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-red-700 bg-red-50 hover:bg-red-100"
                  >
                    <Trash2 className="w-4 h-4" />
                    מחק שבוע
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {showShiftModal ? (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center px-4">
          <section className="w-full max-w-xl bg-white rounded-2xl border-2 border-slate-800 shadow-xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900">
                  {editingShiftId ? "עריכת משמרת" : "הוספת משמרת"}
                </h2>
                <p className="text-slate-600 mt-1">
                  {shiftFormData.shift_date
                    ? dateFormatter.format(
                        parseIsoDateToUtc(shiftFormData.shift_date),
                      )
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={resetShiftForm}
                className="text-slate-700 hover:text-slate-900"
                aria-label="סגירת חלון"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitShift} className="mt-6 space-y-4">
              <input
                type="date"
                required
                value={shiftFormData.shift_date}
                onChange={(event) =>
                  setShiftFormData((prev) => ({
                    ...prev,
                    shift_date: event.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    שעת התחלה
                  </label>
                  <input
                    type="time"
                    required
                    value={shiftFormData.start_time}
                    onChange={(event) =>
                      setShiftFormData((prev) => ({
                        ...prev,
                        start_time: event.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    שעת סיום
                  </label>
                  <input
                    type="time"
                    required
                    value={shiftFormData.end_time}
                    onChange={(event) =>
                      setShiftFormData((prev) => ({
                        ...prev,
                        end_time: event.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    מינימום רופאים
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={shiftFormData.min_doctors}
                    onChange={(event) =>
                      setShiftFormData((prev) => ({
                        ...prev,
                        min_doctors: Number(event.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    מינימום אחיות
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={shiftFormData.min_nurses}
                    onChange={(event) =>
                      setShiftFormData((prev) => ({
                        ...prev,
                        min_nurses: Number(event.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetShiftForm}
                  className="px-4 py-3 rounded-xl border border-slate-300 hover:bg-slate-50"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {editingShiftId ? "שמור" : "הוסף משמרת"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showWeekModal ? (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center px-4">
          <section className="w-full max-w-xl bg-white rounded-2xl border-2 border-slate-800 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-3xl font-semibold text-slate-900">
                בחירת שבוע
              </h2>
              <button
                type="button"
                onClick={() => setShowWeekModal(false)}
                className="text-slate-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() =>
                  setMonthCursor(
                    (prev) =>
                      new Date(
                        Date.UTC(
                          prev.getUTCFullYear(),
                          prev.getUTCMonth() - 1,
                          1,
                        ),
                      ),
                  )
                }
                className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <p className="text-lg font-semibold">
                {monthFormatter.format(monthCursor)}
              </p>
              <button
                type="button"
                onClick={() =>
                  setMonthCursor(
                    (prev) =>
                      new Date(
                        Date.UTC(
                          prev.getUTCFullYear(),
                          prev.getUTCMonth() + 1,
                          1,
                        ),
                      ),
                  )
                }
                className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-slate-500 mb-2">
              {calendarWeekDayLabels.map((label) => (
                <p key={label} className="text-sm">
                  {label}
                </p>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((isoDate) => {
                const date = parseIsoDateToUtc(isoDate);
                const weekStart = startOfWeekSundayIso(isoDate);
                const inCurrentMonth =
                  date.getUTCMonth() === monthCursor.getUTCMonth() &&
                  date.getUTCFullYear() === monthCursor.getUTCFullYear();
                const isSelected = selectedWeek === weekStart;

                return (
                  <button
                    key={isoDate}
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const weekExists = weeks.some(
                          (week) => week.weekStart === weekStart,
                        );
                        if (weekExists) {
                          setSelectedWeek(weekStart);
                        } else {
                          await handleCreateWeek(weekStart);
                        }
                        setShowWeekModal(false);
                      })();
                    }}
                    className={`h-11 rounded-lg text-sm font-medium ${
                      isSelected
                        ? "bg-emerald-600 text-white"
                        : inCurrentMonth
                          ? "bg-slate-100 text-slate-900 hover:bg-emerald-100"
                          : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {dayNumberFormatter.format(date)}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
