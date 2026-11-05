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

// Generate an unpredictable UUID v4 without storing request identifiers server-side.
function createRequestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The booking body contains only the gig ID; the stable key is an HTTP header.
export default function BookGigAction({ gig }) {
  const { request } = useAuth();
  const [state, setState] = useState({ step: 'idle', error: '', booking: null });
  const pending = useRef(false);
  const requestKey = useRef(null);

  async function confirmBooking() {
    if (pending.current) return;
    pending.current = true;
    setState({ step: 'submitting', error: '', booking: null });

    try {
      // A manual retry of this attempt must reuse the same key.
      if (!requestKey.current) requestKey.current = createRequestKey();

      const data = await request('/api/bookings', {
        method: 'POST',
        body: { gigId: gig.id },
        idempotencyKey: requestKey.current
      });
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
          onClick={() => {
            requestKey.current = null;
            setState({ step: 'idle', error: '', booking: null });
          }}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
