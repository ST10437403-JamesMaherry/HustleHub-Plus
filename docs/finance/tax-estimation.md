# HustleHub+ — 2027 South African Tax Estimation Methodology

## Purpose and source

This document records the financial assumptions for the **Part 3 illustrative tax-estimation feature**. Its calculations use the SARS **2027 year of assessment**, from **1 March 2026 to 28 February 2027**. Tax rules are versioned explicitly; the application must never silently apply 2027 rates to transactions in a different tax year.

Primary official source (accessed 5 November 2026):

- South African Revenue Service (SARS). *Rates of Tax for Individuals*. https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/

Further explanation of taxable income and reporting:

- SARS. *Personal Income Tax*. https://www.sars.gov.za/types-of-tax/personal-income-tax/

## Verified 2027 progressive brackets

| Assumed annual taxable income (ZAR) | Tax before rebates |
|---|---|
| R0–R245,100 | 18% of taxable income |
| Above R245,100, to R383,100 | R44,118 + 26% over R245,100 |
| Above R383,100, to R530,200 | R79,998 + 31% over R383,100 |
| Above R530,200, to R695,800 | R125,599 + 36% over R530,200 |
| Above R695,800, to R887,000 | R185,215 + 39% over R695,800 |
| Above R887,000, to R1,878,600 | R259,783 + 41% over R887,000 |
| Above R1,878,600 | R666,339 + 45% over R1,878,600 |

The 2027 rebates are **primary R17,820**, **secondary R9,765** (65+), and **tertiary R3,249** (75+). They are cumulative where applicable. The corresponding income-tax thresholds are **R99,000** (under 65), **R153,250** (65–74), and **R171,300** (75+).

No age or tax-residency field currently exists in the HustleHub+ `User` model. The dashboard therefore uses the **under-65 primary-rebate assumption** unless the application explicitly provides a different assumption in future. This does not imply the user actually belongs to that age band.

## Calculation method

The source of financial evidence is the existing confirmed `Transaction` records, scoped to the authenticated freelancer. P3-01 itself does **not** query MongoDB or change the `/api/income/me` response; P3-02 will supply the year-to-date amount and preserve the Part 2 response contract.

1. **Observed year-to-date platform income**: Sum only confirmed simulated transaction amounts within the selected tax year, from 1 March through the current South African calendar date. This is gross HustleHub+ revenue, not a verified measure of taxable profit.
2. **Projected annual platform income**: Multiply observed year-to-date income by `(total days in tax year / elapsed calendar days, including the observation date)`. This is a simple run-rate projection, not a forecast backed by seasonality, expenses or future bookings.
3. **Tax before rebates**: Apply the official progressive bracket calculation to projected annual platform income **as a hypothetical taxable-income amount**.
4. **Illustrative annual tax**: Subtract the applicable annual rebate, with a minimum tax estimate of R0. This is a full-year illustrative amount, **not** a tax bill, PAYE deduction, amount due now, or provisional-tax calculation.

Example, as of **5 November 2026**: R100,000 in observed platform revenue over 250 elapsed days projects to `R100,000 × 365 / 250 = R146,000`. Before-rebate tax is `18% × R146,000 = R26,280`; after the default R17,820 rebate, the **illustrative full-year tax estimate is R8,460**.

All monetary inputs must be finite, non-negative ZAR values valid to the cent. The calculation uses integer cents and rounds fractional cents **half-up**. Calendar dates use **Africa/Johannesburg** rather than the host machine timezone. An unsupported tax year or a date outside the configured 2027 tax year is rejected instead of applying stale rates.

## Scope and safety disclaimers

- HustleHub+ records **simulated** payments and does not have access to external income, tax residence, deductible business expenses, employment benefits, medical credits, retirement contributions, or tax already paid.
- Gross revenue and annualised revenue must **not** be presented as final taxable income. Real individual tax depends on all relevant income and the person's circumstances.
- The estimate is not an assessment by SARS, a tax return, tax advice, or a payment instruction. Users should consult SARS or a qualified tax practitioner for actual obligations.
- The algorithm does not calculate VAT, turnover tax, PAYE, provisional tax, interest, penalties or tax credits other than the age-based personal rebates above.
- The service does not collect birth dates, medical details, tax numbers, or other personal tax information. No new database records are needed for P3-01.

## Implementation ownership and next integration

- `api/services/taxEstimator.js` — pure, dependency-free calculation service using the documented 2027 SARS rules.
- `api/test/taxEstimator.test.js` — Node built-in unit tests for brackets, rebates, rounding, validation and South African date boundaries.
- **P3-02** will aggregate confirmed, freelancer-owned MongoDB transactions by tax year and month, then call this service.
- **P3-03** will show observed income, projected income and the illustrative annual tax separately in the existing freelancer dashboard.

## Academic source attribution

The SARS rates and year boundaries are external reference data. The implementation is project-specific and must be listed in the final README's references and AI-use declaration as applicable under the INSY7314 POE guidelines.
