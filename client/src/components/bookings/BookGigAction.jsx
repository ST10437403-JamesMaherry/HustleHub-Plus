
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/useAuth';
import { formatPrice } from '../gigs/gigFormat';
import { bookingReference, describeBookingError, toSafeBooking } from './bookingFormat';

// A failed response does not prove that the server rolled back a booking.
function outcomeMayBeCommitted(error) {
  const status = error?.status;
  return !Number.isInteger(status) || status < 400 || status === 408 || status >= 500;
}

// Rendered inside GigCard for client accounts only. The API derives price,
// client and freelancer server-side, so only the gig ID is sent.
export default function BookGigAction({ gig }) {
  const { request } = useAuth();
  const [state, setState] = useState({ step: 'idle', error: '', booking: null });
  const pending = useRef(false);

  async function confirmBooking() {
    if (pending.current) return;
    pending.current = true;
    setState({ step: 'submitting', error: '', booking: null });

    try {
      const data = await request('/api/bookings', { method: 'POST', body: { gigId: gig.id } });
      const booking = toSafeBooking(data?.booking);

      // A booking might be committed even if its response is unreadable.
      if (!booking || typeof data?.transaction?.id !== 'string') {
        throw new Error('The booking response could not be verified.');
      }

      setState({ step: 'done', error: '', booking });
    } catch (error) {
      const message = describeBookingError(error);
      if (!message) return;

      if (outcomeMayBeCommitted(error)) {
        setState({
          step: 'verify',
          error: 'The booking result could not be confirmed. Check My bookings before trying again.',
          booking: null
        });
        return;
      }

      setState({
        step: error?.status === 404 ? 'unavailable' : 'confirming',
        error: message,
        booking: null
      });
    } finally {
      pending.current = false;
    }
  }

  if (state.step === 'done') {
    return (
      <div className="booking-done" role="status">
        <p className="booking-done-title">Booking confirmed.</p>
        <p className="booking-note">
          Reference <span className="booking-ref">{bookingReference(state.booking.id)}</span>.
          A simulated payment of {formatPrice(state.booking.amount)} has been recorded.
        </p>
        <Link to="/bookings">View my bookings</Link>
      </div>
    );
  }

  if (state.step === 'verify') {
    return (
      <div className="booking-done" role="alert">
        <p className="booking-done-title">Booking status unconfirmed.</p>
        <p className="booking-note">{state.error}</p>
        <Link to="/bookings">Check My bookings</Link>
      </div>
    );
  }

  if (state.step === 'unavailable') {
    return <p className="field-error" role="alert">{state.error}</p>;
  }

  if (state.step === 'idle') {
    return (
      <button type="button" onClick={() => setState({ step: 'confirming', error: '', booking: null })}>
        Book this gig
      </button>
    );
  }

  const submitting = state.step === 'submitting';

  return (
    <div className="booking-confirm" role="group" aria-label={`Confirm booking ${gig.title}`}>
      <p>Book this gig for <strong>{formatPrice(gig.price)}</strong>?</p>
      <p className="booking-note">Payment is simulated. No card details are collected.</p>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <div className="booking-buttons">
        <button type="button" onClick={confirmBooking} disabled={submitting} autoFocus>
          {submitting ? 'Booking...' : 'Confirm booking'}
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => setState({ step: 'idle', error: '', booking: null })}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
