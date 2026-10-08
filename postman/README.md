# HustleHub+ Part 2 Postman and Newman Tests

This folder contains the automated API test suite for HustleHub+. The same collection runs in the Postman app and from the command line through Newman.

## Files

- `postman_collection.json` - the **HustleHub+ Part 2 - API Tests** collection
- `postman_environment.json` - the **HustleHub+ Part 2 - Local** environment (`baseUrl`, `clientOrigin`, `adminEmail` and an empty `adminPassword`)

## Folder Structure

The folders run in order. Later folders reuse the accounts, JWTs and IDs captured by earlier ones.

| Folder | Requests | Covers |
|---|---|---|
| `01 Health and Security Headers` | 3 | HTTPS health check, Helmet headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS, no `X-Powered-By`) and the CORS allow-list. Initialises the per-run accounts and checks `adminPassword` was supplied. |
| `02 Authentication` | 18 | Admin login, registration success and failures, login success, invalid login, JWT capture, missing, tampered and non-Bearer tokens. Checks the register and login limiters have enough capacity before the run continues. |
| `03 Gigs` | 21 | Public and authenticated browsing, freelancer create, owner update and delete, non-owner and client rejection, markup sanitisation and invalid input. |
| `04 Bookings` | 13 | Client booking with its simulated transaction, booking history, freelancer view, role and ownership checks, invalid, missing and inactive gigs, rejected price or ownership overrides. |
| `05 Income` | 4 | Freelancer income totals, per-freelancer scoping, wrong-role and missing-JWT rejection. |
| `06 Admin` | 12 | Admin user list (safe fields only) and booking list, admin removal of a freelancer's gig, invalid and unknown gig IDs, and rejection of client, freelancer and anonymous requests. |
| `07 Security and Errors` | 6 | Malformed JSON (`400`), unknown route (`404`), oversized body (`413`) and NoSQL operator payloads such as `{"$gt": ""}` on login, gig update and booking. |
| `08 Rate Limiting` | 2 | Failed-login limiter returns `429` with `RateLimit-*` and `Retry-After` headers, a forged `X-Forwarded-For` header does not bypass it, and the frontend origin can read `Retry-After`. Always last. |

A collection-level test also runs after every response and fails if a body exposes stack traces, `node_modules` paths or database error names, or if `X-Powered-By` is present.

## Prerequisites

- The API is running over HTTPS on `https://localhost:4000` with a working MongoDB connection (see the root `README.md`).
- The local certificate exists at `api/certs/localhost-cert.pem`. Newman trusts it through `--ssl-extra-ca-certs`, so the certificate must include `subjectAltName=DNS:localhost`, as the root README's OpenSSL command does.
- `CLIENT_ORIGIN` in `api/.env` matches `clientOrigin` in the environment file (`http://localhost:5173` by default).
- Dependencies are installed in `api` (`npm install`), which includes Newman as a development dependency.
- The admin account exists in your local database (see below).

## Admin Account

Public registration rejects the `admin` role, so the admin account is created once per database: register it as a normal user, then change its role directly in MongoDB. The suite logs in as `adminEmail` (default `admin.demo@hustlehub.test`) and never stores the admin password; you pass it at run time.

With the API running, register the account in PowerShell 7 (`-SkipCertificateCheck` accepts the local self-signed certificate). Replace `<admin-password>` with the demo password from `client/README.md` or your own 8-72 character password:

```powershell
Invoke-RestMethod -Method Post -Uri https://localhost:4000/api/auth/register -SkipCertificateCheck -ContentType 'application/json' -Body (@{ fullName = 'Demo Admin'; email = 'admin.demo@hustlehub.test'; password = '<admin-password>'; role = 'client' } | ConvertTo-Json)
```

A `409` response means the account already exists. Next, assign the admin role in the `users` collection. This example uses the `hustlehub-mongo` Docker container and the `hustlehub-test` database; use the database named in your `MONGO_URI`. The backtick before `$set` stops PowerShell expanding it as a variable:

```powershell
docker exec hustlehub-mongo mongosh hustlehub-test --quiet --eval "db.users.updateOne({ email: 'admin.demo@hustlehub.test' }, { `$set: { role: 'admin' } })"
```

The output should show `matchedCount: 1`. The registration counted towards the register limit, so restart the API before running the suite.

## Run With Newman

Start the API in one PowerShell terminal from the repository root:

```powershell
cd api; npm start
```

Run the suite in a second terminal, passing the admin password:

```powershell
cd api; npm run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

`--silent` stops npm echoing the full Newman command, which would otherwise print the password above the results. Keep the single quotes so PowerShell does not expand characters such as `$` in the password.

The command runs every folder in order, prints the results in the terminal and writes a JUnit report to `evidence/part2/newman-report.xml`. A valid run finishes with zero failed assertions. Restart the API (`Ctrl+C`, then `npm start`) before each further run; see the rate-limit caveat below.

If `adminPassword` is missing, the run stops after the first request with *adminPassword is provided*. If the admin login fails, the run stops at the first request in `02 Authentication` with *Admin account is provisioned and adminPassword is correct*, before any registration uses the register limit.

## Run in Postman

1. Import `postman_collection.json` and `postman_environment.json`.
2. Select the **HustleHub+ Part 2 - Local** environment and set the current value of `adminPassword`. Do not save the password into the exported environment file.
3. Either add `api/certs/localhost-cert.pem` under **Settings > Certificates > CA certificates**, or temporarily turn off **SSL certificate verification** for this local self-signed certificate.
4. Run the whole collection in its existing order.

## Repeatability

The database persists between runs, so the suite never relies on fixed test accounts:

- The first request generates unique client and freelancer email addresses from a timestamp and clears every captured value from the previous run.
- Registration and login scripts capture user IDs and JWTs automatically.
- The gig requests create fresh gigs and capture their IDs, owner and price for the booking, income and admin checks. `06 Admin` creates its own gig to remove, so later requests are unaffected.
- The test-user password is a fake value stored as a collection variable. The admin password is supplied at run time. No real credential, JWT secret, certificate or private key is stored in these files.

## Rate-Limit Caveat

Three limiters in `api/middleware/rateLimiters.js` affect the suite. All are keyed by client IP address and keep their counters in the API's memory.

| Limiter | Route | Limit | What counts | One full run uses |
|---|---|---|---|---|
| `authLimiter` | `POST /api/auth/login` | 5 per 15 minutes | Failed logins only (status `400` or above); successful logins are not counted | 2 failed logins, then `08 Rate Limiting` uses the rest |
| `registerLimiter` | `POST /api/auth/register` | 10 per hour | Every request that reaches the route | 8 (four accounts and four rejected registrations) |
| `bookingLimiter` | `POST /api/bookings` | 10 per 15 minutes | Every request past the JWT and role checks | 8 |

Malformed JSON and oversized bodies are rejected by the JSON body parser before the route runs, so those two tests do not count towards the register limit. The NoSQL operator test uses the login route because failed logins are cheaper than registrations. The admin routes have no limiter.

All five successful logins, including the admin login, run before the invalid-password check because, once the failed-login limit is reached, the limiter blocks every login, including valid ones. `08 Rate Limiting` then repeats invalid logins until the limiter responds with `429 Too Many Requests`, checks the `RateLimit-*` and `Retry-After` headers, and confirms the frontend origin can read `Retry-After`. It loops on its own, so it also works when run separately.

An immediate re-run against the same API process cannot pass: the failed-login limit is used up for 15 minutes and a second run would need 16 registrations against a limit of 10 per hour. **Restart the API before running the collection again** (the in-memory counters reset on restart), or wait up to 1 hour. If an earlier run has already used the budget, the admin login or the first registration fails with *... rate limiter has capacity for this run (restart the API if this fails)* and the run stops there instead of producing a cascade of failures. Avoid sending extra registration or failed login requests by hand before an evidence run for the same reason.

## Evidence

Submit the JUnit report from `evidence/part2/newman-report.xml` together with a screenshot of the terminal summary. Generate it against the real MongoDB-backed API after a fresh API start.
