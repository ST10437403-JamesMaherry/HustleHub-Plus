# HustleHub+ Part 2 API Tests

The Postman collection automates the Part 2 API review. It creates unique test
accounts, captures JWTs and identifiers, verifies the marketplace workflow, and
checks role restrictions, ownership, validation and rate limiting.

The same collection runs in Postman and through the existing Newman npm script.

## Files

- `postman_collection.json` — HustleHub+ Part 2 - Automated API Review.
- `postman_environment.json` — local API configuration and assessment admin credentials.

The demonstration admin credential is intentionally supplied for assessment and
will be removed and rotated after marking. The collection itself contains no
admin password or generated JWTs.

## Prerequisites

- API dependencies are installed.
- The API uses the implemented MongoDB-backed system.
- `MONGO_URI` selects the Atlas database `hustlehub`.
- `USE_HTTPS=true`.
- The existing administrator account matches `adminEmail` and `adminPassword`.
- `CLIENT_ORIGIN` matches the environment's `clientOrigin`.
- The gig price validation correction is applied.

The React frontend may remain running, but these API tests do not require it.
React rendering and interaction tests remain a separate frontend test suite.

## Start a Fresh API Process

The limiters keep their counters in process memory. Stop an existing API process
with `Ctrl+C`, then start it from a terminal inside the repository:

```bash
cd "$(git rev-parse --show-toplevel)"
npm --prefix api start
```

The API must report a successful MongoDB connection and HTTPS startup.

Start a fresh API process before each new complete test cycle. Do not restart
between folders during one cycle.

## Folder Order

| Folder | Request definitions | Coverage |
|---|---:|---|
| 01 Health and Security Headers | 4 | HTTPS health, API Helmet/CSP headers, trusted and untrusted CORS origins, preflight. |
| 02 Authentication | 21 | Existing admin login, four unique accounts, JWT capture, registration failures, login failure and protected profiles. |
| 03 Gigs | 36 | Freelancer CRUD, ownership, role restrictions, active/inactive visibility, sanitisation and price boundaries. |
| 04 Bookings | 18 | Booking and matching transaction, client/freelancer views, cross-client rejection and invalid or overridden fields. |
| 05 Income | 4 | Confirmed transaction income, freelancer isolation, wrong-role and missing-token rejection. |
| 06 Administration | 18 | Safe user and booking views, restricted gig removal, history preservation and fixture gig cleanup. |
| 07 Security and Controlled Errors | 7 | Malformed JSON, oversized bodies, unknown routes, NoSQL operators and array input. |
| 08 Rate Limiting | 4 | Automatic login and booking exhaustion, `429` headers and forwarded-IP bypass rejection. |

There are 112 request definitions. The two bounded rate-limit loops can execute
their requests more than once.

## Run in Postman

1. Import both JSON files.
2. Open **HustleHub+ Part 2 - Automated API Review**.
3. Select **HustleHub+ Part 2 - Local** in the Collection Runner.
4. Trust `api/certs/localhost-cert.pem` through Postman's CA certificate settings.
5. Use one iteration, no data file, and keep every request selected.
6. Enable **Keep variable values** and **Stop run if an error occurs**.
7. Run the whole collection, or run folders 01 through 08 individually in order.

No manual registration, login, JWT copying or identifier editing is needed
after starting the run. For separate folder runs, Keep variable values must be
enabled so later folders receive the earlier folder's captured state.

Use the desktop/local runner for the localhost API.

Folder 02 starts a new set of unique test accounts and clears the collection's
previous test state. Later folders check that their preceding folder completed.
Request bodies and Authorization headers are constructed automatically.

Folder 08 must run last. It deliberately exhausts the login and booking limits.
Before another complete run, restart the API or wait for the limiter windows
to expire.

## Run With Newman

After a fresh API start, open a second terminal inside the repository:

```bash
cd "$(git rev-parse --show-toplevel)"
npm --prefix api run test:api --silent
```

The existing npm script reads both JSON files, trusts the local certificate,
executes every folder, and writes:

```text
evidence/part2/newman-report.xml
```

The expected outcome is completion of all eight folders with zero failed
assertions and no execution errors.

A Postman run followed by a Newman run requires a fresh API start between them,
because the Postman rate-limit checks intentionally exhaust the counters.

Use the supplied repository collection for Newman. Generated Postman tokens and
run identifiers belong to local test state and should not be copied into the
repository collection.

## Test Data and Consistency

Each cycle creates two clients and two freelancers with unique email addresses.
The existing administrator is authenticated; the suite never creates or promotes
an administrator.

The suite creates and modifies only its own captured gig records. It removes
those gigs during the CRUD and administration checks. The test accounts and one
booking/transaction pair remain in MongoDB for persistence verification.

The successful booking uses the gig's updated server-side price of `800.25`.
The transaction must match the booking's client, freelancer, amount and status.
The freelancer income endpoint must return `800.25` and one confirmed transaction.

Deleting the booked test gig must preserve the booking and its derived income.

Before folder 08, a normal cycle uses:

- Eight registration attempts.
- Nine authenticated client booking attempts.
- Three failed login attempts.

The remaining limiter capacity is exhausted automatically in folder 08. Booking
rate-limit probes use an invalid gig ID, so they do not create additional bookings
or transactions.

## Failure Diagnosis

The HTTP assertion includes the API's controlled error message.

| Result | Meaning |
|---|---|
| Admin login `400` | The API rejected the request body or credential format. Read the returned error. |
| Admin login `401` | The supplied credentials did not authenticate against the configured database. |
| Admin login `200`, role assertion fails | The authenticated account does not have the admin role. |
| Unexpected `429` before folder 08 | Existing activity consumed the limiter allowance. Start a fresh API process. |
| Missing token or preceding-folder error | Run folders in order with Keep variable values enabled. |
| Certificate or connection error | Verify HTTPS startup, the API origin and local certificate trust. |

Failed setup or assertions stop the current runner sequence to avoid misleading
follow-on failures. Fix the reported cause before starting a new complete cycle.

API header tests do not prove React document CSP. Frontend document CSP evidence,
React automated tests and Atlas screenshots are verified separately.