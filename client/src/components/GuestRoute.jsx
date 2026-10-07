import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import SessionGate from './SessionGate';

const ROLE_HOME = { client: '/gigs', freelancer: '/freelancer/gigs', admin: '/admin' };

// Only in-app paths saved by ProtectedRoute are honoured, so crafted history
// state cannot redirect a freshly signed-in user to another origin.
function safeReturnPath(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) {
    return null;
  }
  return ['/login', '/register'].includes(from) ? null : from;
}

export default function GuestRoute() {
  const { status, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring' || status === 'unavailable') return <SessionGate />;
  if (!isAuthenticated) return <Outlet />;

  const destination = safeReturnPath(location.state?.from) || ROLE_HOME[user.role] || '/gigs';
  return <Navigate to={destination} replace />;
}