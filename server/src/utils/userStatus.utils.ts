/**
 * Classify constraint `reason` strings into coarse status buckets for department overview.
 * Align keywords with solver BLOCKING_WORKER_STATES in solver/solver_service.py (manual sync).
 */
export type UserStatus = "active" | "sick" | "course" | "vacation" | "leave" | "other";

/** Lower rank = higher priority when merging multiple constraints for one user. */
export const USER_STATUS_RANK: Record<UserStatus, number> = {
  sick: 0,
  course: 1,
  vacation: 2,
  leave: 3,
  other: 4,
  active: 5,
};

/**
 * First matching bucket wins (order: sick → course → vacation → leave).
 * Unknown / empty reasons → `other` (caller treats “no constraint” as active separately).
 */
export function classifyConstraintReason(reason: string | null): Exclude<UserStatus, "active"> {
  if (reason == null || !reason.trim()) {
    return "other";
  }

  const haystack = reason.toLowerCase();

  const sickKeywords = ["חופשת מחלה", "sick_leave", "מחלה", "sick"];
  for (const kw of sickKeywords) {
    if (haystack.includes(kw.toLowerCase())) return "sick";
  }

  const courseKeywords = ["בקורס", "training", "course", "קורס", "הכשרה"];
  for (const kw of courseKeywords) {
    if (haystack.includes(kw.toLowerCase())) return "course";
  }

  const vacationKeywords = ["בחופש", "vacation", "holiday", "חופשה", "חג"];
  for (const kw of vacationKeywords) {
    if (haystack.includes(kw.toLowerCase())) return "vacation";
  }

  const leaveKeywords = ["מילואים", "leave", "חופש"];
  for (const kw of leaveKeywords) {
    if (haystack.includes(kw.toLowerCase())) return "leave";
  }

  return "other";
}

/** Merge multiple reasons into one status; picks most severe non-active bucket, else active. */
export function resolveUserStatusFromReasons(reasons: string[]): UserStatus {
  if (reasons.length === 0) return "active";

  let best: UserStatus = "active";
  let bestRank = USER_STATUS_RANK.active;

  for (const raw of reasons) {
    const classified = classifyConstraintReason(raw);
    const rank = USER_STATUS_RANK[classified];
    if (rank < bestRank) {
      best = classified;
      bestRank = rank;
    }
  }

  return best;
}
