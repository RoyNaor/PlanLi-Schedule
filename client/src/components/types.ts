export type Sender = "staff" | "assistant";

export interface ChatMessage {
  id: string;
  sender: Sender;
  content: string;
  created_at?: string;
}

export type WeekSummary = {
  weekStart: string;   // YYYY-MM-DD
  createdAt: string;
  shiftsCount: number;
};

export type Shift = {
  id: number;
  weekStart: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  minDoctors: number;
  minNurses: number;
  createdAt: string;
};
