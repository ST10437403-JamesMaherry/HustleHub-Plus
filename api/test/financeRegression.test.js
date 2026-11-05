'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateAnnualTax,
  estimatePlatformTax
} = require('../services/taxEstimator');
const {
  getIncomeReportPeriod,
  buildIncomeReport,
  buildMonthlyIncomePipeline
} = require('../services/incomeAnalytics');

const AS_OF = new Date('2026-11-05T08:00:00.000Z');

function financialReport(lifetimeRows, monthlyRows) {
  return buildIncomeReport({
    lifetimeRows,
    monthlyRows,
    period: getIncomeReportPeriod(AS_OF)
  });
}

test('independently verifies the tax due for R400,000 of assumed taxable income', () => {
  // SARS bracket: R79,998 + 31% of R16,900, less the R17,820 primary rebate.
  const expected = 79998 + (400000 - 383100) * 0.31 - 17820;
  assert.equal(expected, 67417);
  assert.equal(calculateAnnualTax(400000).estimatedAnnualTax, expected);
});

test('independently verifies the tax due for R700,000', () => {
  // SARS bracket: R185,215 + 39% of R4,200, less the R17,820 primary rebate.
  const expected = 185215 + (700000 - 695800) * 0.39 - 17820;
  assert.equal(expected, 169033);
  assert.equal(calculateAnnualTax(700000).estimatedAnnualTax, expected);
});

test('does not produce estimated tax below the age-adjusted tax thresholds', () => {
  assert.equal(calculateAnnualTax(99000).estimatedAnnualTax, 0);
  assert.equal(calculateAnnualTax(100000).estimatedAnnualTax, 180);
  assert.equal(
    calculateAnnualTax(100000, { ageBand: 'age65to74' }).estimatedAnnualTax,
    0
  );
});

test('keeps lifetime income separate from year-to-date confirmed revenue', () => {
  const report = financialReport(
    [{ _id: null, totalCents: 50005, transactionCount: 5 }],
    [
      { _id: '2026-03', totalCents: 999, transactionCount: 1 },
      { _id: '2026-04', totalCents: 1, transactionCount: 1 },
      { _id: '2026-11', totalCents: 10005, transactionCount: 1 }
    ]
  );

  assert.equal(report.totalIncome, 500.05);
  assert.equal(report.transactionCount, 5);
  assert.equal(report.yearToDateIncome, 110.05);
  assert.equal(report.yearToDateTransactionCount, 3);
  assert.equal(report.monthlyIncome[0].totalIncome, 9.99);
  assert.equal(report.monthlyIncome[1].totalIncome, 0.01);
  assert.equal(report.monthlyIncome[8].totalIncome, 100.05);
  assert.equal(report.taxEstimate.illustrativeAnnualTax, 0);
});

test('rejects invalid or unsafe MongoDB aggregate values before producing a report', () => {
  const invalidRows = [
    { _id: null, totalCents: -1, transactionCount: 1 },
    { _id: null, totalCents: Infinity, transactionCount: 1 },
    { _id: null, totalCents: 1.5, transactionCount: 1 },
    { _id: null, totalCents: 1, transactionCount: Number.MAX_SAFE_INTEGER + 1 }
  ];

  for (const row of invalidRows) {
    assert.throws(() => financialReport([row], []), RangeError);
  }
});

test('rejects tax-year aggregation overflow instead of displaying incorrect money', () => {
  assert.throws(() => financialReport(
    [],
    [
      { _id: '2026-03', totalCents: Number.MAX_SAFE_INTEGER, transactionCount: 1 },
      { _id: '2026-04', totalCents: 1, transactionCount: 1 }
    ]
  ), RangeError);
});

test('limits the monthly query to confirmed records before the next local midnight', () => {
  const period = getIncomeReportPeriod(AS_OF);
  const pipeline = buildMonthlyIncomePipeline('verified-freelancer-id', period);

  assert.equal(pipeline[0].$match.freelancer, 'verified-freelancer-id');
  assert.equal(pipeline[0].$match.status, 'confirmed');
  assert.equal(pipeline[0].$match.createdAt.$gte.toISOString(), '2026-02-28T22:00:00.000Z');
  assert.equal(pipeline[0].$match.createdAt.$lt.toISOString(), '2026-11-05T22:00:00.000Z');
  assert.equal(pipeline[1].$group._id.$dateToString.timezone, 'Africa/Johannesburg');
});

test('does not present projected platform income as final personal tax liability', () => {
  const estimate = estimatePlatformTax({
    yearToDatePlatformIncome: 30000,
    asOf: '2026-11-05'
  });

  assert.equal(estimate.yearToDatePlatformIncome, 30000);
  assert.ok(estimate.projectedAnnualPlatformIncome > 30000);
  assert.match(estimate.disclaimer, /Illustrative only/);
  assert.match(estimate.disclaimer, /expenses/);
  assert.match(estimate.disclaimer, /other income/);
});
