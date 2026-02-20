import axios from "axios";
import { useEffect, useState } from "react";
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

export function ChatBot() {
  const [userId, setUserId] = useState("demo-user-2026");
  const [conversationId, setConversationId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadConversation = async () => {
    if (!userId.trim()) return;

    try {
      setLoading(true);
      setError("");
      const response = await axios.get<ConversationResponse>(
        `${API_BASE}/chat/${encodeURIComponent(userId.trim())}`,
      );
      setConversationId(response.data.conversationId);
      setMessages(response.data.messages);
    } catch (requestError) {
      const message = axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? requestError.message
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

      const response = await axios.post<SendMessageResponse>(`${API_BASE}/chat`, {
        userId: userId.trim(),
        message: text,
      });

      setConversationId(response.data.conversationId);
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
        ? requestError.response?.data?.error ?? requestError.message
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
        <div className="chat-meta">
          <span>Conversation: {conversationId || "Not connected"}</span>
          <span>{messages.length} messages</span>
        </div>

        <div className="chat-log">
          {messages.length === 0 ? (
            <p className="empty-state">
              Start chatting to build your schedule with a futuristic 2026 vibe.
            </p>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <ChatInput onSend={sendMessage} sending={sending} />
      </section>
    </main>
  );
}
