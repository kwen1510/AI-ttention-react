import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import { useAuth } from './AuthContext.jsx';

function getActiveMode(pathname) {
  if (pathname.startsWith('/admin')) return 'summary';
  if (pathname.startsWith('/checkbox')) return 'checkbox';
  if (pathname.startsWith('/prompts')) return 'prompts';
  if (pathname.startsWith('/history') || pathname.startsWith('/data')) return 'history';
  return '';
}

function AppLayout() {
  const location = useLocation();
  const active = getActiveMode(location.pathname);
  const { user } = useAuth();
  const isStudentRoute = location.pathname.startsWith('/student');
  const showModes = !isStudentRoute;
  const showSignOut = Boolean(user) && !isStudentRoute;

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      {!isStudentRoute && (
        <Navbar active={active} showModes={showModes} showSignOut={showSignOut} />
      )}
      <main className="flex-1 w-full overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
