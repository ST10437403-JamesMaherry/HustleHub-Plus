# HustleHub+ Part 2 Postman and Newman Tests

This folder contains the automated API test suite for HustleHub+. The same collection runs in the Postman app and from the command line through Newman.

## Files

- `postman_collection.json` - the **HustleHub+ Part 2 - API Tests** collection
- `postman_environment.json` - the **HustleHub+ Part 2 - Local** environment (`baseUrl` and `clientOrigin`)

## Folder Structure

The folders run in order. Later folders reuse the accounts, JWTs and IDs captured by earlier ones.

| Folder | Requests | Covers |
|---|---|---|
| `01 Health and Security Headers` | 3 | HTTPS health check, Helmet headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS, no `X-Powered-By`) and the CORS allow-list. Initialises the per-run accounts. |
| `02 Authentication` | 17 | Registration success and failures, login success, invalid login, JWT capture, missing, tampered and non-Bearer tokens. Checks the register and login limiters have enough capacity before the run continues. |
| `03 Gigs` | 21 | Public and authenticated browsing, freelancer create, owner update and delete, non-owner and client rejection, markup sanitisation and invalid input. |
| `04 Bookings` | 13 | Client booking with its simulated transaction, booking history, freelancer view, role and ownership checks, invalid, missing and inactive gigs, rejected price or ownership overrides. |
| `05 Income` | 4 | Freelancer income totals, per-freelancer scoping, wrong-role and missing-JWT rejection. |
| `06 Security and Errors` | 6 | Malformed JSON (`400`), unknown route (`404`), oversized body (`413`) and NoSQL operator payloads such as `{"$gt": ""}` on login, gig update and booking. |
| `07 Rate Limiting` | 2 | Failed-login limiter returns `429` with `RateLimit-*` and `Retry-After` headers, a forged `X-Forwarded-For` header does not bypass it, and the frontend origin can read `Retry-After`. Always last. |

A collection-level test also runs after every response and fails if a body exposes stack traces, `node_modules` paths or database error names, or if `X-Powered-By` is present.

An `Admin` folder will be added once the admin API (#34) is implemented.

## Prerequisites

- The API is running over HTTPS on `https://localhost:4000` with a working MongoDB connection (see the root `README.md`).
- The local certificate exists at `api/certs/localhost-cert.pem`. Newman trusts it through `--ssl-extra-ca-certs`, so the certificate must include `subjectAltName=DNS:localhost`, as the root README's OpenSSL command does.
- `CLIENT_ORIGIN` in `api/.env` matches `clientOrigin` in the environment file (`http://localhost:5173` by default).
- Dependencies are installed in `api` (`npm install`), which includes Newman as a development dependency.

## Run With Newman

Start the API in one PowerShell terminal from the repository root:

```powershell
cd api; npm start
```

Run the suite in a second terminal:

```powershell
cd api; npm run test:api
```

The command runs every folder in order, prints the results in the terminal and writes a JUnit report to `evidence/part2/newman-report.xml`. A valid run finishes with zero failed assertions. Restart the API (`Ctrl+C`, then `npm start`) before each further run; see the rate-limit caveat below.

## Run in Postman

1. Import `postman_collection.json` and `postman_environment.json`.
2. Select the **HustleHub+ Part 2 - Local** environment.
3. Either add `api/certs/localhost-cert.pem` under **Settings > Certificates > CA certificates**, or temporarily turn off **SSL certificate verification** for this local self-signed certificate.
4. Run the whole collection in its existing order.

## Repeatability

The database persists between runs, so the suite never relies on fixed accounts:

- The first request generates unique client and freelancer email addresses from a timestamp and clears every captured value from the previous run.
- Registration and login scripts capture user IDs and JWTs automatically.
- The gig requests create fresh gigs and capture their IDs, owner and price for the booking and income checks.
- The password is a fake test value stored as a collection variable. No real credential, JWT secret, certificate or private key is stored in these files.

## Rate-Limit Caveat

Three limiters in `api/middleware/rateLimiters.js` affect the suite. All are keyed by client IP address and keep their counters in the API's memory.

| Limiter | Route | Limit | What counts | One full run uses |
|---|---|---|---|---|
| `authLimiter` | `POST /api/auth/login` | 5 per 15 minutes | Failed logins only (status `400` or above); successful logins are not counted | 2 failed logins, then `07 Rate Limiting` uses the rest |
| `registerLimiter` | `POST /api/auth/register` | 10 per hour | Every request that reaches the route | 8 (four accounts and four rejected registrations) |
| `bookingLimiter` | `POST /api/bookings` | 10 per 15 minutes | Every request past the JWT and role checks | 8 |

Malformed JSON and oversized bodies are rejected by the JSON body parser before the route runs, so those two tests do not count towards the register limit. The NoSQL operator test uses the login route because failed logins are cheaper than registrations.

The four successful logins run before the invalid-password check because, once the failed-login limit is reached, the limiter blocks every login, including valid ones. `07 Rate Limiting` then repeats invalid logins until the limiter responds with `429 Too Many Requests`, checks the `RateLimit-*` and `Retry-After` headers, and confirms the frontend origin can read `Retry-After`. It loops on its own, so it also works when run separately.

An immediate re-run against the same API process cannot pass: the failed-login limit is used up for 15 minutes and a second run would need 16 registrations against a limit of 10 per hour. **Restart the API before running the collection again** (the in-memory counters reset on restart), or wait up to 1 hour. If an earlier run has already used the budget, the first registration or the first client login fails with *... rate limiter has capacity for this run (restart the API if this fails)* and the run stops there instead of producing a cascade of failures. Avoid sending extra registration or failed login requests by hand before an evidence run for the same reason.

## Evidence

Submit the JUnit report from `evidence/part2/newman-report.xml` together with a screenshot of the terminal summary. Generate it against the real MongoDB-backed API after a fresh API start.
