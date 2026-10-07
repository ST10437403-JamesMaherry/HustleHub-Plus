const express = require('express');

const {
  getMyIncome
} = require('../controllers/incomeController');

const {
  protect,
  authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Only freelancers may retrieve income derived from their transactions.
router.get(
  '/me',
  protect,
  authorizeRoles('freelancer'),
  getMyIncome
);

module.exports = router;