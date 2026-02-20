import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
}

const BotIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="4" y="8" width="16" height="12" rx="3" fill="white" />
    <path d="M8 14H10" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M14 14H16"
      stroke="#0f766e"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M12 6V8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="4" r="2" fill="white" />
  </svg>
);

function formatMessageTime(createdAt?: string) {
  if (!createdAt) {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return createdAt;
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "staff";
  const time = formatMessageTime(message.created_at);

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6`}
    >
      <div
        className={`flex items-end gap-2 sm:gap-3 max-w-[95%] sm:max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}
      >
        <div className="flex-shrink-0 mb-5">
          {isUser ? (
            <div className="w-9 h-9 rounded-full border border-emerald-200 bg-white flex items-center justify-center text-[10px] text-emerald-700 font-medium shadow-sm">
              את/ה
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center shadow-sm">
              <BotIcon />
            </div>
          )}
        </div>

        <div
          className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
        >
          <div
            className={`
              px-3.5 sm:px-5 py-3 sm:py-3.5 shadow-sm text-sm
              ${
                isUser
                  ? "bg-emerald-600 text-white rounded-2xl rounded-br-sm"
                  : "bg-emerald-50 border border-emerald-100 text-gray-800 rounded-2xl rounded-bl-sm"
              }
            `}
            dir="auto"
          >
            <p className="leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
          <span className="text-[11px] text-gray-500 mt-1.5 px-1">{time}</span>
        </div>
      </div>
    </div>
  );
}
