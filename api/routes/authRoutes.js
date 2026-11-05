const express = require('express');

const {
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser
} = require('../controllers/authController');

const validateRegistration = require(
  '../middleware/validateRegistration'
);

const validateLogin = require(
  '../middleware/validateLogin'
);

const {
  protect
} = require('../middleware/authMiddleware');

const {
  authLimiter,
  registerLimiter
} = require('../middleware/rateLimiters');

const {
  sanitizeFields
} = require('../middleware/sanitizeInput');

const router = express.Router();

// Registration is rate limited before sanitisation and validation run.
router.post(
  '/register',
  registerLimiter,
  sanitizeFields('fullName'),
  validateRegistration,
  registerUser
);

// Login attempts are rate limited before credential validation.
router.post(
  '/login',
  authLimiter,
  validateLogin,
  loginUser
);

// Protected route for retrieving the authenticated user's account.
router.get(
  '/me',
  protect,
  getCurrentUser
);

// Signing out invalidates all previously issued tokens for the account.
router.post(
  '/logout',
  protect,
  logoutUser
);

module.exports = router;
