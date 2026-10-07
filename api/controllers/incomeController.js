const mongoose = require('mongoose');

const Transaction = require('../models/Transaction');

/**
 * Returns income derived from confirmed transactions belonging to the
 * authenticated freelancer.
 */
const getMyIncome = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.auth.id)) {
      return res.status(401).json({
        error: 'Authenticated user not found'
      });
    }

    const freelancerId = new mongoose.Types.ObjectId(
      req.auth.id
    );

    // Transactions remain the single source of truth for freelancer income.
    const results = await Transaction.aggregate([
      {
        $match: {
          freelancer: freelancerId,
          status: 'confirmed'
        }
      },
      {
        $group: {
          _id: null,
          totalIncome: {
            $sum: '$amount'
          },
          transactionCount: {
            $sum: 1
          }
        }
      }
    ]);

    const summary = results[0];

    const totalIncome = summary
      ? Number(summary.totalIncome.toFixed(2))
      : 0;

    return res.status(200).json({
      totalIncome,
      transactionCount: summary
        ? summary.transactionCount
        : 0
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyIncome
};