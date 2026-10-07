const express = require('express');

const {
  createBooking,
  getMyBookings,
  getFreelancerBookings,
  getBookingById
} = require('../controllers/bookingController');

const {
  protect,
  authorizeRoles
} = require('../middleware/authMiddleware');

const validateBooking = require(
  '../middleware/validateBooking'
);

const router = express.Router();

// Only clients may create marketplace bookings.
router.post(
  '/',
  protect,
  authorizeRoles('client'),
  validateBooking,
  createBooking
);

// Clients may retrieve only their own booking history.
router.get(
  '/mine',
  protect,
  authorizeRoles('client'),
  getMyBookings
);

// Freelancers may retrieve only bookings associated with their account.
router.get(
  '/freelancer',
  protect,
  authorizeRoles('freelancer'),
  getFreelancerBookings
);

// Clients may retrieve an individual booking only when they own it.
router.get(
  '/:id',
  protect,
  authorizeRoles('client'),
  getBookingById
);

module.exports = router;