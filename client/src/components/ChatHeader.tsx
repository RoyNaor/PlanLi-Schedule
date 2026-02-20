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
    <header className="chat-header">
      <div>
        <p className="eyebrow">PlanLi AI • 2026 Edition</p>
        <h1>Smart Scheduling Chat</h1>
        <p className="subtitle">Grey + Green minimalist interface for schedule planning.</p>
      </div>

      <form
        className="user-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onLoadConversation();
        }}
      >
        <input
          value={userId}
          onChange={(event) => onUserIdChange(event.target.value)}
          placeholder="Enter user id"
          aria-label="User ID"
        />
        <button type="submit" disabled={loading || !userId.trim()}>
          {loading ? "Syncing..." : "Load"}
        </button>
      </form>
    </header>
  );
}
