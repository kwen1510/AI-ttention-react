import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import { useAuth } from './AuthContext.jsx';

function getActiveMode(pathname) {
  if (pathname.startsWith('/admin')) return 'summary';
  if (pathname.startsWith('/checkbox')) return 'checkbox';
  if (pathname.startsWith('/mindmap-playground')) return 'mindmap';
  if (pathname.startsWith('/mindmap')) return 'mindmap';
  if (pathname.startsWith('/prompts')) return 'prompts';
  if (pathname.startsWith('/data')) return 'data';
  return '';
}

function AppLayout() {
  const location = useLocation();
  const active = getActiveMode(location.pathname);
  const { user } = useAuth();
  const showModes = !location.pathname.startsWith('/student');
  const showSignOut = Boolean(user) && !location.pathname.startsWith('/student');

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar active={active} showModes={showModes} showSignOut={showSignOut} />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export default AppLayout;
