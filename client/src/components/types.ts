export type Sender = "staff" | "assistant";

export interface ChatMessage {
  id: string;
  sender: Sender;
  content: string;
  created_at?: string;
}

export type WeekStatus = "DRAFT" | "COLLECTING" | "LOCKED" | "SOLVED" | "PUBLISHED";

export type WeekSummary = {
  weekStart: string;   // YYYY-MM-DD
  createdAt: string;
  shiftsCount: number;
  status: WeekStatus;
  collectionOpenAt: string | null;
  collectionDeadline: string | null;
  lockedAt: string | null;
};

export type Shift = {
  id: number;
  weekStart?: string;
  monthStart?: string;
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
  arrangementId?: string | null;
  arrangementName?: string | null;
  arrangementCode?: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  label?: string | null;
  assignmentsCount?: number;
  requirements?: MonthlyShiftRequirement[];
  minDoctors: number;
  minNurses: number;
  minMidwives: number;
  minObgyns: number;
  minAnesthesiologists: number;
  minOrderlies: number;
  minPediatricians: number;
  minShabbatScribes: number;
  minSecretaries: number;
  createdAt: string;
};

export type MonthlyShiftRequirement = {
  workerTypeId: string;
  workerTypeCode: string;
  workerTypeName: string;
  count: number;
};

export type WorkerType = {
  id: string;
  code: string;
  name: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
