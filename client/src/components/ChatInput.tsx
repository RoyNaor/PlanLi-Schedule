import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (value: string) => Promise<void>;
  sending: boolean;
}

const SendIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export function ChatInput({ onSend, sending }: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = draft.trim().length > 0 && !sending;

  // Auto resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120,
      )}px`;
    }
  }, [draft]);

  return (
    <div className="border-t border-emerald-100 bg-white p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          const text = draft.trim();
          setDraft("");
          void onSend(text);
        }}
        className="relative max-w-4xl mx-auto"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) {
                const text = draft.trim();
                setDraft("");
                void onSend(text);
              }
            }
          }}
          rows={1}
          placeholder="Type your message..."
          maxLength={500}
          className="
            min-h-[96px]
            w-full
            resize-none
            rounded-2xl
            border border-slate-200
            bg-white
            p-4
            pr-16
            text-sm
            leading-relaxed
            shadow-sm
            transition
            focus:outline-none
            focus:ring-2
            focus:ring-emerald-500
          "
          style={{ maxHeight: "120px" }}
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className={`
            absolute bottom-3 right-3
            grid h-10 w-10 place-items-center
            rounded-full text-sm text-white shadow-md transition
            ${
              canSubmit
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "cursor-not-allowed bg-slate-300"
            }
          `}
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <SendIcon />
          )}
        </button>
      </form>
    </div>
  );
}
