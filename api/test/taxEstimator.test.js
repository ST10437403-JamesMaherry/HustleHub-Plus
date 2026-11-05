'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getTaxYearPeriod,
  calculateAnnualTax,
  estimatePlatformTax
} = require('../services/taxEstimator');

test('exposes the correct 2027 South African tax-year boundaries', () => {
  assert.deepEqual(getTaxYearPeriod(), {
    taxYear: 2027,
    label: '2026/27',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    endExclusiveDate: '2027-03-01'
  });
});

test('applies the 2027 under-65 primary rebate and tax-free threshold', () => {
  assert.equal(calculateAnnualTax(0).estimatedAnnualTax, 0);
  assert.equal(calculateAnnualTax(99000).estimatedAnnualTax, 0);
  assert.equal(calculateAnnualTax(100000).estimatedAnnualTax, 180);
});

test('matches the SARS progressive bracket boundaries', () => {
  const cases = [
    [245100, 26298, 18],
    [383100, 62178, 26],
    [530200, 107779, 31],
    [695800, 167395, 36],
    [887000, 241963, 39],
    [1878600, 648519, 41],
    [2000000, 703149, 45]
  ];

  for (const [income, expectedTax, expectedRate] of cases) {
    const result = calculateAnnualTax(income);
    assert.equal(result.estimatedAnnualTax, expectedTax, `income ${income}`);
    assert.equal(result.marginalRatePercent, expectedRate, `rate ${income}`);
  }
});

test('correctly crosses an exact bracket boundary by one cent', () => {
  assert.equal(calculateAnnualTax(245100.01).estimatedAnnualTax, 26298);
  assert.equal(calculateAnnualTax(383100.01).estimatedAnnualTax, 62178);
  assert.equal(calculateAnnualTax(99000.03).estimatedAnnualTax, 0.01);
});

test('applies cumulative 65-plus and 75-plus rebates', () => {
  assert.equal(calculateAnnualTax(153250, { ageBand: 'age65to74' }).estimatedAnnualTax, 0);
  assert.equal(calculateAnnualTax(171300, { ageBand: 'age75plus' }).estimatedAnnualTax, 0);
  assert.equal(calculateAnnualTax(245100, { ageBand: 'age65to74' }).estimatedAnnualTax, 16533);
  assert.equal(calculateAnnualTax(245100, { ageBand: 'age75plus' }).estimatedAnnualTax, 13284);
});

test('rejects invalid money, years and age assumptions', () => {
  for (const amount of [-1, NaN, Infinity, '100', 1.001]) {
    assert.throws(() => calculateAnnualTax(amount), RangeError);
  }

  assert.throws(() => calculateAnnualTax(100, { taxYear: 2026 }), RangeError);
  assert.throws(() => calculateAnnualTax(100, { ageBand: 'unknown' }), RangeError);
});

test('annualises an observed year-to-date amount using inclusive calendar days', () => {
  const result = estimatePlatformTax({
    yearToDatePlatformIncome: 100000,
    asOf: '2026-11-05'
  });

  assert.equal(result.elapsedDays, 250);
  assert.equal(result.taxYearDays, 365);
  assert.equal(result.yearToDatePlatformIncome, 100000);
  assert.equal(result.projectedAnnualPlatformIncome, 146000);
  assert.equal(result.illustrativeAnnualTax, 8460);
});

test('uses the first and last day of the tax year correctly', () => {
  const first = estimatePlatformTax({
    yearToDatePlatformIncome: 100,
    asOf: '2026-03-01'
  });
  assert.equal(first.elapsedDays, 1);
  assert.equal(first.projectedAnnualPlatformIncome, 36500);

  const last = estimatePlatformTax({
    yearToDatePlatformIncome: 100000,
    asOf: '2027-02-28'
  });
  assert.equal(last.elapsedDays, 365);
  assert.equal(last.projectedAnnualPlatformIncome, 100000);
});

test('treats Date instances as Johannesburg calendar dates', () => {
  const estimate = estimatePlatformTax({
    yearToDatePlatformIncome: 0,
    asOf: new Date('2026-02-28T22:30:00.000Z')
  });

  assert.equal(estimate.asOfDate, '2026-03-01');
  assert.equal(estimate.illustrativeAnnualTax, 0);
});

test('does not silently use the wrong tax year or invalid calendar dates', () => {
  const input = (asOf) => estimatePlatformTax({ yearToDatePlatformIncome: 10, asOf });
  for (const asOf of ['2026-02-28', '2027-03-01', '2026-02-30', '2026-04-31']) {
    assert.throws(() => input(asOf), RangeError);
  }
  assert.throws(() => input('05/11/2026'), RangeError);
  assert.throws(() => input(new Date('invalid')), TypeError);
});

test('rejects fractional-cent amounts and keeps rounding deterministic', () => {
  const estimate = estimatePlatformTax({
    yearToDatePlatformIncome: 0.03,
    asOf: '2026-03-02'
  });

  assert.equal(estimate.projectedAnnualPlatformIncome, 5.48);
  assert.equal(estimate.illustrativeAnnualTax, 0);
  assert.throws(() => estimatePlatformTax({
    yearToDatePlatformIncome: 0.001,
    asOf: '2026-11-05'
  }), RangeError);
});
