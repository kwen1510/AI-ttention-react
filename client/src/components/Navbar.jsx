import { useMemo } from 'react';
import {
  BrainCircuit,
  CheckSquare,
  Database,
  FileText,
  GraduationCap,
  LogOut,
  MessageSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

const modeItems = [
  { key: 'summary', path: '/admin', label: 'Summary', icon: MessageSquare },
  { key: 'checkbox', path: '/checkbox', label: 'Checkbox', icon: CheckSquare },
  { key: 'mindmap', path: '/mindmap', label: 'Mindmap', icon: BrainCircuit },
  { key: 'prompts', path: '/prompts', label: 'Prompts', icon: FileText },
  { key: 'data', path: '/data', label: 'Data', icon: Database },
];

function ModeButton({ item, isActive }) {
  const Icon = item.icon;
  const baseClass =
    'mode-btn px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center';
  const className = `${baseClass} ${isActive ? 'bg-slate-100 text-black' : 'text-black hover:bg-slate-100'}`;

  if (isActive) {
    return (
      <button type="button" aria-current="page" className={className}>
        <Icon className="w-4 h-4 mr-2" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  }

  return (
    <Link to={item.path} className={className}>
      <Icon className="w-4 h-4 mr-2" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Navbar({ active = '', showModes = true, showSignOut = true }) {
  const { signOut } = useAuth();

  const modes = useMemo(
    () =>
      modeItems.map((item) => ({
        ...item,
        isActive: item.key === active,
      })),
    [active]
  );

  return (
    <header className="gradient-bg text-black shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center backdrop-blur-sm border border-slate-200">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h1
                className="text-2xl truncate"
                style={{
                  fontFamily: "'Plus Jakarta Sans', Inter, ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  fontSize: '1.8rem',
                }}
              >
                AI(ttention)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {showModes && (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-black/80 hidden sm:inline">Modes:</span>
                <div className="flex bg-white rounded-lg p-1 space-x-1 border border-slate-200 shadow-sm">
                  {modes.map((item) => (
                    <ModeButton key={item.key} item={item} isActive={item.isActive} />
                  ))}
                </div>
              </div>
            )}

            {showSignOut && (
              <button
                type="button"
                onClick={() => signOut()}
                className="bg-white hover:bg-slate-50 text-black px-3 sm:px-4 py-2 rounded-lg transition-colors flex items-center text-sm border border-slate-200 shadow-sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
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
