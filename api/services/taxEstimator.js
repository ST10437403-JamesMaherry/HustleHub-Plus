'use strict';

// SARS individual income-tax rules for 1 March 2026 to 28 February 2027.
const TAX_RULES = Object.freeze({
  2027: Object.freeze({
    taxYear: 2027,
    label: '2026/27',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    endExclusiveDate: '2027-03-01',
    brackets: Object.freeze([
      Object.freeze({ above: 0, baseTax: 0, ratePercent: 18 }),
      Object.freeze({ above: 245100, baseTax: 44118, ratePercent: 26 }),
      Object.freeze({ above: 383100, baseTax: 79998, ratePercent: 31 }),
      Object.freeze({ above: 530200, baseTax: 125599, ratePercent: 36 }),
      Object.freeze({ above: 695800, baseTax: 185215, ratePercent: 39 }),
      Object.freeze({ above: 887000, baseTax: 259783, ratePercent: 41 }),
      Object.freeze({ above: 1878600, baseTax: 666339, ratePercent: 45 })
    ]),
    rebates: Object.freeze({
      under65: 17820,
      age65to74: 27585,
      age75plus: 30834
    }),
    thresholds: Object.freeze({
      under65: 99000,
      age65to74: 153250,
      age75plus: 171300
    })
  })
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

// Convert amounts to safe integer cents, tolerating only floating-point noise.
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Income must be a finite, non-negative ZAR amount');
  }

  const scaled = amount * 100;
  const rounded = Math.round(scaled);

  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError('Income must use cents and fit the supported range');
  }

  return rounded;
}

function fromCents(cents) {
  if (cents > MAX_SAFE_CENTS) {
    throw new RangeError('Calculated amount exceeds the supported range');
  }

  return Number(cents) / 100;
}

function getTaxRules(taxYear = 2027) {
  const rules = TAX_RULES[taxYear];

  if (!Number.isInteger(taxYear) || !rules) {
    throw new RangeError(`Unsupported SARS tax year: ${taxYear}`);
  }

  return rules;
}

// Interpret Date objects in the South African calendar, not the server timezone.
function toSouthAfricanDate(asOf) {
  if (typeof asOf === 'string') {
    if (!DATE_PATTERN.test(asOf)) {
      throw new RangeError('asOf must be a YYYY-MM-DD calendar date');
    }
    return asOf;
  }

  if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
    throw new TypeError('asOf must be a valid Date or YYYY-MM-DD string');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(asOf);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));

  return `${value.year}-${value.month}-${value.day}`;
}

function utcMidnight(calendarDate) {
  const timestamp = Date.parse(`${calendarDate}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== calendarDate) {
    throw new RangeError('asOf must be a valid calendar date');
  }

  return timestamp;
}

// Return safe boundaries that the income aggregator can use in P3-02.
function getTaxYearPeriod(taxYear = 2027) {
  const rules = getTaxRules(taxYear);
  return Object.freeze({
    taxYear: rules.taxYear,
    label: rules.label,
    startDate: rules.startDate,
    endDate: rules.endDate,
    endExclusiveDate: rules.endExclusiveDate
  });
}

// Calculate an illustrative annual individual tax using 2027 SARS brackets.
function calculateAnnualTax(assumedTaxableIncome, options = {}) {
  const { taxYear = 2027, ageBand = 'under65' } = options;
  const rules = getTaxRules(taxYear);

  if (!Object.hasOwn(rules.rebates, ageBand)) {
    throw new RangeError('Unsupported age band');
  }

  const incomeCents = toCents(assumedTaxableIncome);
  const bracket = [...rules.brackets].reverse().find(
    ({ above }) => above === 0 || incomeCents > above * 100
  );

  // Use integer arithmetic so bracket and rebate calculations round to cents.
  const marginalCents = BigInt(incomeCents - bracket.above * 100);
  const marginalTaxCents = (marginalCents * BigInt(bracket.ratePercent) + 50n) / 100n;
  const grossTaxCents = BigInt(bracket.baseTax) * 100n + marginalTaxCents;
  const rebateCents = BigInt(rules.rebates[ageBand]) * 100n;
  const netTaxCents = grossTaxCents > rebateCents ? grossTaxCents - rebateCents : 0n;

  return Object.freeze({
    taxYear,
    ageBand,
    assumedTaxableIncome: fromCents(BigInt(incomeCents)),
    grossAnnualTax: fromCents(grossTaxCents),
    annualRebate: rules.rebates[ageBand],
    taxFreeThreshold: rules.thresholds[ageBand],
    marginalRatePercent: bracket.ratePercent,
    estimatedAnnualTax: fromCents(netTaxCents)
  });
}

// Annualise observed platform revenue, then estimate tax on that projection.
function estimatePlatformTax({
  yearToDatePlatformIncome,
  asOf = new Date(),
  taxYear = 2027,
  ageBand = 'under65'
}) {
  const period = getTaxYearPeriod(taxYear);
  const asOfDate = toSouthAfricanDate(asOf);
  const start = utcMidnight(period.startDate);
  const endExclusive = utcMidnight(period.endExclusiveDate);
  const asOfTimestamp = utcMidnight(asOfDate);

  if (asOfTimestamp < start || asOfTimestamp >= endExclusive) {
    throw new RangeError(`asOf must fall within SARS tax year ${period.label}`);
  }

  const yearToDateCents = toCents(yearToDatePlatformIncome);
  const elapsedDays = Math.round((asOfTimestamp - start) / MS_PER_DAY) + 1;
  const taxYearDays = Math.round((endExclusive - start) / MS_PER_DAY);

  // Round positive annualised values to the nearest cent, half-up.
  const projectedCents = (
    BigInt(yearToDateCents) * BigInt(taxYearDays) + BigInt(Math.floor(elapsedDays / 2))
  ) / BigInt(elapsedDays);

  const projectedAnnualPlatformIncome = fromCents(projectedCents);
  const calculation = calculateAnnualTax(projectedAnnualPlatformIncome, {
    taxYear,
    ageBand
  });

  return Object.freeze({
    ...period,
    asOfDate,
    elapsedDays,
    taxYearDays,
    ageBand,
    yearToDatePlatformIncome: fromCents(BigInt(yearToDateCents)),
    projectedAnnualPlatformIncome,
    illustrativeAnnualTax: calculation.estimatedAnnualTax,
    taxFreeThreshold: calculation.taxFreeThreshold,
    annualRebate: calculation.annualRebate,
    disclaimer: 'Illustrative only. Assumes projected platform revenue is the only taxable income and excludes expenses, other income, credits and tax already paid.'
  });
}

module.exports = {
  getTaxYearPeriod,
  calculateAnnualTax,
  estimatePlatformTax
};
