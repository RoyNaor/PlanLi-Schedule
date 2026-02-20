import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
}

// אייקון רובוט פשוט לאווטר של הבוט
const BotIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="4" y="8" width="16" height="12" rx="3" fill="white" />
    <path d="M8 14H10" stroke="#5A4BFF" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M14 14H16"
      stroke="#5A4BFF"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M12 6V8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="4" r="2" fill="white" />
  </svg>
);

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "staff";
  // אם אין זמן מהשרת, נציג זמן דיפולטיבי (מומלץ להעביר מהשרת)
  const time =
    message.created_at ||
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6`}
    >
      <div
        className={`flex items-end gap-3 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}
      >
        {/* Avatar */}
        <div className="flex-shrink-0 mb-5">
          {isUser ? (
            <div className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-[10px] text-gray-600 font-medium shadow-sm">
              You
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#5A4BFF] flex items-center justify-center shadow-sm">
              <BotIcon />
            </div>
          )}
        </div>

        {/* Bubble & Timestamp */}
        <div
          className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
        >
          <div
            className={`
              px-5 py-3.5 shadow-sm text-sm
              ${
                isUser
                  ? "bg-[#00D18B] text-white rounded-2xl rounded-br-sm" // ירוק אמרלד למשתמש
                  : "bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-sm" // לבן לבוט
              }
            `}
            dir="auto" // תומך אוטומטית בעברית/אנגלית לפי הטקסט
          >
            <p className="leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
          <span className="text-[11px] text-gray-400 mt-1.5 px-1">{time}</span>
        </div>
      </div>
    </div>
  );
}
