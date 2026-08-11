import { useCallback, useEffect, useState } from 'react';
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
  if (normalizedPath.startsWith('/async')) return 'async';
  if (normalizedPath.startsWith('/prompts')) return 'prompts';
  if (normalizedPath.startsWith('/history')) return 'history';
  return '';
}

function AppLayout() {
  const location = useLocation();
  const active = getActiveMode(location.pathname);
  const basePath = getStagingBasePath(location.pathname);
  const { user } = useAuth();
  const [liveSessionCode, setLiveSessionCode] = useState(null);
  const isStudentRoute = location.pathname === '/s'
    || location.pathname.startsWith('/student')
    || location.pathname.startsWith('/async/j/');
  const showModes = !isStudentRoute;
  const showSignOut = Boolean(user) && !isStudentRoute;

  const confirmTeacherLeave = useCallback(async () => {
    if (!liveSessionCode) return true;
    if (!window.confirm(
      'A live session is in progress. Leaving will end the session and disconnect all students. Are you sure?'
    )) return false;

    const response = await fetch(`/api/session/${liveSessionCode}/stop`, { method: 'POST' });
    if (!response.ok) {
      window.alert('The session could not be ended. Please try again before leaving.');
      return false;
    }
    setLiveSessionCode(null);
    return true;
  }, [liveSessionCode]);

  useEffect(() => {
    if (!liveSessionCode) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [liveSessionCode]);

  return (
    <div className="app-shell flex min-h-screen flex-col">
      {!isStudentRoute && (
        <Navbar
          active={active}
          basePath={basePath}
          showModes={showModes}
          showSignOut={showSignOut}
          confirmTeacherLeave={confirmTeacherLeave}
        />
      )}
      <main className="app-main flex-1 overflow-x-hidden">
        <Outlet context={{ setLiveSessionCode }} />
      </main>
    </div>
  );
}

export default AppLayout;
