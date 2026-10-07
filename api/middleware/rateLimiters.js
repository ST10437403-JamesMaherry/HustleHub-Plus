const {
  rateLimit
} = require('express-rate-limit');

const FIFTEEN_MINUTES_MS =
  15 * 60 * 1000;

// Authentication attempts are intentionally restrictive because password
// verification is both sensitive and comparatively expensive.
const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error:
        'Too many authentication attempts. Please try again later.'
    });
  }
});

// Booking creation receives a slightly higher limit while still reducing abuse.
const bookingLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error:
        'Too many booking attempts. Please try again later.'
    });
  }
});

module.exports = {
  authLimiter,
  bookingLimiter
};