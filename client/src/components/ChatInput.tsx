import { useState } from "react";

interface ChatInputProps {
  onSend: (value: string) => Promise<void>;
  sending: boolean;
}

export function ChatInput({ onSend, sending }: ChatInputProps) {
  const [draft, setDraft] = useState("");

  return (
    <form
      className="chat-input-row"
      onSubmit={(event) => {
        event.preventDefault();
        const text = draft.trim();
        if (!text) return;
        setDraft("");
        void onSend(text);
      }}
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={2}
        placeholder="Tell the assistant your scheduling constraints..."
      />
      <button type="submit" disabled={sending || !draft.trim()}>
        {sending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
