'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getIncomeReportPeriod,
  buildLifetimeIncomePipeline,
  buildMonthlyIncomePipeline,
  buildIncomeReport
} = require('../services/incomeAnalytics');

const AS_OF = new Date('2026-11-05T08:00:00.000Z');

function periodOn(date = AS_OF) {
  return getIncomeReportPeriod(date);
}

function reportFrom(lifetimeRows = [], monthlyRows = [], period = periodOn()) {
  return buildIncomeReport({ lifetimeRows, monthlyRows, period });
}

test('uses South African midnight for the beginning and YTD cutoff', () => {
  const period = periodOn();

  assert.equal(period.taxYear, 2027);
  assert.equal(period.label, '2026/27');
  assert.equal(period.asOfDate, '2026-11-05');
  assert.equal(period.startInstant.toISOString(), '2026-02-28T22:00:00.000Z');
  assert.equal(period.endExclusiveInstant.toISOString(), '2026-11-05T22:00:00.000Z');
});

test('uses inclusive local March 1 and February 28 date boundaries', () => {
  const first = periodOn(new Date('2026-02-28T22:00:00.000Z'));
  assert.equal(first.asOfDate, '2026-03-01');
  assert.equal(first.endExclusiveInstant.toISOString(), '2026-03-01T22:00:00.000Z');

  const last = periodOn(new Date('2027-02-28T21:59:59.000Z'));
  assert.equal(last.asOfDate, '2027-02-28');
  assert.equal(last.endExclusiveInstant.toISOString(), '2027-02-28T22:00:00.000Z');

  assert.throws(
    () => periodOn(new Date('2026-02-28T21:59:59.000Z')),
    RangeError
  );
  assert.throws(
    () => periodOn(new Date('2027-02-28T22:00:00.000Z')),
    RangeError
  );
});

test('both pipelines restrict data to the authenticated freelancer and confirmed status', () => {
  const ownerId = { _bsontype: 'ObjectId', value: 'freelancer-owner' };
  const lifetime = buildLifetimeIncomePipeline(ownerId);
  const monthly = buildMonthlyIncomePipeline(ownerId, periodOn());

  assert.strictEqual(lifetime[0].$match.freelancer, ownerId);
  assert.strictEqual(monthly[0].$match.freelancer, ownerId);
  assert.equal(lifetime[0].$match.status, 'confirmed');
  assert.equal(monthly[0].$match.status, 'confirmed');
  assert.equal(lifetime[0].$match.client, undefined);
  assert.equal(monthly[0].$match.client, undefined);

  assert.deepEqual(monthly[0].$match.createdAt, {
    $gte: new Date('2026-02-28T22:00:00.000Z'),
    $lt: new Date('2026-11-05T22:00:00.000Z')
  });
  assert.equal(
    monthly[1].$group._id.$dateToString.timezone,
    'Africa/Johannesburg'
  );
});

test('sums rounded transaction cents in MongoDB instead of adding binary floats', () => {
  const lifetime = buildLifetimeIncomePipeline('owner');
  const monthly = buildMonthlyIncomePipeline('owner', periodOn());

  for (const pipeline of [lifetime, monthly]) {
    assert.deepEqual(pipeline[1].$group.totalCents, {
      $sum: { $round: [{ $multiply: ['$amount', 100] }, 0] }
    });
    assert.deepEqual(pipeline[1].$group.transactionCount, { $sum: 1 });
  }
});

test('preserves lifetime fields and returns zero activity for an empty account', () => {
  const report = reportFrom();

  assert.equal(report.totalIncome, 0);
  assert.equal(report.transactionCount, 0);
  assert.equal(report.yearToDateIncome, 0);
  assert.equal(report.yearToDateTransactionCount, 0);
  assert.equal(report.monthlyIncome.length, 12);
  assert.equal(report.monthlyIncome[0].month, '2026-03');
  assert.equal(report.monthlyIncome[11].month, '2027-02');
  assert.ok(report.monthlyIncome.every((month) => month.totalIncome === 0));
  assert.equal(report.taxEstimate.illustrativeAnnualTax, 0);
});

test('separates lifetime totals from YTD and fills missing chart months', () => {
  const report = reportFrom(
    [{ _id: null, totalCents: 11000000, transactionCount: 3 }],
    [{ _id: '2026-11', totalCents: 10000000, transactionCount: 2 }]
  );

  assert.equal(report.totalIncome, 110000);
  assert.equal(report.transactionCount, 3);
  assert.equal(report.yearToDateIncome, 100000);
  assert.equal(report.yearToDateTransactionCount, 2);
  assert.equal(report.monthlyIncome[8].month, '2026-11');
  assert.equal(report.monthlyIncome[8].totalIncome, 100000);
  assert.equal(report.monthlyIncome[8].transactionCount, 2);
  assert.equal(report.monthlyIncome[0].totalIncome, 0);
  assert.equal(report.taxEstimate.projectedAnnualPlatformIncome, 146000);
  assert.equal(report.taxEstimate.illustrativeAnnualTax, 8460);
});

test('adds exact cents across months without floating-point accumulation', () => {
  const report = reportFrom(
    [{ _id: null, totalCents: 303, transactionCount: 3 }],
    [
      { _id: '2026-03', totalCents: 101, transactionCount: 1 },
      { _id: '2026-04', totalCents: 202, transactionCount: 2 }
    ]
  );

  assert.equal(report.totalIncome, 3.03);
  assert.equal(report.yearToDateIncome, 3.03);
  assert.equal(report.monthlyIncome[0].totalIncome, 1.01);
  assert.equal(report.monthlyIncome[1].totalIncome, 2.02);
  assert.equal(report.yearToDateTransactionCount, 3);
});

test('rejects malformed or duplicate income aggregates', () => {
  assert.throws(() => reportFrom(null, []), TypeError);
  assert.throws(() => reportFrom([], null), TypeError);
  assert.throws(
    () => reportFrom([{ totalCents: 10.5, transactionCount: 1 }]),
    RangeError
  );
  assert.throws(
    () => reportFrom([{ totalCents: 0, transactionCount: -1 }]),
    RangeError
  );
  assert.throws(
    () => reportFrom([], [{ _id: '2027-03', totalCents: 100, transactionCount: 1 }]),
    RangeError
  );
  assert.throws(
    () => reportFrom([], [
      { _id: '2026-03', totalCents: 100, transactionCount: 1 },
      { _id: '2026-03', totalCents: 100, transactionCount: 1 }
    ]),
    RangeError
  );
});

test('protects API response contract and includes an explicit tax disclaimer', () => {
  const report = reportFrom();

  assert.deepEqual(Object.keys(report), [
    'totalIncome', 'transactionCount', 'taxYear', 'yearToDateIncome',
    'yearToDateTransactionCount', 'monthlyIncome', 'taxEstimate'
  ]);
  assert.deepEqual(report.taxYear, {
    year: 2027,
    label: '2026/27',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    asOfDate: '2026-11-05'
  });
  assert.match(report.taxEstimate.disclaimer, /Illustrative only/);
  assert.equal(report.taxEstimate.ageBand, 'under65');
});
