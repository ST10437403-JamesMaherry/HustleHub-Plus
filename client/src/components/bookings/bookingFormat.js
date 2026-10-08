// Shape checks and messages for /api/bookings responses.

const STATUSES = ['confirmed', 'cancelled'];

export function toSafeBooking(booking) {
  if (
    !booking || typeof booking.id !== 'string' || typeof booking.gig !== 'string' ||
    typeof booking.amount !== 'number' || !Number.isFinite(booking.amount)
  ) {
    return null;
  }

  return {
    id: booking.id,
    gigId: booking.gig,
    amount: booking.amount,
    status: STATUSES.includes(booking.status) ? booking.status : 'unknown',
    createdAt: typeof booking.createdAt === 'string' ? booking.createdAt : null
  };
}

export function toSafeBookings(data) {
  return Array.isArray(data?.bookings) ? data.bookings.map(toSafeBooking).filter(Boolean) : null;
}

// A short, human-readable reference derived from the booking's database ID.
export function bookingReference(id) {
  return `HH-${id.slice(-8).toUpperCase()}`;
}

export function describeBookingError(error) {
  if (error?.name === 'AbortError') return null;

  if (error?.status === 429) {
    const seconds = Number(error.retryAfter);
    const wait = Number.isFinite(seconds) && seconds > 0
      ? `Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.`
      : 'Wait a few minutes before trying again.';
    return `Too many booking attempts. ${wait}`;
  }

  if (error?.status === 404) return 'This gig is no longer available to book.';
  if (error?.status === 403) return 'Only client accounts can book gigs.';
  if (error?.status === 401) return 'Your session ended. Please sign in again.';
  return error?.message || 'The booking could not be completed.';
}