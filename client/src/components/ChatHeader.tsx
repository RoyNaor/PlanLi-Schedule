interface ChatHeaderProps {
  userId: string;
  onUserIdChange: (value: string) => void;
  onLoadConversation: () => Promise<void>;
  loading: boolean;
}

export function ChatHeader({
  userId,
  onUserIdChange,
  onLoadConversation,
  loading,
}: ChatHeaderProps) {
  return (
    <header className="bg-white border border-emerald-100 rounded-2xl px-4 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs text-emerald-700 tracking-wide uppercase">
          PlanLi AI
        </p>
        <h1 className="text-lg font-semibold text-gray-800">Scheduling Chat</h1>
        <p className="text-sm text-gray-600">Simple, clear, and friendly.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onLoadConversation();
        }}
        className="flex w-full sm:w-auto items-stretch sm:items-center flex-col sm:flex-row gap-2 sm:gap-3"
      >
        <input
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
          placeholder="User ID"
          className="w-full sm:w-80 min-w-0 px-3 py-2 text-sm border border-emerald-200 rounded-lg bg-emerald-50/40 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          type="submit"
          disabled={loading || !userId.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 sm:self-auto"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </form>
    </header>
  );
}
