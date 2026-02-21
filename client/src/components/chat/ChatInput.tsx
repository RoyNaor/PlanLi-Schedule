import { useState, useRef, useEffect } from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import { FiSend } from "react-icons/fi";

interface ChatInputProps {
  onSend: (value: string) => Promise<void>;
  sending: boolean;
}

// Captures user text input and triggers send actions from keyboard or button.
export function ChatInput({ onSend, sending }: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = draft.trim().length > 0 && !sending;

  useEffect(() => {
    // Auto-resize textarea to match content while keeping a max height.
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120,
      )}px`;
    }
  }, [draft]);

  return (
    <div className="border-t border-emerald-100 bg-white p-3 sm:p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          const text = draft.trim();
          setDraft("");
          void onSend(text);
        }}
        className="relative mx-auto max-w-4xl"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          dir="rtl"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
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
          placeholder="כתוב את ההודעה שלך..."
          maxLength={500}
          className="
            min-h-[78px] sm:min-h-[96px]
            w-full
            resize-none
            rounded-2xl
            border border-slate-200
            bg-white
            p-4
            pl-16
            text-right text-sm
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
            absolute bottom-3 left-3
            grid h-10 w-10 place-items-center
            rounded-full text-sm text-white shadow-md transition
            ${
              canSubmit
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "cursor-not-allowed bg-slate-300"
            }
          `}
          aria-label="שלח הודעה"
        >
          {sending ? (
            <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" />
          ) : (
            <FiSend className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
}
