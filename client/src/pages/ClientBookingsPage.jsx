import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/useAuth';
import GigsStatus from '../components/gigs/GigsStatus';
import { formatDate, formatPrice, toSafeGigs } from '../components/gigs/gigFormat';
import { bookingReference, toSafeBookings } from '../components/bookings/bookingFormat';
import '../components/gigs/gigs.css';
import '../components/bookings/bookings.css';

const STATUS_LABELS = { confirmed: 'Confirmed', cancelled: 'Cancelled', unknown: 'Unknown' };

export default function ClientBookingsPage() {
  const { request } = useAuth();
  const [history, setHistory] = useState({ status: 'loading', bookings: [], error: '' });
  const [attempt, setAttempt] = useState(0);

  // Bookings reference gigs by ID only, so titles are matched against the public
  // listing. Titles are optional: a failed gig request must not hide the history.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    Promise.all([
      request('/api/bookings/mine', { signal }),
      apiRequest('/api/gigs', { signal }).catch(() => null)
    ]).then(([bookingData, gigData]) => {
      const bookings = toSafeBookings(bookingData);
      if (!bookings) throw new Error('The API returned an unexpected response.');

      const gigs = new Map((toSafeGigs(gigData) ?? []).map((gig) => [gig.id, gig]));
      const rows = bookings.map((booking) => ({ ...booking, gig: gigs.get(booking.gigId) ?? null }));
      if (!signal.aborted) setHistory({ status: 'ready', bookings: rows, error: '' });
    }).catch((error) => {
      if (signal.aborted || error?.name === 'AbortError') return;
      setHistory({ status: 'error', bookings: [], error: error.message });
    });

    return () => controller.abort();
  }, [request, attempt]);

  function retry() {
    setHistory({ status: 'loading', bookings: [], error: '' });
    setAttempt((value) => value + 1);
  }

  const confirmed = useMemo(
    () => history.bookings.filter((booking) => booking.status === 'confirmed'),
    [history.bookings]
  );
  const totalSpent = confirmed.reduce((sum, booking) => sum + booking.amount, 0);

  return (
    <section className="page">
      <header className="page-heading">
        <p className="eyebrow">Client</p>
        <h1>Your bookings.</h1>
        <p className="page-description">
          Every booking records a simulated payment. No real money is charged.
        </p>
      </header>

      {history.status === 'loading' && <GigsStatus tone="loading" title="Loading your bookings." />}

      {history.status === 'error' && (
        <GigsStatus tone="error" title="Your bookings could not be loaded." onRetry={retry}>
          {history.error}
        </GigsStatus>
      )}

      {history.status === 'ready' && history.bookings.length === 0 && (
        <GigsStatus tone="empty" title="You have not booked anything yet.">
          Browse the <Link to="/gigs">marketplace</Link> to find a service.
        </GigsStatus>
      )}

      {history.status === 'ready' && history.bookings.length > 0 && (
        <>
          <dl className="bookings-summary">
            <div>
              <dt>Confirmed bookings</dt>
              <dd>{confirmed.length}</dd>
            </div>
            <div>
              <dt>Total spent</dt>
              <dd>{formatPrice(totalSpent)}</dd>
            </div>
          </dl>

          <table className="bookings-table">
            <caption className="visually-hidden">Booking history, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Reference</th>
                <th scope="col">Booked</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {history.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td data-label="Service">
                    {booking.gig ? (
                      <span>
                        <span className="booking-title">{booking.gig.title}</span>
                        <span className="booking-sub">{booking.gig.category}</span>
                      </span>
                    ) : (
                      <span className="booking-missing">Service no longer listed</span>
                    )}
                  </td>
                  <td data-label="Reference"><span className="booking-ref">{bookingReference(booking.id)}</span></td>
                  <td data-label="Booked">{formatDate(booking.createdAt) || '-'}</td>
                  <td data-label="Status">
                    <span className={`booking-status booking-status-${booking.status}`}>
                      {STATUS_LABELS[booking.status]}
                    </span>
                  </td>
                  <td data-label="Amount" className="num">{formatPrice(booking.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}