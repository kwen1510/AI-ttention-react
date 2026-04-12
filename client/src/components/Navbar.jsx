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
import { buildModePath } from "../lib/stagingBypass.js";
import { Button } from "./ui/button.jsx";

const modeItems = [
  { key: "summary", path: "/admin", label: "Summary", icon: MessageSquare },
  { key: "checkbox", path: "/checkbox", label: "Checkbox", icon: CheckSquare },
  { key: "prompts", path: "/prompts", label: "Prompts", icon: FileText },
  { key: "history", path: "/history", label: "History", icon: Database },
];

function ModeButton({ item, isActive, onNavigate }) {
  const Icon = item.icon;

  const handleClick = (e) => {
    e.preventDefault();
    onNavigate(item.path);
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "primary" : "ghost"}
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      className={isActive ? "app-nav__item app-nav__item--active shrink-0" : "app-nav__item shrink-0"}
    >
      <Icon className="w-4 h-4 mr-1 sm:mr-2" />
      <span className="truncate whitespace-nowrap">{item.label}</span>
    </Button>
  );
}

function Navbar({ active = "", basePath = "", showModes = true, showSignOut = true }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const handleModeNavigate = (path) => {
    navigate(path);
  };

  const modes = useMemo(
    () =>
      modeItems.map((item) => ({
        ...item,
        path: buildModePath(item.path, basePath),
        isActive: item.key === active,
      })),
    [active, basePath],
  );

  return (
    <header className="app-navbar">
      <div className="app-navbar__inner">
        <div className="app-navbar__brand min-w-0">
          <div className="app-navbar__brand-mark">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="app-navbar__brand-title truncate">AI(ttention)</div>
            <div className="app-navbar__brand-subtitle">Teacher workspace</div>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 lg:w-auto lg:flex-row lg:items-center lg:justify-end">
          {showModes && (
            <nav className="min-w-0 lg:flex-1" aria-label="Teacher sections">
              <div className="app-nav scrollbar-hide overflow-x-auto">
                {modes.map((item) => (
                  <ModeButton
                    key={item.key}
                    item={item}
                    isActive={item.isActive}
                    onNavigate={handleModeNavigate}
                  />
                ))}
              </div>
            </nav>
          )}

          {showSignOut && (
            <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
