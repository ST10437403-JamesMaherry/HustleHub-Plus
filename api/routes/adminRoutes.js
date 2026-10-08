
const express = require('express');

const {
  getAdminUsers,
  getAdminBookings,
  deleteAdminGig
} = require('../controllers/adminController');

const {
  protect,
  authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Apply JWT authentication and admin authorization to every route.
router.use(
  protect,
  authorizeRoles('admin')
);

// Administrators can view safe account information.
router.get(
  '/users',
  getAdminUsers
);

// Administrators can view platform booking records.
router.get(
  '/bookings',
  getAdminBookings
);

// Administrators can remove any marketplace gig.
router.delete(
  '/gigs/:id',
  deleteAdminGig
);

module.exports = router;
