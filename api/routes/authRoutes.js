const express = require('express');

const {
  registerUser,
  loginUser
} = require('../controllers/authController');

const validateRegistration = require(
  '../middleware/validateRegistration'
);

const validateLogin = require(
  '../middleware/validateLogin'
);

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

module.exports = router;