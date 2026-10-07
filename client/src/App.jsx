import { Link, Navigate, Route, Routes } from 'react-router';
import AppShell from './components/AppShell';
import GuestRoute from './components/GuestRoute';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GigsPage from './pages/GigsPage';
import FreelancerGigsPage from './pages/FreelancerGigsPage';
import ClientBookingsPage from './pages/ClientBookingsPage';
import FreelancerDashboardPage from './pages/FreelancerDashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/gigs" replace />} />
        <Route path="gigs" element={<GigsPage />} />

        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['freelancer']} />}>
          <Route path="freelancer/gigs" element={<FreelancerGigsPage />} />
          <Route path="freelancer/dashboard" element={<FreelancerDashboardPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['client']} />}>
          <Route path="bookings" element={<ClientBookingsPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin" element={<AdminDashboardPage />} />
        </Route>

        <Route path="*" element={(
          <section className="page compact-page">
            <p className="eyebrow">404 / Page not found</p>
            <h1>Nothing at this address.</h1>
            <p className="page-description">Check the address or return to the marketplace.</p>
            <Link className="button" to="/gigs">Return to marketplace</Link>
          </section>
        )} />
      </Route>
    </Routes>
  );
}
