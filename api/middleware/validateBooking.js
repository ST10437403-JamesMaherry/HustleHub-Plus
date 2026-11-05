const mongoose = require('mongoose');

const ALLOWED_BOOKING_FIELDS = [
  'gigId'
];

const REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates the booking body and the request identifier used for replay protection.
 */
const validateBooking = (req, res, next) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      error: 'A booking request is required'
    });
  }

  const fields = Object.keys(body);

  // Reject ownership, price and other fields derived only by the server.
  if (fields.some((field) => !ALLOWED_BOOKING_FIELDS.includes(field))) {
    return res.status(400).json({
      error: 'Booking request contains unsupported fields'
    });
  }

  if (typeof body.gigId !== 'string' || !body.gigId.trim()) {
    return res.status(400).json({
      error: 'Gig ID is required'
    });
  }

  const gigId = body.gigId.trim();

  if (!mongoose.isValidObjectId(gigId)) {
    return res.status(400).json({
      error: 'Invalid gig ID'
    });
  }

  const requestKey = req.headers['idempotency-key'];

  if (typeof requestKey !== 'string' || !REQUEST_KEY_PATTERN.test(requestKey)) {
    return res.status(400).json({
      error: 'A valid UUID v4 Idempotency-Key header is required'
    });
  }

  // A stable, normalised key is compared and indexed with the verified client ID.
  req.bookingRequestKey = requestKey.toLowerCase();
  req.body = { gigId: gigId.toLowerCase() };

  return next();
};

module.exports = validateBooking;
