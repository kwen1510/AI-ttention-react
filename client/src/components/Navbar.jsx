import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare,
  Database,
  FileText,
  GraduationCap,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "./AuthContext.jsx";

const modeItems = [
  { key: "summary", path: "/admin", label: "Summary", icon: MessageSquare },
  { key: "checkbox", path: "/checkbox", label: "Checkbox", icon: CheckSquare },
  { key: "prompts", path: "/prompts", label: "Prompts", icon: FileText },
  { key: "data", path: "/data", label: "Data", icon: Database },
];

function ModeButton({ item, isActive, onNavigate }) {
  const Icon = item.icon;
  const baseClass =
    "mode-btn flex-shrink-0 px-2 sm:px-3 md:px-4 py-2 rounded text-xs sm:text-sm font-medium transition-colors flex items-center justify-center min-h-touch min-w-touch";
  const className = `${baseClass} ${isActive ? "bg-slate-100 text-black" : "text-black hover:bg-slate-100"}`;

  const handleClick = (e) => {
    e.preventDefault();
    onNavigate(item.path);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      className={className}
    >
      <Icon className="w-4 h-4 mr-1 sm:mr-2" />
      <span className="truncate whitespace-nowrap">{item.label}</span>
    </button>
  );
}

function Navbar({ active = "", showModes = true, showSignOut = true }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const handleModeNavigate = (path) => {
    navigate(path);
  };

  const modes = useMemo(
    () =>
      modeItems.map((item) => ({
        ...item,
        isActive: item.key === active,
      })),
    [active],
  );

  return (
    <header className="gradient-bg text-black shadow-xl w-full">
      <div className="max-w-container mx-auto px-4 sm:px-6 md:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4 min-w-0 flex-shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center backdrop-blur-sm border border-slate-200">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h1
                className="truncate text-xl sm:text-2xl md:text-3xl"
                style={{
                  fontFamily:
                    "'Plus Jakarta Sans', Inter, ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                AI(ttention)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 justify-end">
            {showModes && (
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <span className="text-xs md:text-sm text-black/80 hidden md:inline flex-shrink-0">
                  Modes:
                </span>
                <div className="flex bg-white rounded-lg p-1 gap-1 border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide max-w-[calc(100vw-250px)] sm:max-w-none">
                  {modes.map((item) => (
                    <ModeButton
                      key={item.key}
                      item={item}
                      isActive={item.isActive}
                      onNavigate={handleModeNavigate}
                    />
                  ))}
                </div>
              </div>
            )}

            {showSignOut && (
              <button
                type="button"
                onClick={() => signOut()}
                className="flex-shrink-0 bg-white hover:bg-slate-50 text-black px-2 sm:px-3 md:px-4 py-2 rounded-lg transition-colors flex items-center text-xs sm:text-sm border border-slate-200 shadow-sm min-h-touch"
              >
                <LogOut className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden">Exit</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
