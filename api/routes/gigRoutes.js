const express = require('express');

const {
  getAvailableGigs,
  getGigById,
  getMyGigs,
  createGig,
  updateGig,
  deleteGig
} = require('../controllers/gigController');

const {
  protect,
  authorizeRoles
} = require('../middleware/authMiddleware');

const {
  validateGigCreate,
  validateGigUpdate
} = require('../middleware/validateGig');

const {
  sanitizeFields
} = require('../middleware/sanitizeInput');

const router = express.Router();

// Active marketplace gigs are available for browsing.
router.get(
  '/',
  getAvailableGigs
);

// Freelancers may retrieve all of their own gigs.
router.get(
  '/mine',
  protect,
  authorizeRoles('freelancer'),
  getMyGigs
);

// Only freelancers may create marketplace gigs.
router.post(
  '/',
  protect,
  authorizeRoles('freelancer'),
  sanitizeFields(
    'title',
    'description',
    'category'
  ),
  validateGigCreate,
  createGig
);

// Active marketplace gigs may be viewed individually.
router.get(
  '/:id',
  getGigById
);

// Only the owning freelancer may update a gig.
router.put(
  '/:id',
  protect,
  authorizeRoles('freelancer'),
  sanitizeFields(
    'title',
    'description',
    'category'
  ),
  validateGigUpdate,
  updateGig
);

// Only the owning freelancer may delete a gig.
router.delete(
  '/:id',
  protect,
  authorizeRoles('freelancer'),
  deleteGig
);

module.exports = router;