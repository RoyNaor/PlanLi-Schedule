import {
  CalendarDays,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  LogIn,
  LogOut,
  MessageCircle,
  ShieldUser,
  X,
} from "lucide-react";

type SidebarProps = {
  open: boolean;
  collapsed: boolean;
  currentPath: string;
  hasSession: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onNavigate: (path: string) => void;
  onAuthAction: () => void;
};

export default function Sidebar({
  open,
  collapsed,
  currentPath,
  hasSession,
  isAdmin,
  onClose,
  onToggleCollapse,
  onNavigate,
  onAuthAction,
}: SidebarProps) {
  const handleNavigate = (path: string) => {
    onNavigate(path);
    onClose();
  };

  const handleAuthAction = () => {
    onAuthAction();
    onClose();
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={onClose}
          aria-label="Close menu"
        />
      ) : null}

      <aside
        className={`sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Sidebar menu"
      >
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="sidebar-logo" aria-hidden="true" />
            <div className="sidebar-brand-text">
              <div className="sidebar-title">PlanLI</div>
              <div className="sidebar-subtitle">Scheduling Assistant</div>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "הרחב סרגל" : "כווץ סרגל"}
            title={collapsed ? "הרחב סרגל" : "כווץ סרגל"}
          >
            {collapsed ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
          </button>

          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-link ${currentPath === "/chat" ? "is-active" : ""}`}
            onClick={() => handleNavigate("/chat")}
            title="צ'אט"
          >
            <MessageCircle size={18} />
            <span>צ'אט</span>
          </button>

          <button
            type="button"
            className={`sidebar-link ${currentPath === "/schedule" ? "is-active" : ""}`}
            onClick={() => handleNavigate("/schedule")}
            title="השיבוץ השבועי שלי"
          >
            <CalendarDays size={18} />
            <span>השיבוץ השבועי שלי </span>
          </button>

          {isAdmin ? (
            <>
              <button
                type="button"
                className={`sidebar-link ${currentPath === "/users" ? "is-active" : ""}`}
                onClick={() => handleNavigate("/users")}
                title="ניהול משתמשים"
              >
                <ShieldUser size={18} />
                <span>ניהול משתמשים</span>
              </button>

              <button
                type="button"
                className={`sidebar-link ${currentPath === "/departments" ? "is-active" : ""}`}
                onClick={() => handleNavigate("/departments")}
                title="ניהול מחלקות"
              >
                <Building2 size={18} />
                <span>ניהול מחלקות</span>
              </button>

              <button
                type="button"
                className={`sidebar-link ${currentPath === "/shifts" ? "is-active" : ""}`}
                onClick={() => handleNavigate("/shifts")}
                title="ניהול משמרות"
              >
                <CalendarDays size={18} />
                <span>ניהול משמרות </span>
              </button>

              <button
                type="button"
                className={`sidebar-link ${currentPath === "/review" ? "is-active" : ""}`}
                onClick={() => handleNavigate("/review")}
                title="מגבלות עובדים"
              >
                <CalendarDays size={18} />
                <span>מגבלות עובדים</span>
              </button>
            </>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-auth"
            onClick={handleAuthAction}
            title={hasSession ? "התנתקות" : "התחברות"}
          >
            {hasSession ? <LogOut size={18} /> : <LogIn size={18} />}
            <span>{hasSession ? "התנתקות" : "התחברות"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
