import { useCallback, useEffect, useMemo, useState } from "react";

type Options = {
  min?: number;
  max?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useStoredNumber(key: string, fallback: number, options: Options = {}) {
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  const initial = useMemo(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return clamp(fallback, min, max);
      const num = Number(raw);
      if (!Number.isFinite(num)) return clamp(fallback, min, max);
      return clamp(num, min, max);
    } catch {
      return clamp(fallback, min, max);
    }
  }, [fallback, key, max, min]);

  const [value, setValue] = useState<number>(initial);

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // ignore storage errors
    }
  }, [key, value]);

  const set = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) return;
      setValue(clamp(next, min, max));
    },
    [max, min],
  );

  return { value, set };
}

