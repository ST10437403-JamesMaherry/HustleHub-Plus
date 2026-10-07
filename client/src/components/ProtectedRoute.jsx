import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import SessionGate from './SessionGate';

export default function ProtectedRoute({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring' || status === 'unavailable') return <SessionGate />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // This controls navigation only; API middleware remains the security boundary.
  if (!roles.includes(user.role)) {
    return (
      <section className="page compact-page">
        <p className="eyebrow">Account access</p>
        <h1>Access denied.</h1>
        <p className="page-description">This page is not available for your account role.</p>
        <Link className="button" to="/gigs">Return to marketplace</Link>
      </section>
    );
  }

  return <Outlet />;
}
