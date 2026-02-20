export type Sender = "staff" | "assistant";

export interface ChatMessage {
  id: string;
  sender: Sender;
  content: string;
  created_at?: string;
}
