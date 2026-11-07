'use strict';

// Independent SARS 2026/27 (tax year 2027) calculation used to check the
// figure the dashboard displays. Source: SARS rates of tax for individuals and
// the 2026 Budget Tax Guide. Mirrors docs/finance/tax-estimation.md, not the API code.
const RULES = Object.freeze({
  2027: Object.freeze({
    startDate: '2026-03-01',
    endExclusive: '2027-03-01',
    primaryRebate: 17820,
    brackets: [
      [0, 0, 18], [245100, 44118, 26], [383100, 79998, 31], [530200, 125599, 36],
      [695800, 185215, 39], [887000, 259783, 41], [1878600, 666339, 45]
    ]
  })
});

const DAY = 86_400_000;
const utcDay = (date) => Date.parse(`${date}T00:00:00.000Z`);

function illustrativeTax({ yearToDateIncome, asOfDate, taxYear }) {
  const rules = RULES[taxYear];
  if (!rules) throw new Error(`No SARS tables for tax year ${taxYear}`);

  const ytdCents = Math.round(yearToDateIncome * 100);
  const elapsedDays = (utcDay(asOfDate) - utcDay(rules.startDate)) / DAY + 1;
  const taxYearDays = (utcDay(rules.endExclusive) - utcDay(rules.startDate)) / DAY;
  const projectedCents = Math.floor((ytdCents * taxYearDays + Math.floor(elapsedDays / 2)) / elapsedDays);

  let bracket = rules.brackets[0];
  for (const candidate of rules.brackets) {
    if (candidate[0] === 0 || projectedCents > candidate[0] * 100) bracket = candidate;
  }

  const marginal = Math.floor(((projectedCents - bracket[0] * 100) * bracket[2] + 50) / 100);
  const taxCents = Math.max(0, bracket[1] * 100 + marginal - rules.primaryRebate * 100);

  return { projectedAnnualIncome: projectedCents / 100, illustrativeAnnualTax: taxCents / 100 };
}

module.exports = { illustrativeTax };
