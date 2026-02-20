import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "staff";

  return (
    <article className={`bubble ${isUser ? "bubble-user" : "bubble-assistant"}`}>
      <p className="bubble-label">{isUser ? "You" : "PlanLi Assistant"}</p>
      <p>{message.content}</p>
    </article>
  );
}
