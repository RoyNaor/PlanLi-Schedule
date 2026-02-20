import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "./types";

interface ConversationResponse {
  conversationId: string;
  messages: ChatMessage[];
}

interface SendMessageResponse {
  conversationId: string;
  assistantText: string;
}

const API_BASE = "http://localhost:3000/api";
const STARTER_MESSAGE: ChatMessage = {
  id: "starter-message",
  sender: "assistant",
  content: `היי 👋 אני כאן כדי לעזור לך עם המשמרות השבועיות
ספר לי מתי אתה לא זמין או אם יש לך העדפות מיוחדות.`,
};

export function ChatBot() {
  const [userId, setUserId] = useState("e39af864-1123-4d84-bdc8-fe7518821efd");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const resetToStarterMessage = () => {
    setMessages([{ ...STARTER_MESSAGE, id: crypto.randomUUID() }]);
  };

  const loadConversation = async () => {
    if (!userId.trim()) return;

    try {
      setLoading(true);
      setError("");
      const response = await axios.get<ConversationResponse>(
        `${API_BASE}/chat/${encodeURIComponent(userId.trim())}`,
      );
      if (!response.data.conversationId) {
        throw new Error("Conversation is unavailable");
      }

      resetToStarterMessage();
    } catch (requestError) {
      const message = axios.isAxiosError(requestError)
        ? (requestError.response?.data?.error ?? requestError.message)
        : "Unable to load conversation";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const sendMessage = async (text: string) => {
    try {
      setSending(true);
      setError("");

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "staff",
        content: text,
      };
      setMessages((prev) => [...prev, userMessage]);

      const response = await axios.post<SendMessageResponse>(
        `${API_BASE}/chat`,
        {
          userId: userId.trim(),
          message: text,
        },
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: "assistant",
          content: response.data.assistantText,
        },
      ]);
    } catch (requestError) {
      const message = axios.isAxiosError(requestError)
        ? (requestError.response?.data?.error ?? requestError.message)
        : "Unable to send message";
      setError(message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="chat-shell">
      <ChatHeader
        userId={userId}
        onUserIdChange={setUserId}
        onLoadConversation={loadConversation}
        loading={loading}
      />

      <section className="chat-card">
        <div className="chat-log">
          {messages.length === 0 ? (
            <p className="empty-state">
              Start chatting to build your schedule.
            </p>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {sending ? <MessageBubble typing /> : null}
          <div ref={bottomRef} />
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <ChatInput onSend={sendMessage} sending={sending} />
      </section>
    </main>
  );
}
