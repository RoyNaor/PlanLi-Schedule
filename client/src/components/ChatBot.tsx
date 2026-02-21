import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatInput } from "./chat/ChatInput";
import { MessageBubble } from "./chat/MessageBubble";
import type { ChatMessage } from "./types";
import { AuthService, type SessionUser } from "../services/auth.service";

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

// Coordinates chat state, API calls, and rendering of the conversation UI.
export function ChatBot() {
  const storedSession = AuthService.getSession();
  const [sessionUser] = useState<SessionUser | null>(storedSession?.user ?? null);
  const [userId, setUserId] = useState(storedSession?.user.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Resets the UI to the assistant starter message for a fresh conversation view.
  const resetToStarterMessage = () => {
    setMessages([{ ...STARTER_MESSAGE, id: crypto.randomUUID() }]);
  };

  // Build auth headers once from the current session token.
  const authHeaders = storedSession?.jwtToken
    ? {
        Authorization: `Bearer ${storedSession.jwtToken}`,
      }
    : undefined;

  // Loads the selected user's conversation metadata from the backend.
  const loadConversation = async () => {
    if (!userId.trim()) return;

    try {
      setLoading(true);
      setError("");
      const response = await axios.get<ConversationResponse>(
        `${API_BASE}/chat/${encodeURIComponent(userId.trim())}`,
        {
          headers: authHeaders,
        },
      );
      if (!response.data.conversationId) {
        throw new Error("Conversation is unavailable");
      }

      // Start with a clear friendly prompt after a successful load request.
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
    // Always scroll to the latest message after updates.
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  // Sends a user message, then appends assistant output when the request returns.
  const sendMessage = async (text: string) => {
    try {
      setSending(true);
      setError("");

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "staff",
        content: text,
      };
      // Optimistically render the user message for snappy UX.
      setMessages((prev) => [...prev, userMessage]);

      const response = await axios.post<SendMessageResponse>(
        `${API_BASE}/chat`,
        {
          userId: userId.trim(),
          message: text,
        },
        {
          headers: authHeaders,
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
      // Remove the optimistic user message when send fails.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="chat-shell">
      <ChatHeader
        userId={userId}
        displayName={sessionUser?.fullName}
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
