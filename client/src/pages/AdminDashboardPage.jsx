
import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/useAuth';
import { toSafeGigs } from '../components/gigs/gigFormat';
import '../styles/adminDashboard.css';

const moneyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR'
});

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

function emptyCollection() {
  return { status: 'loading', items: [], error: '' };
}

function formatDate(value) {
  const date = new Date(value);

  return value && !Number.isNaN(date.getTime())
    ? dateFormatter.format(date)
    : 'Date unavailable';
}

function shortId(value) {
  return typeof value === 'string'
    ? value.slice(-6).toUpperCase()
    : 'UNKNOWN';
}

function errorMessage(error) {
  if (error?.status === 403) {
    return 'The API denied access to this administrator-only resource.';
  }

  if (error?.status === 401) {
    return 'Your session has ended. Please sign in again.';
  }

  return error instanceof Error
    ? error.message
    : 'Unable to complete the request.';
}

function readUsers(data) {
  if (
    !Array.isArray(data?.users) ||
    !data.users.every((user) => (
      user &&
      typeof user.id === 'string' &&
      typeof user.fullName === 'string' &&
      typeof user.email === 'string' &&
      ['client', 'freelancer', 'admin'].includes(user.role)
    ))
  ) {
    throw new Error('The API returned invalid user data.');
  }

  // Map only approved fields; never render entire database documents.
  return data.users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  }));
}

function readBookings(data) {
  if (
    !Array.isArray(data?.bookings) ||
    !data.bookings.every((booking) => (
      booking &&
      typeof booking.id === 'string' &&
      typeof booking.gig === 'string' &&
      typeof booking.client === 'string' &&
      typeof booking.freelancer === 'string' &&
      typeof booking.status === 'string' &&
      Number.isFinite(booking.amount) &&
      booking.amount >= 0
    ))
  ) {
    throw new Error('The API returned invalid booking data.');
  }

  return data.bookings.map((booking) => ({
    id: booking.id,
    gig: booking.gig,
    client: booking.client,
    freelancer: booking.freelancer,
    amount: booking.amount,
    status: booking.status,
    createdAt: booking.createdAt
  }));
}

function readGigs(data) {
  const gigs = toSafeGigs(data);

  if (!gigs) {
    throw new Error('The API returned invalid gig data.');
  }

  return gigs;
}

async function loadCollection(fetchData, parseData, update, signal) {
  try {
    const result = await fetchData();
    const items = parseData(result);

    if (!signal.aborted) {
      update({
        status: 'ready',
        items,
        error: ''
      });
    }
  } catch (error) {
    if (!signal.aborted) {
      update({
        status: 'error',
        items: [],
        error: errorMessage(error)
      });
    }
  }
}

function DashboardSection({
  id,
  index,
  title,
  state,
  emptyMessage,
  children
}) {
  return (
    <section className="admin-section" aria-labelledby={id}>
      <header className="admin-section-heading">
        <div>
          <p className="eyebrow">{index} / Administration</p>
          <h2 id={id}>{title}</h2>
        </div>

        <span className="admin-count">
          {state.status === 'ready'
            ? `${state.items.length} records`
            : 'Data pending'}
        </span>
      </header>

      {state.status === 'loading' && (
        <p className="admin-state" role="status">
          Loading {title.toLowerCase()}...
        </p>
      )}

      {state.status === 'error' && (
        <p className="admin-state" role="alert">
          {state.error}
        </p>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <p className="admin-state">
          {emptyMessage}
        </p>
      )}

      {state.status === 'ready' &&
        state.items.length > 0 &&
        children}
    </section>
  );
}

export default function AdminDashboardPage() {
  const { request } = useAuth();

  const [users, setUsers] = useState(emptyCollection);
  const [bookings, setBookings] = useState(emptyCollection);
  const [gigs, setGigs] = useState(emptyCollection);

  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmId, setConfirmId] = useState(null);

  const [removal, setRemoval] = useState({
    pendingId: null,
    message: '',
    error: ''
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // Fetch each section independently so one failure cannot hide other data.
    void loadCollection(
      () => request('/api/admin/users', { signal }),
      readUsers,
      setUsers,
      signal
    );

    void loadCollection(
      () => request('/api/admin/bookings', { signal }),
      readBookings,
      setBookings,
      signal
    );

    // Active gigs use the existing public marketplace endpoint.
    void loadCollection(
      () => apiRequest('/api/gigs', { signal }),
      readGigs,
      setGigs,
      signal
    );

    return () => controller.abort();
  }, [request, refreshKey]);

  const isLoading = [users, bookings, gigs].some(
    (item) => item.status === 'loading'
  );

  const userNames = new Map(
    users.items.map((user) => [user.id, user.fullName])
  );

  const gigTitles = new Map(
    gigs.items.map((gig) => [gig.id, gig.title])
  );

  function reload() {
    if (removal.pendingId) return;

    setUsers(emptyCollection());
    setBookings(emptyCollection());
    setGigs(emptyCollection());
    setConfirmId(null);

    setRemoval({
      pendingId: null,
      message: '',
      error: ''
    });

    setRefreshKey((current) => current + 1);
  }

  function askToRemove(gigId) {
    setConfirmId(gigId);

    setRemoval({
      pendingId: null,
      message: '',
      error: ''
    });
  }

  async function removeGig(gig) {
    if (removal.pendingId) return;

    setRemoval({
      pendingId: gig.id,
      message: '',
      error: ''
    });

    try {
      // The protected API decides whether the administrator may delete.
      await request(
        `/api/admin/gigs/${encodeURIComponent(gig.id)}`,
        { method: 'DELETE' }
      );

      setGigs((current) => ({
        ...current,
        items: current.items.filter(
          (item) => item.id !== gig.id
        )
      }));

      setConfirmId(null);

      setRemoval({
        pendingId: null,
        message: `"${gig.title}" was removed successfully.`,
        error: ''
      });
    } catch (error) {
      setRemoval({
        pendingId: null,
        message: '',
        error: errorMessage(error)
      });
    }
  }

  return (
    <section className="page admin-dashboard">
      <header className="page-heading">
        <p className="eyebrow">Restricted workspace</p>

        <h1>Administration.</h1>

        <p className="page-description">
          Review registered users, monitor bookings and manage active
          gigs. Administrative actions are authorised by the API.
        </p>
      </header>

      <div className="admin-toolbar">
        <p className="admin-note">
          Platform overview / Admin access only
        </p>

        <button
          type="button"
          className="button-secondary"
          onClick={reload}
          disabled={isLoading || Boolean(removal.pendingId)}
        >
          {isLoading ? 'Loading...' : 'Refresh data'}
        </button>
      </div>

      <DashboardSection
        id="admin-users-heading"
        index="01"
        title="Users"
        state={users}
        emptyMessage="No user accounts were found."
      >
        <div
          className="admin-table-scroll"
          role="region"
          aria-label="Registered users"
          tabIndex={0}
        >
          <table className="admin-table admin-table-users">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>

            <tbody>
              {users.items.map((user) => (
                <tr key={user.id}>
                  <td className="admin-primary">
                    {user.fullName}
                  </td>

                  <td>{user.email}</td>

                  <td className="admin-capitalize">
                    {user.role}
                  </td>

                  <td>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>

      <DashboardSection
        id="admin-bookings-heading"
        index="02"
        title="Bookings"
        state={bookings}
        emptyMessage="No bookings have been recorded."
      >
        <div
          className="admin-table-scroll"
          role="region"
          aria-label="Platform bookings"
          tabIndex={0}
        >
          <table className="admin-table admin-table-bookings">
            <thead>
              <tr>
                <th scope="col">Booking</th>
                <th scope="col">Client</th>
                <th scope="col">Freelancer</th>
                <th scope="col">Gig</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>

            <tbody>
              {bookings.items.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <span className="admin-primary">
                      #{shortId(booking.id)}
                    </span>

                    <span className="admin-secondary">
                      {formatDate(booking.createdAt)}
                    </span>
                  </td>

                  <td>
                    {userNames.get(booking.client) ||
                      `User #${shortId(booking.client)}`}
                  </td>

                  <td>
                    {userNames.get(booking.freelancer) ||
                      `User #${shortId(booking.freelancer)}`}
                  </td>

                  <td>
                    {gigTitles.get(booking.gig) ||
                      `Gig #${shortId(booking.gig)}`}
                  </td>

                  <td className="admin-nowrap">
                    {moneyFormatter.format(booking.amount)}
                  </td>

                  <td className="admin-capitalize">
                    {booking.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>

      {(removal.message || removal.error) && (
        <p
          className="admin-feedback"
          role={removal.error ? 'alert' : 'status'}
        >
          {removal.error || removal.message}
        </p>
      )}

      <DashboardSection
        id="admin-gigs-heading"
        index="03"
        title="Gig management"
        state={gigs}
        emptyMessage="There are no active gigs to manage."
      >
        <div
          className="admin-table-scroll"
          role="region"
          aria-label="Active gigs"
          tabIndex={0}
        >
          <table className="admin-table admin-table-gigs">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Action</th>
              </tr>
            </thead>

            <tbody>
              {gigs.items.map((gig) => (
                <tr key={gig.id}>
                  <td className="admin-primary">
                    {gig.title}
                  </td>

                  <td>{gig.category}</td>

                  <td className="admin-nowrap">
                    {moneyFormatter.format(gig.price)}
                  </td>

                  <td>
                    {confirmId === gig.id ? (
                      <div className="admin-confirm">
                        <span>Remove permanently?</span>

                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => setConfirmId(null)}
                          disabled={Boolean(removal.pendingId)}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => removeGig(gig)}
                          disabled={Boolean(removal.pendingId)}
                        >
                          {removal.pendingId === gig.id
                            ? 'Removing...'
                            : 'Confirm removal'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => askToRemove(gig.id)}
                        disabled={Boolean(removal.pendingId)}
                        aria-label={`Remove ${gig.title}`}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>
    </section>
  );
}
