const {
  rateLimit
} = require('express-rate-limit');

const FIFTEEN_MINUTES_MS =
  15 * 60 * 1000;

const ONE_HOUR_MS =
  60 * 60 * 1000;

// Only failed logins count towards the limit: brute-force guessing is the
// threat, so legitimate sign-ins should never lock a user out.
const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error:
        'Too many authentication attempts. Please try again later.'
    });
  }
});

// Registration is limited separately to slow automated account creation.
const registerLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error:
        'Too many registration attempts. Please try again later.'
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
  registerLimiter,
  bookingLimiter
};