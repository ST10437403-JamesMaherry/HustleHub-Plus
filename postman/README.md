# HustleHub+ Functional API Tests (Part 2 + Part 3 Financial)

The functional Postman collection reviews the real MongoDB-backed API end to end. It creates unique test accounts, captures JWTs and identifiers, runs the marketplace workflow, and checks role restrictions, ownership, validation and rate limiting. Part 3 extends it with the booking idempotency contract, year-to-date income, the monthly breakdown and the illustrative tax estimate. Calculated values are recalculated in the test script, not just checked for `200 OK`.

The same collection runs in Postman and through the `test:api` npm script (Postman CLI).

## Files

| File | Purpose |
|---|---|
| `postman_collection.json` | **HustleHub+ Functional API Review (Part 2 + Part 3 Financial)**, Collection v2.1. |
| `postman_environment.json` | **HustleHub+ Functional - Local**: `baseUrl`, `clientOrigin`, `adminEmail` and a **blank** `adminPassword`. |
| `part3_security_collection.json` / `part3_security_environment.json` | Separate Part 3 security matrix (P3-13), documented in [`docs/testing/security-postman-suite.md`](../docs/testing/security-postman-suite.md). |

Neither functional JSON file contains a password, JWT, run identifier or `Idempotency-Key`. Supply `adminPassword` at run time (CLI) or as a local current value (Postman desktop). Test-account passwords, emails and booking keys are generated for each run and cleared from the exported collection.

## Prerequisites

- Dependencies are installed in `api` (Postman CLI is a development dependency): `npm --prefix api ci`.
- `api/.env` points `MONGO_URI` at the assessment database, with `USE_HTTPS=true`. Booking creation uses MongoDB transactions, so the database must be Atlas or another replica set.
- The certificate `api/certs/localhost-cert.pem` exists and includes `DNS:localhost` in its subject alternative names (see the root `README.md`).
- `baseUrl` is the API origin only: `https://localhost:4000`, without `/api` or a trailing slash. The collection refuses any origin that is not local HTTPS.
- `CLIENT_ORIGIN` in `api/.env` matches the environment's `clientOrigin`, normally `http://localhost:5173`.
- The assessment administrator account exists (see **Administrator Account** in the root `README.md`). The suite authenticates it; it never creates or promotes an administrator.
- The run happens during the SARS 2026/27 tax year (1 March 2026 – 28 February 2027). The income API reports the tax year that contains the server date, and the test oracle holds the 2026/27 tables.

## Required headers

Every request uses the collection's scripts to build its headers; nothing needs to be typed by hand.

| Header | Used by | Value |
|---|---|---|
| `Authorization` | Protected requests | `Bearer {{hh.token}}`, chosen per request from the captured account tokens. |
| `Content-Type` | Requests with a body | `application/json`. |
| `Idempotency-Key` | `POST /api/bookings` | UUID v4. The original booking generates one and stores it as `hh.bookingKey`; the replay request reuses it. Other booking probes use `{{$guid}}`. |
| `Origin` | CORS checks in folder 01 | `{{hh.origin}}` (trusted) or `https://untrusted.example`. |
| `X-Forwarded-For` | Folder 08 bypass probes | A forged address that must not reset the limiter. |

Let Postman calculate `Content-Length` and `Host`. Do not save placeholder header overrides.

## Test variables

| Variable | Scope | Meaning |
|---|---|---|
| `baseUrl`, `clientOrigin` | Environment | Local HTTPS API origin and trusted browser origin. |
| `adminEmail`, `adminPassword` | Environment | Assessment administrator. Keep the password blank in the committed file. |
| `hh.runId`, `hh.password`, `hh.*Email` | Collection (generated) | Unique per run: `client.<runId>@hustlehub.test` and so on. |
| `hh.*Token`, `hh.*Id` | Collection (captured) | JWTs and account IDs captured by folder 02. |
| `hh.gigId`, `hh.price`, `hh.bookingId`, `hh.transactionId`, `hh.bookingCreatedAt`, `hh.bookingKey` | Collection (captured) | Resource state reused by folders 04–06. |
| `hh.done.NN` | Collection (captured) | Folder-completion markers that later folders check. |

Folder 02 clears all `hh.*` values at the start of every run.

## Folder order

Later folders reuse the accounts, JWTs and identifiers captured by earlier folders. Run them in this order.

| Folder | Requests | Coverage |
|---|---:|---|
| 01 Health and Security Headers | 4 | HTTPS health, API Helmet/CSP headers, trusted and untrusted CORS origins, preflight. |
| 02 Authentication | 21 | Administrator login, four unique accounts, JWT capture, registration and login failures, protected profiles. |
| 03 Gigs | 36 | Freelancer CRUD, ownership, role restrictions, active/inactive visibility, sanitisation and price boundaries. |
| 04 Bookings | 19 | Booking and matching transaction, **idempotent replay**, exact client/freelancer booking counts, cross-client rejection, invalid or overridden fields. |
| 05 Income | 11 | **Year-to-date income, monthly breakdown, tax-year boundaries, recalculated tax estimate, replay not double-counted, empty-income report**, freelancer isolation, wrong-role and missing-token rejection. |
| 06 Administration | 18 | Safe user and booking views, restricted gig removal, history preservation (now including the full financial report), fixture cleanup. |
| 07 Security and Controlled Errors | 7 | Malformed JSON, oversized bodies, unknown routes, NoSQL operators and array input. |
| 08 Rate Limiting | 4 | Automatic login and booking exhaustion, `429` headers and forwarded-IP bypass rejection. Always last. |

There are **120 request definitions**: the 112 Part 2 definitions plus 8 Part 3 financial definitions. Every Part 2 contract still applies. Three were strengthened: booking history now asserts an exact count of one, and two income requests now run the financial checks. The bounded rate-limit loops can repeat a request, so executed requests can exceed 120.

### Part 3 financial coverage (P3-12)

The successful booking uses the gig's server-side price of `800.25`. All financial expectations are derived from that captured price and the booking's `createdAt`. None are hard-coded.

| Request | What it proves |
|---|---|
| Booking - Create and Capture Transaction | `replayed: false`, matching transaction, and a fresh booking quota (`RateLimit-Remaining ≥ 9`). |
| Booking - Replay Same Key Returns Original | Same `Idempotency-Key` and gig → `200`, `replayed: true`, and the **same** booking and transaction IDs. |
| Booking - Client History / Freelancer View | Exactly one booking exists after two POSTs. |
| Income - Freelancer Total / Year-to-Date Matches Confirmed Booking | `yearToDateIncome`, `totalIncome` and both counts equal the confirmed booking, in cents. |
| Income - Monthly Breakdown Covers Tax Year | Twelve months from `2026-03` to `2027-02` with correct labels. Monthly totals reconcile to year-to-date, months after the observation date are zero, and the booking is counted in its **South African** calendar month. |
| Income - Tax-Year Boundaries | Tax-year label, start, end and exclusive end; `asOfDate` is today in Africa/Johannesburg and inside the window; the booking falls inside the window. |
| Income - Illustrative Tax Recalculated | An independent SARS 2026/27 calculation in the test script reproduces `elapsedDays`, `taxYearDays`, projected annual income and illustrative tax to the cent, plus the threshold, rebate, age band and disclaimer. |
| Income - Booking Replay Not Double Counted | Two POSTs with one key produce one transaction and one booking's income. |
| Income - Other Freelancer Zero / Empty Account Full Zero Report | A freelancer without bookings receives a complete, correctly shaped report: zero in every month, zero tax, and none of the other freelancer's income. |
| Income - Reject Client / Reject Admin / Missing JWT | Only an authenticated freelancer can read income. |
| Admin - Income Survives Gig Removal | The full financial report is unchanged after the booked gig is removed. |

Every financial response is also checked for an exact key set, so the report cannot leak extra fields.

The tax oracle follows the method in [`docs/finance/tax-estimation.md`](../docs/finance/tax-estimation.md). It annualises year-to-date income over the elapsed days, applies the 2026/27 brackets and subtracts the primary rebate, using integer cents throughout. It is written separately from `api/services/taxEstimator.js`, so a regression in either one fails the run. The contracts it checks are described in [`docs/finance/income-api-contract.md`](../docs/finance/income-api-contract.md) and [`docs/security/booking-idempotency.md`](../docs/security/booking-idempotency.md). Ewald's security collection covers idempotency misuse: altered bodies, cross-client reuse and malformed keys.

## HTTPS certificate handling

The API uses a locally generated, self-signed certificate. Trust that specific certificate rather than turning verification off:

- **Postman CLI:** `test:api` passes `--ssl-extra-ca-certs ./certs/localhost-cert.pem`. Do not use `--insecure` or `-k`.
- **Postman:** **Settings > Certificates > CA certificates**, select `api/certs/localhost-cert.pem`, and leave **SSL certificate verification** on.

If the certificate is regenerated, restart the API and re-select the file in Postman.

## Start a fresh API process

The rate limiters keep their counters in API process memory. Start a fresh process before **every** complete cycle, and keep that process running for the whole cycle:

```bash
cd "$(git rev-parse --show-toplevel)"
npm --prefix api start
```

The API must report a successful MongoDB connection and HTTPS startup. The collection checks this itself. If the first registration or the first booking finds part of its quota already used, the run stops with `Restart the API before a fresh full run`.

Do not run this collection, the security collection or the Playwright suite on the same API process. Each one consumes the shared registration, login and booking allowances.

## Run with Postman CLI

In a second terminal at the repository root, after a fresh API start:

```bash
npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

PowerShell:

```powershell
npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

The single quotes keep characters such as `$` literal. `--silent` suppresses npm's command echo. The script runs the CLI and JUnit reporters, trusts the local certificate, exits non-zero if any assertion fails, and writes:

```text
evidence/part3/newman/functional-report.xml
```

The expected outcome is all eight folders completed with **zero failed assertions and no script errors**. The committed Part 2 report remains at `evidence/part2/newman/newman-report.xml`.

## Run in Postman

1. Import both functional JSON files.
2. Select **HustleHub+ Functional - Local**, and set `adminPassword` as a local **current value** only.
3. Trust the certificate as described above.
4. Open the Collection Runner (desktop/local runner) with one iteration, no data file and every request selected.
5. Enable **Keep variable values** and **Stop run if an error occurs**.
6. Run the whole collection, or run folders 01 through 08 individually in order.

After changing a request, save it and **export as Collection v2.1** back to `postman/postman_collection.json`. Before committing, clear all captured `hh.*` values and confirm `adminPassword` is blank in the environment file.

## Rate-limit budget

The three limiters key on the client IP address and keep their counters in API process memory.

| Limiter | Route | Limit | What counts | Used before folder 08 |
|---|---|---|---|---:|
| `authLimiter` | `POST /api/auth/login` | 5 per 15 minutes | Failed logins only. | 3 |
| `registerLimiter` | `POST /api/auth/register` | 10 per hour | Every request that reaches the limiter. | 8 |
| `bookingLimiter` | `POST /api/bookings` | 10 per 15 minutes | Every request past the JWT and client-role checks. | **10** (9 Part 2 + 1 replay) |

The booking replay uses the last booking allowance before folder 08. In folder 08, the booking loop therefore receives `429` on its first attempt and then verifies the `RateLimit-*` and `Retry-After` headers and the forwarded-IP bypass. Any additional booking request before folder 08 would be rate limited, so keep new booking checks out of folders 04–07 unless the limiter changes.

Once the failed-login allowance is exhausted, valid logins are blocked as well. Restart the API before another cycle.

## Failure diagnosis

| Result | Meaning or check |
|---|---|
| `Select the local environment and enable adminEmail and adminPassword.` | `adminPassword` was not supplied. Use `--env-var` or a local current value. |
| Administrator login `401` | The supplied credentials do not match the configured database. |
| `Restart the API before a fresh full run: ... quota is already partly used` | Earlier traffic used part of the registration or booking quota. Restart the API. |
| Booking `500` with a transaction error | `MONGO_URI` points at a standalone MongoDB without replica-set transactions. |
| `Supported SARS tax year` fails | The server date is outside 2026/27. The API and the oracle both need the next year's tables. |
| `Financial - booking counted in its South African month` fails | Monthly grouping no longer uses `Africa/Johannesburg`. |
| `Financial - illustrative tax matches independent SARS calculation` fails | The named field (for example `elapsedDays`) differs between the API and the oracle. Check `taxEstimator.js` against `docs/finance/tax-estimation.md`. |
| Missing token or preceding-folder error | Run folders in order with **Keep variable values** enabled. |
| Certificate or connection error | Verify HTTPS startup, `baseUrl` and certificate trust. |

Failed setup or assertions stop the run to avoid misleading follow-on failures. Fix the reported cause, restart the API and start a new complete cycle.

## Test data

Each cycle creates two clients and two freelancers with unique email addresses under `@hustlehub.test`. The suite creates and modifies only its own captured gig records and removes them during the CRUD and administration checks. The test accounts and one booking/transaction pair remain in MongoDB as persistence evidence. Deleting the booked gig must preserve the booking and the derived income.

## Evidence

Part 3 functional evidence lives in [`evidence/part3/newman/`](../evidence/part3/newman/): the JUnit report and a screenshot of the Newman terminal summary from a successful run against a freshly started, MongoDB-backed API.
