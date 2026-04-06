import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import FullScreenLoader from './FullScreenLoader.jsx';
import { isAllowedTeacherUser } from '../lib/teacherAccess.js';

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, loading, allowedDomains, allowedEmails } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (!isAllowedTeacherUser(user, allowedDomains, allowedEmails)) {
    return <Navigate to="/student?blocked=teacher" replace />;
  }

  return children;
}

export default ProtectedRoute;
