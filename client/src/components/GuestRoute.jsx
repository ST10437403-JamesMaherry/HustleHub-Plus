import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/useAuth';
import SessionGate from './SessionGate';

export default function GuestRoute() {
  const { status, isAuthenticated } = useAuth();

  if (status === 'restoring' || status === 'unavailable') return <SessionGate />;
  return isAuthenticated ? <Navigate to="/gigs" replace /> : <Outlet />;
}
