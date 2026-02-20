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
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 tracking-wide uppercase">
          Medical Rota • PlanLi AI
        </p>
        <h1 className="text-lg font-semibold text-gray-800">
          Smart Scheduling Chat
        </h1>
        <p className="text-sm text-gray-500">
          Manage constraints and generate optimized shifts.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onLoadConversation();
        }}
        className="flex items-center gap-3"
      >
        <input
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
          placeholder="User ID"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          type="submit"
          disabled={loading || !userId.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition disabled:opacity-50"
        >
          {loading ? "Syncing..." : "Load"}
        </button>
      </form>
    </header>
  );
}
