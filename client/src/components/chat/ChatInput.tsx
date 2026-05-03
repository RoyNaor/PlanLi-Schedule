import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (value: string) => Promise<void>;
  sending: boolean;
}

const QUICK_SENTENCES = [
  {
    label: "מה השיבוצים שלי לשבוע הקרוב?",
    text: "מה השיבוצים שלי לשבוע הקרוב?",
  },
  {
    label: "מה השיבוצים שלי לשבוע הבא?",
    text: "מה השיבוצים שלי לשבוע הבא?",
  },
  {
    label: "אל תשבץ אותי ביום ראשון בערב",
    text: "אל תשבץ אותי ביום ראשון בערב",
  },
  {
    label: "אל תשבץ אותי בימים שני ורביעי",
    text: "אל תשבץ אותי בימים שני ורביעי",
  },
  {
    label: "אני לא יכול/ה לעבוד ביום...",
    text: "אני לא יכול/ה לעבוד ביום ",
  },
  {
    label: "אם אפשר, בלי משמרת לילה השבוע",
    text: "אם אפשר, אל תשבץ אותי במשמרת לילה השבוע",
  },
  {
    label: "יש לי חופשה בתאריך...",
    text: "יש לי חופשה בתאריך ",
  },
  {
    label: "סיימתי, תודה",
    text: "סיימתי, תודה",
  },
];

export function ChatInput({ onSend, sending }: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = draft.trim().length > 0 && !sending;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        100,
      )}px`;
    }
  }, [draft]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const text = draft.trim();
    setDraft("");
    void onSend(text);
  };

  const appendQuickSentence = (sentence: string) => {
    setDraft((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed} ${sentence}` : sentence;
    });
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="max-w-4xl mx-auto" dir="rtl">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {QUICK_SENTENCES.map((sentence) => (
            <button
              key={sentence.label}
              type="button"
              onClick={() => appendQuickSentence(sentence.text)}
              disabled={sending}
              className="flex-shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#1d5c8b]/40 hover:bg-[#ebf4fb] hover:text-[#1d5c8b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sentence.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            dir="rtl"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={1}
            placeholder="כתוב הודעה..."
            maxLength={500}
            className="flex-1 min-h-[40px] max-h-[100px] resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-right leading-snug placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1d5c8b] focus:border-[#1d5c8b] focus:bg-white transition"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
              canSubmit
                ? "bg-[#1d5c8b] text-white hover:bg-[#164e78] shadow-sm"
                : "bg-slate-100 text-slate-300 cursor-not-allowed"
            }`}
            aria-label="שלח הודעה"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
