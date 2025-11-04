import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import FullScreenLoader from './FullScreenLoader.jsx';

function isAllowedEmail(email, allowedDomains) {
  if (!email) return false;
  if (!allowedDomains?.length) return true;
  const value = String(email).trim().toLowerCase();
  return allowedDomains.some((domain) => value.endsWith(`@${domain.toLowerCase()}`));
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, loading, allowedDomains } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user || !isAllowedEmail(user.email, allowedDomains)) {
    const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return children;
}

export default ProtectedRoute;
