import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/useAuth';
import ApiStatus from './ApiStatus';

export default function AppShell() {
  const { user, status, error, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="header-top">
          <Link className="brand" to="/gigs" aria-label="HustleHub+ home">HUSTLEHUB<span>+</span></Link>
          <div className="account-actions">
            {user ? (
              <>
                <div className="account-summary">
                  <span>{user.fullName}</span>
                  <span className="muted account-role">{user.role}</span>
                </div>
                <button type="button" className="button-secondary" onClick={handleLogout}>Sign out</button>
              </>
            ) : status === 'restoring' ? (
              <span className="muted">Checking session...</span>
            ) : (
              <>
                <Link to="/login" className="text-link">Sign in</Link>
                <Link to="/register" className="button">Create account</Link>
              </>
            )}
          </div>
        </div>
        <nav className="site-nav" aria-label="Main navigation">
          <NavLink to="/gigs">Marketplace</NavLink>
          {user?.role === 'freelancer' && (
            <>
              <NavLink to="/freelancer/gigs">My gigs</NavLink>
              <NavLink to="/freelancer/dashboard">Dashboard</NavLink>
            </>
          )}
          {user?.role === 'client' && <NavLink to="/bookings">My bookings</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Administration</NavLink>}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {status === 'anonymous' && error && <p className="notice" role="status">{error}</p>}
        <Outlet />
      </main>
      <footer className="site-footer">
        <ApiStatus />
        <div className="footer-line"><span>HustleHub+</span><span>INSY7314 / Part 2</span></div>
      </footer>
    </div>
  );
}
