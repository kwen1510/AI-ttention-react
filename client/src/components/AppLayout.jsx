import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import { useAuth } from './AuthContext.jsx';
import { getStagingBasePath } from '../lib/stagingBypass.js';

function getActiveMode(pathname) {
  const normalizedPath = pathname.startsWith('/staging/')
    ? pathname.replace('/staging', '')
    : pathname;

  if (normalizedPath.startsWith('/admin')) return 'summary';
  if (normalizedPath.startsWith('/checkbox')) return 'checkbox';
  if (normalizedPath.startsWith('/prompts')) return 'prompts';
  if (normalizedPath.startsWith('/history') || normalizedPath.startsWith('/data')) return 'history';
  return '';
}

function AppLayout() {
  const location = useLocation();
  const active = getActiveMode(location.pathname);
  const basePath = getStagingBasePath(location.pathname);
  const { user } = useAuth();
  const isStudentRoute = location.pathname.startsWith('/student');
  const showModes = !isStudentRoute;
  const showSignOut = Boolean(user) && !isStudentRoute;

  return (
    <div className="app-shell flex min-h-screen flex-col">
      {!isStudentRoute && (
        <Navbar active={active} basePath={basePath} showModes={showModes} showSignOut={showSignOut} />
      )}
      <main className="app-main flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
