const mongoose = require('mongoose');

const ALLOWED_BOOKING_FIELDS = [
  'gigId'
];

/**
 * Validates the client booking request before marketplace logic runs.
 */
const validateBooking = (req, res, next) => {
  const body = req.body;

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return res.status(400).json({
      error: 'A booking request is required'
    });
  }

  const fields = Object.keys(body);

  // Reject ownership, price, freelancer, and other unsupported overrides.
  if (
    fields.some(
      (field) => !ALLOWED_BOOKING_FIELDS.includes(field)
    )
  ) {
    return res.status(400).json({
      error: 'Booking request contains unsupported fields'
    });
  }

  if (
    typeof body.gigId !== 'string' ||
    !body.gigId.trim()
  ) {
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

  // Pass only the validated value to the controller.
  req.body = {
    gigId
  };

  return next();
};

module.exports = validateBooking;