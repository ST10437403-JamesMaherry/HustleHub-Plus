const express = require('express');

const {
  registerUser,
  loginUser,
  getCurrentUser
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
  authLimiter
} = require('../middleware/rateLimiters');

const {
  sanitizeFields
} = require('../middleware/sanitizeInput');

const router = express.Router();

// Public registration sanitises the user-controlled display name first.
router.post(
  '/register',
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

module.exports = router;