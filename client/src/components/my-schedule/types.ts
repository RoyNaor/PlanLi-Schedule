export type ViewMode = "year" | "month" | "week" | "day";

export interface ScheduleVersionSummary {
  id: string;
  weekStart: string;
  runId: string;
  versionNumber: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
}

export interface ScheduleAssignment {
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

export interface SchedulePayload {
  weekStart: string;
  version: ScheduleVersionSummary;
  assignments: ScheduleAssignment[];
}

export interface ScheduleResponse {
  schedule: SchedulePayload;
}

export type WeekCache = Record<string, SchedulePayload | null | undefined>;
