# HustleHub+ Part 2 API Tests

The Postman collection automates the Part 2 API review. It creates unique test accounts, captures JWTs and identifiers, verifies the marketplace workflow, and checks role restrictions, ownership, validation and rate limiting.

The same collection runs in Postman and through the existing Newman npm script.

## Files

- `postman_collection.json` — **HustleHub+ Part 2 - Automated API Review**.
- `postman_environment.json` — **HustleHub+ Part 2 - Local**, containing `baseUrl`, `clientOrigin`, `adminEmail` and `adminPassword`.

The separate Part 3 security matrix (`part3_security_collection.json` and `part3_security_environment.json`, run with `npm run test:security` and `npm run test:security:limits`) is documented in [`docs/testing/security-postman-suite.md`](../docs/testing/security-postman-suite.md).

Use the assessment administrator account for the configured test database. Demonstration credentials supplied for marking are for assessment only and will be removed and rotated afterwards. The collection itself contains no administrator password or generated JWTs. If `adminPassword` is blank in the exported environment, supply it locally in Postman or at run time through Newman.

## Prerequisites

- Dependencies are installed in `api`, including Newman as a development dependency.
- The API uses the implemented MongoDB-backed system. For the current assessment setup, `MONGO_URI` selects the Atlas database `hustlehub`.
- `USE_HTTPS=true`, and the API is available at `https://localhost:4000`.
- The local certificate exists at `api/certs/localhost-cert.pem` and includes `DNS:localhost` in its subject alternative names, as described in the root `README.md`.
- `baseUrl` is the API origin only: `https://localhost:4000`, without `/api` or a trailing slash.
- `CLIENT_ORIGIN` in `api/.env` matches the environment's `clientOrigin`, normally `http://localhost:5173`.
- The existing administrator account matches `adminEmail` and `adminPassword`.
- The gig price validation correction is applied: prices below one cent and fractional-cent values are rejected.

If dependencies have not been installed, run from the repository root:

```bash
npm --prefix api install
```

Public registration rejects the `admin` role. Administrator provisioning is separate from the suite; the suite authenticates the existing administrator and never creates or promotes an administrator.

The React frontend may remain running, but these API tests do not require it. React rendering and interaction tests remain a separate frontend test suite.

## Start a Fresh API Process

The limiters keep their counters in process memory. Stop an existing API process with `Ctrl+C`, then start it from a terminal inside the repository:

```bash
cd "$(git rev-parse --show-toplevel)"
npm --prefix api start
```

The API must report a successful MongoDB connection and HTTPS startup.

Start a fresh API process before each new complete test cycle. Keep the same API process running between folders during one cycle.

## Folder Order

Later folders reuse the accounts, JWTs and identifiers captured by earlier folders.

| Folder | Request definitions | Coverage |
|---|---:|---|
| 01 Health and Security Headers | 4 | HTTPS health, API Helmet/CSP headers, trusted and untrusted CORS origins, preflight. |
| 02 Authentication | 21 | Existing administrator login, four unique accounts, JWT capture, registration failures, login failure and protected profiles. |
| 03 Gigs | 36 | Freelancer CRUD, ownership, role restrictions, active/inactive visibility, sanitisation and price boundaries. |
| 04 Bookings | 18 | Booking and matching transaction, client/freelancer views, cross-client rejection and invalid or overridden fields. |
| 05 Income | 4 | Confirmed transaction income, freelancer isolation, wrong-role and missing-token rejection. |
| 06 Administration | 18 | Safe user and booking views, restricted gig removal, history preservation and fixture gig cleanup. |
| 07 Security and Controlled Errors | 7 | Malformed JSON, oversized bodies, unknown routes, NoSQL operators and array input. |
| 08 Rate Limiting | 4 | Automatic login and booking exhaustion, `429` headers and forwarded-IP bypass rejection. |

There are **112 request definitions**. The two bounded rate-limit loops can execute their requests more than once, so the number of executed requests can exceed 112.

Collection-level assertions check security headers and safe responses, including the absence of `X-Powered-By`, stack traces, database error names and private fields. Negative cases verify the expected controlled error response.

## Run in Postman

1. Import both JSON files.
2. Open **HustleHub+ Part 2 - Automated API Review**.
3. Select **HustleHub+ Part 2 - Local** in the Collection Runner and verify `adminEmail` and `adminPassword`. If the exported password is blank, set its local value before running.
4. Add `api/certs/localhost-cert.pem` under **Settings > Certificates > CA certificates**.
5. Use the desktop/local runner for the localhost API, with one iteration, no data file, and every request selected.
6. Enable **Keep variable values** and **Stop run if an error occurs**.
7. Run the whole collection, or run folders 01 through 08 individually in order.

No manual registration, login, JWT copying or identifier editing is needed after starting the run. For separate folder runs, **Keep variable values** must be enabled so later folders receive the earlier folder's captured state.

Folder 02 starts a new set of unique test accounts and clears the collection's previous test state. Later folders check that their prerequisites completed. The suite captures account tokens and builds the dependent requests automatically. Invalid-JWT probes use the saved dummy Bearer Token `invalid.jwt.token`.

Folder 08 must run last. It deliberately exhausts the login and booking limits. Before another complete run, restart the API or wait for all relevant limiter windows to expire.

After correcting a request in Postman, save it and export the collection as **Collection v2.1** back to `postman/postman_collection.json` so Newman receives the same correction. Clear captured JWTs and run identifiers from the export.

## Run With Newman

After a fresh API start, open a second terminal inside the repository. If the local environment already provides the assessment administrator password:

```bash
cd "$(git rev-parse --show-toplevel)"
npm --prefix api run test:api --silent
```

If `adminPassword` is blank in the exported environment, supply it at run time. Replace `<admin-password>` with the assessment administrator password:

```bash
cd "$(git rev-parse --show-toplevel)"
npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

The single quotes preserve characters such as `$` in the password. `--silent` suppresses npm's script-command echo.

For PowerShell, run the equivalent command from the repository root:

```powershell
npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

The existing npm script reads both JSON files, trusts the local certificate through `--ssl-extra-ca-certs`, executes every folder, prints the results, and writes:

```text
evidence/part2/newman-report.xml
```

The expected outcome is completion of all eight folders with **zero failed assertions and no execution errors**. Missing administrator credentials or a failed administrator login stop setup before the test accounts are registered.

A Postman run followed by a Newman run requires a fresh API start between them because the Postman rate-limit checks intentionally exhaust the counters. In the API terminal, press `Ctrl+C`, then run from the repository root:

```bash
npm --prefix api start
```

Use the corrected repository collection for Newman. Generated Postman tokens and run identifiers belong to local test state and should not be copied into the repository collection.

## Test Data and Consistency

Each cycle creates two clients and two freelancers with unique email addresses. The existing administrator is authenticated; the suite never creates or promotes an administrator.

The suite creates and modifies only its own captured gig records. It removes those gigs during the CRUD and administration checks. The test accounts and one booking/transaction pair remain in MongoDB for persistence verification.

The successful booking uses the gig's updated server-side price of `800.25`. The transaction must match the booking's client, freelancer, amount and status. The freelancer income endpoint must return `800.25` and one confirmed transaction.

Deleting the booked test gig must preserve the booking and its derived income.

## Rate-Limit Caveat

The three limiters in `api/middleware/rateLimiters.js` use the client IP address and keep their counters in API process memory.

| Limiter | Route | Limit | What counts | Normal cycle before folder 08 |
|---|---|---|---|---:|
| `authLimiter` | `POST /api/auth/login` | 5 per 15 minutes | Failed logins; successful logins do not count. | 3 failed attempts |
| `registerLimiter` | `POST /api/auth/register` | 10 per hour | Every request that reaches the route limiter. | 8 attempts |
| `bookingLimiter` | `POST /api/bookings` | 10 per 15 minutes | Every request past the JWT and client-role checks. | 9 attempts |

Malformed JSON and oversized bodies are rejected by the JSON body parser before the route limiter runs. Missing or invalid JWTs and rejected roles are handled before the booking limiter. Administrator routes have no route-specific limiter.

Folder 08 automatically exhausts the remaining login and booking capacity, verifies `429`, `RateLimit-*` and `Retry-After` headers, checks that the frontend origin can read `Retry-After`, and checks that a forged `X-Forwarded-For` header does not bypass the limits. Booking probes use an invalid gig ID and do not create additional bookings or transactions.

Once the failed-login allowance is exhausted, further login requests are blocked, including valid logins. An immediate second complete cycle also exceeds the registration allowance. Restart the API before another complete cycle, or wait up to one hour for the relevant windows to expire. Avoid extra registration, failed-login or booking requests before an evidence run because they consume the same allowance.

## Failure Diagnosis

The HTTP assertion includes the API's controlled error message when available.

| Result | Meaning or check |
|---|---|
| Administrator login `400` | The API rejected the request body or credential format. Read the returned error. |
| Administrator login `401` | The supplied credentials did not authenticate against the configured database. |
| Administrator login `200`, role assertion fails | The authenticated account does not have the administrator role. |
| Unexpected `429` before folder 08 | Existing activity consumed the limiter allowance. Start a fresh API process. |
| Missing token or preceding-folder error | Run folders in order with **Keep variable values** enabled. |
| Invalid-JWT probe returns `Authentication required` | Inspect the fresh outgoing request for `Authorization: Bearer invalid.jwt.token`. Use the saved Bearer Token setting and remove empty manual Authorization overrides. |
| Empty `400` response without API security headers | Inspect outgoing transport headers. Let Postman calculate `Content-Length` and `Host`; remove saved placeholder overrides such as `<calculated when request is sent>`. |
| `404` on a known booking route | Verify the resolved path is `/api/bookings`, with one slash between segments. `/api//bookings` does not match the route. |
| Send passes but Runner fails | Save the request, capture a fresh Runner execution, and compare the actual outgoing headers, body and response in the Postman Console. Enable response persistence and console logging for that diagnostic run. |
| Certificate or connection error | Verify HTTPS startup, the API origin and local certificate trust. |

Failed setup or assertions stop the current runner sequence to avoid misleading follow-on failures. Fix the reported cause before starting a new complete cycle. Remove temporary diagnostic scripts once the issue is resolved.

## Evidence

Retain `evidence/part2/newman-report.xml` together with a screenshot of the Newman terminal summary from a successful run against the real MongoDB-backed API after a fresh API start.

The repository also contains the separate React test report at `evidence/part2/react-tests.xml` and feature evidence under the `authentication`, `gigs`, `bookings`, `income`, `admin`, `security` and `database` folders in `evidence/part2`.

API header tests do not prove the React document's CSP. Frontend document CSP evidence, React automated tests and Atlas persistence screenshots are verified separately.
