import type { ChatMessage } from "../types";

interface MessageBubbleProps {
  message?: ChatMessage;
  typing?: boolean;
}

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

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-[#0f2a44] flex items-center justify-center flex-shrink-0 shadow-sm">
      <span className="text-[9px] font-bold text-white tracking-tight">PL</span>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
      <span className="text-[10px] font-medium text-slate-600">את/ה</span>
    </div>
  );
}

export function MessageBubble({ message, typing = false }: MessageBubbleProps) {
  if (typing) {
    return (
      <div className="flex justify-start items-end gap-2 mb-3">
        <BotAvatar />
        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm max-w-[75%]">
          <div className="typing-indicator">
            <span className="typing-label text-xs text-slate-500">מקליד</span>
            <span className="typing-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!message) return null;

  const isUser = message.sender === "staff";
  const time = formatMessageTime(message.created_at);

  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""} mb-3`}>
      {isUser ? <UserAvatar /> : <BotAvatar />}

      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-[#1d5c8b] text-white rounded-2xl rounded-tl-sm"
              : "bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tr-sm shadow-sm"
          }`}
          dir="auto"
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className={`text-[10px] text-slate-400 mt-1 px-1 ${isUser ? "text-left" : "text-right"}`}>
          {time}
        </p>
      </div>
    </div>
  );
}
