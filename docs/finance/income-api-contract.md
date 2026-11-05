# HustleHub+ — Freelancer Income API Contract

## Endpoint and access

`GET /api/income/me` remains protected by JWT authentication and the `freelancer` role. The server always reads the freelancer's identity from the verified JWT, not request parameters or the request body. No new query parameters are accepted for selecting a tax year, person, or observation date.

The response retains the existing Part 2 fields:

- `totalIncome`: all-time ZAR income from confirmed transactions belonging to the freelancer.
- `transactionCount`: all-time count of those confirmed transactions.

Additional Part 3 fields:

- `taxYear`: `{ year, label, startDate, endDate, asOfDate }` for the supported SARS 2027 assessment year (1 March 2026 through 28 February 2027).
- `yearToDateIncome`: confirmed platform revenue earned from the first day of the tax year through the observation date, inclusive, in ZAR.
- `yearToDateTransactionCount`: number of confirmed transactions within that same window.
- `monthlyIncome`: an ordered array of 12 objects `{ month, label, totalIncome, transactionCount }`, including zero months. `month` is a `YYYY-MM` string in Johannesburg time.
- `taxEstimate`: the P3-01 illustrative tax-estimation output, including `projectedAnnualPlatformIncome`, `illustrativeAnnualTax`, `ageBand`, the rebate, timing assumptions and `disclaimer`.

The `taxYear.asOfDate` and the tax estimator's `asOfDate` must refer to the same South African calendar day. Display `illustrativeAnnualTax` as a **full-year projection**, never as tax currently due. Confirmed marketplace revenue is not verified taxable profit.

## MongoDB source of truth

`Transaction` is the financial source. Both aggregations match the authenticated `freelancer` and `status: 'confirmed'`.

- Lifetime aggregate covers all confirmed transactions, preserving the original API contract.
- Year-to-date aggregate filters the immutable `createdAt` timestamp using a lower inclusive / upper exclusive date window. All boundaries are South African local midnights (UTC+02:00 for the supported year).
- Months are grouped in MongoDB using the `Africa/Johannesburg` timezone, so an event at 22:30 UTC on 28 February correctly belongs to 1 March in South Africa.
- Monetary totals are aggregated as integer cents, then returned as ZAR values with cent precision. No additional income or tax collection is stored.
- The compound index `{ freelancer: 1, status: 1, createdAt: 1 }` supports ownership, status and date filtering.

The supported service is intentionally fixed to the SARS **2027 tax year**. After 28 February 2027, a new verified SARS tax-year rule set must be added before this estimate can be served for a later year. It must never silently reuse outdated brackets.

## Testing and presentation

Run the backend unit tests without Postman or MongoDB:

```bash
node --test api/test/taxEstimator.test.js api/test/incomeAnalytics.test.js
```

The new tests validate Johannesburg date boundaries, server-side ownership and confirmed-status query filters, month generation, empty results, cent precision and compatibility. Database-integrated API cases belong to Mark's Part 3 Postman/Newman work at the major integration milestone, and the frontend rendering belongs to P3-03.

For a running API, the financial endpoint can be tested manually using a valid freelancer JWT. `401` must remain the response for missing authentication, and `403` for a client/admin role. No account should be able to request a different user's income.
