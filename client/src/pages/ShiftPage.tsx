import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { CalendarDays, Clock3, Pencil, Plus, Trash2, Users } from "lucide-react";
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

const emptyShiftForm = {
  shift_date: "",
  start_time: "08:00",
  end_time: "16:00",
  min_doctors: 1,
  min_nurses: 1,
};

export default function ShiftPage() {
  const session = AuthService.getSession();
  const token = session?.jwtToken ?? "";
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [newWeekStart, setNewWeekStart] = useState("");
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [shiftFormData, setShiftFormData] = useState(emptyShiftForm);

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
      const response = await axios.get<{ weeks: WeekSummary[] }>(`${API_BASE}/weeks`, {
        headers: authHeaders,
      });
      const loadedWeeks = response.data.weeks;
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
      alert(`שגיאה בטעינת השבועות: ${error.response?.data?.error ?? "Unknown error"}`);
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
      alert(`שגיאה בטעינת המשמרות: ${error.response?.data?.error ?? "Unknown error"}`);
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

  const resetShiftForm = () => {
    setShiftFormData(emptyShiftForm);
    setEditingShiftId(null);
    setShowShiftForm(false);
  };

  const handleCreateWeek = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newWeekStart) return;

    try {
      await axios.post(
        `${API_BASE}/weeks`,
        { week_start: newWeekStart },
        { headers: authHeaders },
      );
      setNewWeekStart("");
      await fetchWeeks();
      setSelectedWeek(newWeekStart);
    } catch (error: any) {
      console.error("Error creating week:", error);
      alert(`שגיאה ביצירת שבוע: ${error.response?.data?.error ?? "Unknown error"}`);
    }
  };

  const handleDeleteWeek = async (weekStart: string) => {
    const confirmed = window.confirm("האם למחוק את השבוע וכל המשמרות שלו?");
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE}/weeks/${weekStart}`, { headers: authHeaders });
      if (selectedWeek === weekStart) {
        setSelectedWeek("");
      }
      await fetchWeeks();
    } catch (error: any) {
      console.error("Error deleting week:", error);
      alert(`שגיאה במחיקת שבוע: ${error.response?.data?.error ?? "Unknown error"}`);
    }
  };

  const handleSubmitShift = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedWeek) {
      alert("יש לבחור שבוע קודם.");
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
      alert(`שגיאה בשמירת משמרת: ${error.response?.data?.error ?? "Unknown error"}`);
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
    setShowShiftForm(true);
  };

  const handleDeleteShift = async (shiftId: number) => {
    const confirmed = window.confirm("למחוק את המשמרת הזו?");
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE}/shifts/${shiftId}`, { headers: authHeaders });
      await fetchWeeks();
      await fetchShifts();
    } catch (error: any) {
      console.error("Error deleting shift:", error);
      alert(`שגיאה במחיקת משמרת: ${error.response?.data?.error ?? "Unknown error"}`);
    }
  };

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/chat" replace />;

  const totalShifts = weeks.reduce((sum, week) => sum + week.shiftsCount, 0);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-12 py-6 self-start">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">ניהול שבועות ומשמרות</h1>
            <p className="text-slate-500 mt-1">ניהול מלא של שבועות תכנון ומשמרות צוות.</p>
          </div>

          {!showShiftForm ? (
            <button
              type="button"
              onClick={() => setShowShiftForm(true)}
              className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              הוסף משמרת
            </button>
          ) : null}
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <article className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">שבועות מתוכננים</p>
              <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CalendarDays className="w-5 h-5" />
              </span>
            </div>
            <p className="text-3xl font-semibold text-slate-900 mt-3">{weeks.length}</p>
          </article>

          <article className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">סה״כ משמרות</p>
              <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Clock3 className="w-5 h-5" />
              </span>
            </div>
            <p className="text-3xl font-semibold text-slate-900 mt-3">{totalShifts}</p>
          </article>

          <article className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">שבוע נבחר</p>
              <span className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </span>
            </div>
            <p className="text-lg font-semibold text-slate-900 mt-3">{selectedWeek || "לא נבחר"}</p>
          </article>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">יצירת שבוע חדש</h2>
          <form onSubmit={handleCreateWeek} className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={newWeekStart}
              onChange={(event) => setNewWeekStart(event.target.value)}
              required
              className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
            >
              הוסף שבוע
            </button>
          </form>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">שבועות קיימים</h2>
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
                    <p className="text-lg font-semibold text-slate-900">{week.weekStart}</p>
                    <p className="text-sm text-slate-600 mt-1">משמרות: {week.shiftsCount}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteWeek(week.weekStart)}
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

        {showShiftForm ? (
          <section className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                {editingShiftId ? "עריכת משמרת" : "הוספת משמרת חדשה"}
              </h2>
              <button
                type="button"
                onClick={resetShiftForm}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50"
              >
                ביטול
              </button>
            </div>

            <form
              onSubmit={handleSubmitShift}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
            >
              <input
                type="date"
                required
                value={shiftFormData.shift_date}
                onChange={(event) =>
                  setShiftFormData((prev) => ({ ...prev, shift_date: event.target.value }))
                }
                className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="time"
                required
                value={shiftFormData.start_time}
                onChange={(event) =>
                  setShiftFormData((prev) => ({ ...prev, start_time: event.target.value }))
                }
                className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="time"
                required
                value={shiftFormData.end_time}
                onChange={(event) =>
                  setShiftFormData((prev) => ({ ...prev, end_time: event.target.value }))
                }
                className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
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
                className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="מינ׳ רופאים"
              />
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
                className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="מינ׳ אחיות"
              />
              <button
                type="submit"
                className="md:col-span-2 lg:col-span-5 bg-emerald-600 text-white px-4 py-3 rounded-xl hover:bg-emerald-700 transition-colors"
              >
                {editingShiftId ? "שמור שינויים" : "צור משמרת"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">משמרות לשבוע {selectedWeek || "-"}</h2>
          {loadingShifts ? (
            <p className="text-slate-500">טוען משמרות...</p>
          ) : shifts.length === 0 ? (
            <p className="text-slate-500">אין משמרות לשבוע זה.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-right py-2">תאריך</th>
                    <th className="text-right py-2">שעה</th>
                    <th className="text-right py-2">רופאים</th>
                    <th className="text-right py-2">אחיות</th>
                    <th className="text-right py-2">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => (
                    <tr key={shift.id} className="border-b border-slate-100">
                      <td className="py-3 text-slate-900">{shift.shiftDate}</td>
                      <td className="py-3 text-slate-900">
                        {shift.startTime} - {shift.endTime}
                      </td>
                      <td className="py-3 text-slate-900">{shift.minDoctors}</td>
                      <td className="py-3 text-slate-900">{shift.minNurses}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditShift(shift)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100"
                          >
                            <Pencil className="w-4 h-4" />
                            ערוך
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShift(shift.id)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-red-700 bg-red-50 hover:bg-red-100"
                          >
                            <Trash2 className="w-4 h-4" />
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
