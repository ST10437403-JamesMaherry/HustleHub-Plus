const mongoose = require('mongoose');

const Transaction = require('../models/Transaction');
const {
  getIncomeReportPeriod,
  buildLifetimeIncomePipeline,
  buildMonthlyIncomePipeline,
  buildIncomeReport
} = require('../services/incomeAnalytics');

// Return confirmed financial activity for the freelancer identified by the JWT.
const getMyIncome = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.auth.id)) {
      return res.status(401).json({
        error: 'Authenticated user not found'
      });
    }

    const freelancerId = new mongoose.Types.ObjectId(req.auth.id);
    const period = getIncomeReportPeriod();

    // Separate lifetime and tax-year queries preserve the existing API totals.
    const [lifetimeRows, monthlyRows] = await Promise.all([
      Transaction.aggregate(buildLifetimeIncomePipeline(freelancerId)),
      Transaction.aggregate(buildMonthlyIncomePipeline(freelancerId, period))
    ]);

    return res.status(200).json(buildIncomeReport({
      lifetimeRows,
      monthlyRows,
      period
    }));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyIncome
};
