
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import '../styles/freelancerDashboard.css';

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR'
});

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : dateFormatter.format(date);
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : 'Unable to load data. Please try again.';
}

export default function FreelancerDashboardPage() {
  const { request } = useAuth();

  const [income, setIncome] = useState({
    loading: true,
    data: null,
    error: ''
  });

  const [bookings, setBookings] = useState({
    loading: true,
    data: [],
    error: ''
  });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // Load income and bookings independently so one failure does not hide
    // successfully retrieved data from the other endpoint.
    async function loadIncome() {
      try {
        const data = await request('/api/income/me', { signal });

        if (
          typeof data?.totalIncome !== 'number' ||
          !Number.isFinite(data.totalIncome) ||
          data.totalIncome < 0 ||
          !Number.isInteger(data.transactionCount) ||
          data.transactionCount < 0
        ) {
          throw new Error('The API returned invalid income data.');
        }

        if (!signal.aborted) {
          setIncome({
            loading: false,
            data,
            error: ''
          });
        }
      } catch (error) {
        if (!signal.aborted) {
          setIncome({
            loading: false,
            data: null,
            error: getErrorMessage(error)
          });
        }
      }
    }

    async function loadBookings() {
      try {
        const data = await request('/api/bookings/freelancer', {
          signal
        });

        if (
          !Array.isArray(data?.bookings) ||
          !data.bookings.every(
            (booking) =>
              booking &&
              typeof booking.id === 'string' &&
              typeof booking.amount === 'number' &&
              Number.isFinite(booking.amount) &&
              typeof booking.status === 'string'
          )
        ) {
          throw new Error('The API returned invalid booking data.');
        }

        // The backend returns newest bookings first.
        if (!signal.aborted) {
          setBookings({
            loading: false,
            data: data.bookings.slice(0, 5),
            error: ''
          });
        }
      } catch (error) {
        if (!signal.aborted) {
          setBookings({
            loading: false,
            data: [],
            error: getErrorMessage(error)
          });
        }
      }
    }

    loadIncome();
    loadBookings();

    // Cancel obsolete requests on refresh, logout or page navigation.
    return () => controller.abort();
  }, [request, refreshKey]);

  function handleRefresh() {
    setIncome({
      loading: true,
      data: null,
      error: ''
    });

    setBookings({
      loading: true,
      data: [],
      error: ''
    });

    setRefreshKey((current) => current + 1);
  }

  const isLoading = income.loading || bookings.loading;

  return (
    <section className="page freelancer-dashboard">
      <header className="page-heading">
        <p className="eyebrow">Freelancer workspace</p>
        <h1>Bookings and income.</h1>
        <p className="page-description">
          An overview of your confirmed transactions and recent
          client bookings. All information is retrieved from your
          HustleHub+ account.
        </p>
      </header>

      <div className="fd-toolbar">
        <p className="fd-caption">Your account overview</p>

        <button
          type="button"
          className="button-secondary"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh data'}
        </button>
      </div>

      <section
        className="fd-summary"
        aria-label="Freelancer income summary"
      >
        <article className="fd-metric">
          <p className="fd-metric-label">Total income</p>

          <p className="fd-metric-value">
            {income.loading
              ? 'Loading...'
              : income.error
                ? '—'
                : currencyFormatter.format(income.data.totalIncome)}
          </p>

          <p className="fd-metric-description">
            Confirmed simulated transactions
          </p>
        </article>

        <article className="fd-metric">
          <p className="fd-metric-label">Transaction count</p>

          <p className="fd-metric-value">
            {income.loading
              ? 'Loading...'
              : income.error
                ? '—'
                : income.data.transactionCount}
          </p>

          <p className="fd-metric-description">
            Total confirmed transactions
          </p>
        </article>
      </section>

      {income.error && (
        <p className="fd-error" role="alert">
          Income could not be loaded. {income.error}
        </p>
      )}

      <section
        className="fd-bookings"
        aria-labelledby="fd-bookings-title"
      >
        <div className="fd-section-heading">
          <div>
            <p className="eyebrow">Booking activity</p>
            <h2 id="fd-bookings-title">Recent bookings</h2>
          </div>

          <p className="fd-caption">Latest 5</p>
        </div>

        {bookings.loading ? (
          <div className="fd-empty" role="status">
            Loading your bookings...
          </div>
        ) : bookings.error ? (
          <div className="fd-error" role="alert">
            Bookings could not be loaded. {bookings.error}
          </div>
        ) : bookings.data.length === 0 ? (
          <div className="fd-empty">
            <p>No bookings yet.</p>
            <p>
              Bookings will appear here when clients book your gigs.
            </p>
          </div>
        ) : (
          <ul className="fd-booking-list">
            {bookings.data.map((booking) => (
              <li className="fd-booking" key={booking.id}>
                <div className="fd-booking-main">
                  <span className="fd-booking-reference">
                    Booking #{booking.id.slice(-6).toUpperCase()}
                  </span>

                  <span className="fd-booking-date">
                    {formatDate(booking.createdAt)}
                  </span>
                </div>

                <div className="fd-booking-meta">
                  <span className="fd-booking-status">
                    {booking.status}
                  </span>

                  <span className="fd-booking-amount">
                    {currencyFormatter.format(booking.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
