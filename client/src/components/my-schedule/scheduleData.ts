import type { ScheduleAssignment, WeekCache } from "./types";

export const FETCH_BATCH = 6;

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function mergeAssignmentsByDate(
  cache: WeekCache,
  weekKeys: string[],
): Map<string, ScheduleAssignment[]> {
  const byDate = new Map<string, ScheduleAssignment[]>();
  for (const w of weekKeys) {
    const p = cache[w];
    if (!p) continue;
    for (const a of p.assignments) {
      if (!byDate.has(a.shiftDate)) byDate.set(a.shiftDate, []);
      byDate.get(a.shiftDate)!.push(a);
    }
  }
  return byDate;
}

export function countAssignments(map: Map<string, ScheduleAssignment[]>) {
  let n = 0;
  for (const v of map.values()) n += v.length;
  return n;
}
