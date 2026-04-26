import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  firstOfMonthIso,
  getCalendarMonthMatrix,
  getIsoYearFromDate,
  getJerusalemTodayIsoDate,
  getWeekStartsInIsoYear,
  getWeekStartsOverlappingRange,
  lastOfMonthIso,
  parseIsoDateToUtc,
  startOfWeekSundayIso,
} from "../utils/date.utils";
import { chunkArray, countAssignments, FETCH_BATCH, mergeAssignmentsByDate } from "../components/my-schedule/scheduleData";
import { fullDateFormatter, monthYearFormatter, yearLabelFormatter, WEEK_DAY_LABELS } from "../components/my-schedule/formatters";
import type { ScheduleResponse, ViewMode, WeekCache } from "../components/my-schedule/types";

const API_BASE = "http://localhost:3000/api";
const NAV_FLASH_MS = 200;

function addYearsToIsoDate(iso: string, years: number) {
  return addMonthsToIsoDate(iso, years * 12);
}

export function useMySchedule(token: string) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [focusIso, setFocusIso] = useState(() => getJerusalemTodayIsoDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [weekCache, setWeekCache] = useState<WeekCache>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const weekCacheRef = useRef<WeekCache>({});
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  weekCacheRef.current = weekCache;

  const flashThen = useCallback((key: string, navigate: () => void) => {
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    setHighlightKey(key);
    navTimerRef.current = setTimeout(() => {
      navigate();
      setHighlightKey(null);
      navTimerRef.current = null;
    }, NAV_FLASH_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const todayIso = getJerusalemTodayIsoDate();

  const requiredWeekStarts = useMemo((): string[] => {
    if (!focusIso) return [];
    if (viewMode === "week" || viewMode === "day") {
      const w = startOfWeekSundayIso(focusIso);
      return w ? [w] : [];
    }
    if (viewMode === "month") {
      const first = firstOfMonthIso(focusIso);
      const last = lastOfMonthIso(focusIso);
      if (!first || !last) return [];
      return getWeekStartsOverlappingRange(first, last);
    }
    if (viewMode === "year") {
      const y = getIsoYearFromDate(focusIso);
      if (!Number.isFinite(y)) return [];
      return getWeekStartsInIsoYear(y);
    }
    return [];
  }, [viewMode, focusIso]);

  const displayWeekStart = useMemo(
    () => (focusIso ? startOfWeekSundayIso(focusIso) : ""),
    [focusIso],
  );

  const assignmentsByDate = useMemo(
    () => mergeAssignmentsByDate(weekCache, requiredWeekStarts),
    [weekCache, requiredWeekStarts],
  );

  const singleWeekPayload = useMemo(() => {
    if (!displayWeekStart) return null;
    if (viewMode !== "week" && viewMode !== "day") return null;
    const p = weekCache[displayWeekStart];
    return p && p !== null ? p : null;
  }, [weekCache, displayWeekStart, viewMode]);

  useEffect(() => {
    if (!token) return;
    if (requiredWeekStarts.length === 0) {
      setLoading(false);
      return;
    }

    const cache = weekCacheRef.current;
    const missing = requiredWeekStarts.filter((w) => cache[w] === undefined);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");

      try {
        for (const batch of chunkArray(missing, FETCH_BATCH)) {
          if (cancelled) return;
          const results = await Promise.all(
            batch.map(async (weekStart) => {
              try {
                const { data } = await axios.get<ScheduleResponse>(`${API_BASE}/my-schedule`, {
                  params: { week_start: weekStart },
                  headers: authHeaders,
                });
                return { weekStart, data: data.schedule } as const;
              } catch (e: unknown) {
                const st = axios.isAxiosError(e) ? e.response?.status : undefined;
                if (st === 404) return { weekStart, data: null } as const;
                throw e;
              }
            }),
          );
          if (cancelled) return;
          setWeekCache((prev) => {
            const n = { ...prev };
            for (const { weekStart, data } of results) n[weekStart] = data;
            return n;
          });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const message =
          axios.isAxiosError(e) && e.response?.data?.error
            ? String(e.response.data.error)
            : "שגיאה בטעינת הסידור";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, requiredWeekStarts, authHeaders]);

  const allWeeksInRangeNotPublished = useMemo(() => {
    if (requiredWeekStarts.length === 0) return false;
    return requiredWeekStarts.every((w) => weekCache[w] === null);
  }, [requiredWeekStarts, weekCache]);

  const weekDates = useMemo(
    () =>
      displayWeekStart
        ? Array.from({ length: 7 }, (_, i) => addDaysToIsoDate(displayWeekStart, i))
        : [],
    [displayWeekStart],
  );

  const monthYearFromWeek = useMemo(() => {
    const w = viewMode === "day" || viewMode === "week" ? displayWeekStart : null;
    if (!w) return "";
    const d = parseIsoDateToUtc(w);
    if (Number.isNaN(d.getTime())) return "";
    return monthYearFormatter.format(d);
  }, [displayWeekStart, viewMode]);

  const monthLabelNav = useMemo(() => {
    if (viewMode !== "month") return "";
    const f = firstOfMonthIso(focusIso);
    if (!f) return "";
    const d = parseIsoDateToUtc(f);
    if (Number.isNaN(d.getTime())) return "";
    return monthYearFormatter.format(d);
  }, [focusIso, viewMode]);

  const yearLabelNav = useMemo(() => {
    if (viewMode !== "year") return "";
    const d = parseIsoDateToUtc(`${getIsoYearFromDate(focusIso) || 2000}-01-01`);
    if (Number.isNaN(d.getTime())) return "";
    return yearLabelFormatter.format(d);
  }, [focusIso, viewMode]);

  const dayLabelNav = useMemo(() => {
    if (viewMode !== "day") return "";
    const d = parseIsoDateToUtc(focusIso);
    if (Number.isNaN(d.getTime())) return "";
    return fullDateFormatter.format(d);
  }, [focusIso, viewMode]);

  const focusWeekdayLabel = useMemo(() => {
    const d = parseIsoDateToUtc(focusIso);
    return WEEK_DAY_LABELS[Number.isNaN(d.getTime()) ? 0 : d.getUTCDay()];
  }, [focusIso]);

  const centerLabel = useMemo(() => {
    if (viewMode === "day") return dayLabelNav;
    if (viewMode === "week") return monthYearFromWeek;
    if (viewMode === "month") return monthLabelNav;
    if (viewMode === "year") return yearLabelNav;
    return "";
  }, [viewMode, dayLabelNav, monthYearFromWeek, monthLabelNav, yearLabelNav]);

  const onPrev = () => {
    setFocusIso((f) => {
      if (!f) return f;
      if (viewMode === "day") return addDaysToIsoDate(f, -1) || f;
      if (viewMode === "week") {
        const w = startOfWeekSundayIso(f);
        return w ? addDaysToIsoDate(w, -7) : f;
      }
      if (viewMode === "month") return addMonthsToIsoDate(f, -1) || f;
      return addYearsToIsoDate(f, -1) || f;
    });
  };

  const onNext = () => {
    setFocusIso((f) => {
      if (!f) return f;
      if (viewMode === "day") return addDaysToIsoDate(f, 1) || f;
      if (viewMode === "week") {
        const w = startOfWeekSundayIso(f);
        return w ? addDaysToIsoDate(w, 7) : f;
      }
      if (viewMode === "month") return addMonthsToIsoDate(f, 1) || f;
      return addYearsToIsoDate(f, 1) || f;
    });
  };

  const onToday = () => setFocusIso(getJerusalemTodayIsoDate());

  const subtitle = useMemo(() => {
    if (viewMode === "day") return "המשמרות המאושרות שלך ליום הזה.";
    if (viewMode === "week") return "המשמרות המאושרות שלך לשבוע הנבחר.";
    if (viewMode === "month") return "המשמרות המאושרות שלך לחודש הזה.";
    return "המשמרות המאושרות שלך בשנה הזו.";
  }, [viewMode]);

  const yForYear = getIsoYearFromDate(focusIso) || 2000;
  const showEmpty = !loading && !error && allWeeksInRangeNotPublished;
  const totalInView = useMemo(
    () => countAssignments(assignmentsByDate),
    [assignmentsByDate],
  );
  const monthRows = useMemo(
    () => chunkArray(getCalendarMonthMatrix(focusIso), 7),
    [focusIso],
  );

  const goToDay = (iso: string) => {
    if (!iso) return;
    flashThen(`day:${iso}`, () => {
      setViewMode("day");
      setFocusIso(iso);
    });
  };

  const goToMonth = (year: number, month1to12: number) => {
    if (!Number.isInteger(month1to12) || month1to12 < 1 || month1to12 > 12) return;
    const mm = String(month1to12).padStart(2, "0");
    flashThen(`month:${year}-${month1to12}`, () => {
      setFocusIso(`${year}-${mm}-01`);
      setViewMode("month");
    });
  };

  const goToWeek = (weekStartSunday: string) => {
    if (!weekStartSunday) return;
    flashThen(`week:${weekStartSunday}`, () => {
      setFocusIso(weekStartSunday);
      setViewMode("week");
    });
  };

  return {
    viewMode,
    setViewMode,
    focusIso,
    loading,
    error,
    todayIso,
    weekCache,
    requiredWeekStarts,
    highlightKey,
    displayWeekStart,
    assignmentsByDate,
    singleWeekPayload,
    weekDates,
    monthRows,
    yForYear,
    showEmpty,
    totalInView,
    subtitle,
    centerLabel,
    focusWeekdayLabel,
    onPrev,
    onNext,
    onToday,
    goToDay,
    goToMonth,
    goToWeek,
  };
}
