'use strict';

const {
  estimatePlatformTax,
  getTaxYearPeriod
} = require('./taxEstimator');

const SA_TIME_ZONE = 'Africa/Johannesburg';
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Convert a validated calendar day into its next UTC calendar day.
function nextCalendarDate(calendarDate) {
  const midnightUtc = Date.parse(`${calendarDate}T00:00:00.000Z`);
  return new Date(midnightUtc + ONE_DAY_MS).toISOString().slice(0, 10);
}

// South Africa currently observes UTC+02:00 without daylight-saving changes.
function southAfricanMidnight(calendarDate) {
  return new Date(`${calendarDate}T00:00:00+02:00`);
}

// Use the server clock and the same tax-year rules as the calculation service.
function getIncomeReportPeriod(asOf = new Date()) {
  const observation = estimatePlatformTax({
    yearToDatePlatformIncome: 0,
    asOf
  });
  const taxYear = getTaxYearPeriod(observation.taxYear);
  const dayAfterObservation = nextCalendarDate(observation.asOfDate);
  const upperDay = dayAfterObservation < taxYear.endExclusiveDate
    ? dayAfterObservation
    : taxYear.endExclusiveDate;

  return {
    taxYear: taxYear.taxYear,
    label: taxYear.label,
    startDate: taxYear.startDate,
    endDate: taxYear.endDate,
    asOfDate: observation.asOfDate,
    startInstant: southAfricanMidnight(taxYear.startDate),
    endExclusiveInstant: southAfricanMidnight(upperDay)
  };
}

// Round each stored two-decimal transaction amount to integer cents in MongoDB.
function centsAccumulator() {
  return {
    $sum: {
      $round: [
        { $multiply: ['$amount', 100] },
        0
      ]
    }
  };
}

// The existing lifetime total must continue to include all confirmed transactions.
function buildLifetimeIncomePipeline(freelancerId) {
  return [
    {
      $match: {
        freelancer: freelancerId,
        status: 'confirmed'
      }
    },
    {
      $group: {
        _id: null,
        totalCents: centsAccumulator(),
        transactionCount: { $sum: 1 }
      }
    }
  ];
}

// Filter by the Johannesburg tax-year window before grouping by local month.
function buildMonthlyIncomePipeline(freelancerId, period) {
  return [
    {
      $match: {
        freelancer: freelancerId,
        status: 'confirmed',
        createdAt: {
          $gte: period.startInstant,
          $lt: period.endExclusiveInstant
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m',
            date: '$createdAt',
            timezone: SA_TIME_ZONE
          }
        },
        totalCents: centsAccumulator(),
        transactionCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ];
}

function parseTotals(row) {
  if (!row) {
    return { totalCents: 0, transactionCount: 0 };
  }

  if (
    !Number.isSafeInteger(row.totalCents) ||
    row.totalCents < 0 ||
    !Number.isSafeInteger(row.transactionCount) ||
    row.transactionCount < 0
  ) {
    throw new RangeError('Invalid income aggregation result');
  }

  return {
    totalCents: row.totalCents,
    transactionCount: row.transactionCount
  };
}

function addSafeIntegers(left, right) {
  const sum = left + right;

  if (!Number.isSafeInteger(sum)) {
    throw new RangeError('Income aggregation exceeds the supported range');
  }

  return sum;
}

function toRand(cents) {
  return cents / 100;
}

// Always return a full March-to-February series, including zero-income months.
function emptyTaxYearMonths(period) {
  const [startYear, startMonth] = period.startDate
    .split('-')
    .slice(0, 2)
    .map(Number);

  return Array.from({ length: 12 }, (_, index) => {
    const monthOffset = startMonth - 1 + index;
    const year = startYear + Math.floor(monthOffset / 12);
    const monthNumber = (monthOffset % 12) + 1;

    return {
      month: `${year}-${String(monthNumber).padStart(2, '0')}`,
      label: `${MONTH_NAMES[monthNumber - 1]} ${year}`,
      totalCents: 0,
      transactionCount: 0
    };
  });
}

// Construct a safe API response from MongoDB aggregates, never from client totals.
function buildIncomeReport({ lifetimeRows, monthlyRows, period }) {
  if (!Array.isArray(lifetimeRows) || !Array.isArray(monthlyRows)) {
    throw new TypeError('Income aggregation results must be arrays');
  }

  if (lifetimeRows.length > 1) {
    throw new RangeError('Unexpected lifetime income aggregation result');
  }

  const lifetime = parseTotals(lifetimeRows[0]);
  const months = emptyTaxYearMonths(period);
  const monthByKey = new Map(months.map((month) => [month.month, month]));
  const seenMonths = new Set();

  for (const row of monthlyRows) {
    const month = monthByKey.get(row?._id);

    if (!month || seenMonths.has(row._id)) {
      throw new RangeError('Unexpected monthly income aggregation result');
    }

    const totals = parseTotals(row);
    month.totalCents = totals.totalCents;
    month.transactionCount = totals.transactionCount;
    seenMonths.add(row._id);
  }

  const yearToDateCents = months.reduce(
    (total, month) => addSafeIntegers(total, month.totalCents),
    0
  );
  const yearToDateTransactionCount = months.reduce(
    (total, month) => addSafeIntegers(total, month.transactionCount),
    0
  );

  const yearToDateIncome = toRand(yearToDateCents);
  const taxEstimate = estimatePlatformTax({
    yearToDatePlatformIncome: yearToDateIncome,
    taxYear: period.taxYear,
    asOf: period.asOfDate
  });

  return {
    totalIncome: toRand(lifetime.totalCents),
    transactionCount: lifetime.transactionCount,
    taxYear: {
      year: period.taxYear,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      asOfDate: period.asOfDate
    },
    yearToDateIncome,
    yearToDateTransactionCount,
    monthlyIncome: months.map((month) => ({
      month: month.month,
      label: month.label,
      totalIncome: toRand(month.totalCents),
      transactionCount: month.transactionCount
    })),
    taxEstimate
  };
}

module.exports = {
  getIncomeReportPeriod,
  buildLifetimeIncomePipeline,
  buildMonthlyIncomePipeline,
  buildIncomeReport
};
