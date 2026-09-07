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

const router = express.Router();

// Public registration endpoint.
router.post(
  '/register',
  validateRegistration,
  registerUser
);

// Public login endpoint.
router.post(
  '/login',
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