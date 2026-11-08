# Part 3 security Postman suite

## Purpose

`postman/part3_security_collection.json` is the Part 3 negative-test matrix for the API's security controls. It sends hostile and malformed requests to a running HTTPS API and asserts the exact status code and fixed error message for each one. It complements the Part 2 functional collection (`postman/postman_collection.json`) and the backend unit tests (`docs/testing/backend-unit-tests.md`); it does not replace either.

Every response in the suite is also checked at collection level. A response fails if it:

- carries `X-Powered-By`, or lacks `X-Content-Type-Options: nosniff` or a `Content-Security-Policy` header;
- contains a stack-trace frame, `node_modules`, a file-system path, or a MongoDB/Mongoose or JavaScript error name (`MongoServerError`, `CastError`, `ValidationError`, `E11000`, `SyntaxError` and similar);
- contains `JWT_SECRET`, `MONGO_URI`, a `[REDACTED_DATABASE_URI] connection string or a private-key marker;
- contains the administrator password, the `jwtSecret` value, the run's test password or the run's `Idempotency-Key`;
- contains a JWT anywhere except a successful login response;
- has a JSON field named `password`, `passwordHash`, `sessionVersion`, `requestKey`, `secret`, `stack`, `_id` or `__v` at any depth;
- is an error whose body is anything other than `{ "error": "<message>" }` with a message of 240 characters or fewer.

## Files

| File | Purpose |
|---|---|
| `postman/part3_security_collection.json` | **HustleHub+ Part 3 - Security Matrix**, with two top-level folders: `Security Matrix` and `Rate Limits`. |
| `postman/part3_security_environment.json` | **HustleHub+ Part 3 - Security Local**: `baseUrl`, `clientOrigin`, `adminEmail`, and empty secret-type `adminPassword` and `jwtSecret` values. |
| `api/package.json` | `test:security` and `test:security:limits` Postman CLI scripts. |

Neither JSON file contains a password, signing secret or captured token. Test-account passwords and request keys are generated for each run.

## Two cycles

The rate limiters keep their counters in API process memory, per client IP. A test that exhausts a limiter makes every later request to that route return `429` until the window expires, so the suite is split into two cycles:

| Cycle | Command | Folder | Rate-limit use |
|---|---|---|---|
| Security matrix | `npm run test:security` | `Security Matrix` (01–09) | Stays inside every allowance. |
| Rate limits | `npm run test:security:limits` | `Rate Limits` (10–13) | Exhausts the booking, registration and login allowances. |

**Each cycle needs its own freshly started API process.** Do not run the two cycles back to back on the same process, and do not run the Part 2 collection on that process first. Both cycles verify this themselves: the first administrator or client login must report `RateLimit-Remaining: 4`, the first registration `9`, and the first booking request `9`. Otherwise the run stops with `Start a fresh API process: ...`.

### Budget per cycle

| Limiter (per IP) | Allowance | Matrix use | Matrix margin | Limits cycle use |
|---|---|---|---|---|
| Registration, `POST /api/auth/register`, counts every request | 10 per hour | 5 (four fixture accounts and one admin-role attempt) | 5 | 1 account, then invalid bodies until `429` |
| Login, `POST /api/auth/login`, counts failed requests only (any status of 400 or above) | 5 failures per 15 minutes | 1 (NoSQL operator email) | 4 | 5 wrong passwords, then `429` |
| Booking, `POST /api/bookings`, counts every request that passes the JWT and client-role checks | 10 per 15 minutes | 8 | 2 | 10 rejected probes, then `429` |

Malformed or oversized JSON is rejected before any route limiter runs. Missing, invalid or revoked JWTs and wrong roles are rejected before the booking limiter. These requests use no allowance.

In the matrix, every response that carries `RateLimit-Remaining` must show at least `1`, so any change that pushes the matrix towards a limit fails the run instead of making it flaky.

## Coverage matrix

| Threat | Requests (folder) | Expected result |
|---|---|---|
| Missing JWT | `Auth - Missing Authorization Header`, `Session - Logout Without JWT` (02, 03) | `401 Authentication required` |
| Malformed `Authorization` header | Basic scheme, `Bearer` with no token, extra segment (02) | `401 Invalid authentication token` |
| Garbage token | `Auth - Malformed JWT` (02) | `401 Invalid or expired authentication token` |
| Forged privilege (payload edited, old signature kept) | `Auth - Tampered Role Claim Keeps Old Signature` on `/api/admin/users` (02) | `401 Invalid or expired authentication token` |
| Token signed with the wrong secret | `Auth - Wrong Signing Secret` (02) | `401` |
| Unsigned `alg: none` token | `Auth - Unsigned alg none Token` (02) | `401` |
| Expired token with a valid signature | `Auth - Expired Token With Valid Signature` (02) | `401`; the control below proves only the expiry differs |
| Minting control | `Auth - Control Minted Token Accepted` (02) | `200` on `/api/auth/me` as Client B |
| Claims that bypass revocation or the role check | Token without `sessionVersion`, with a future `sessionVersion`, with a correctly signed `admin` role for a client, or for an unknown user ID (02) | `401` (the role claim is checked against MongoDB, not trusted) |
| Session replay after logout | Two Client A tokens; logout with the first; both used again on `/me`, a booking and a second logout (03) | Logout `200`; every reuse `401`; no booking created |
| Recovery after logout | `Session - Fresh Login After Logout` (03) | `200`, new token with `sessionVersion` 1 |
| JWT content | Every successful login (01, 03, 10) | Claims are exactly `id`, `role`, `sessionVersion`, `iat`, `exp`; lifetime at most one hour |
| Self-assigned administrator | `Role - Self-assigned Admin Registration Rejected` (04) | `400 Role must be client or freelancer` |
| Role isolation | Client to admin routes, gig creation, income and freelancer bookings; freelancer to admin users, booking and client bookings; admin to booking and gig creation (04) | `403 Access denied`; the gig survives the rejected removal |
| Cross-account reads | Client B reads Client A's booking; histories and income of the other accounts (05) | `404 Booking not found`; lists and income contain only the caller's records |
| Cross-account writes | Freelancer B updates or deletes Freelancer A's gig (05) | `404 Gig not found`; G1 unchanged afterwards |
| Booking replay | Same `Idempotency-Key`, same gig (06) | `200`, `replayed: true`, same booking ID, transaction ID and `createdAt` |
| Re-cased key | Upper-case form of the same key (06) | Treated as the same key: `200` replay, no duplicate |
| Altered booking with a reused key | Same key, different gig (06) | `409 Idempotency-Key has already been used for a different booking`; Client A still has exactly one booking |
| Key scope | Client B sends Client A's key for the same gig (06) | `201` with a separate booking and transaction |
| Missing, non-v4 or body-supplied key | (06) | `400 A valid UUID v4 Idempotency-Key header is required`, or `400 Booking request contains unsupported fields` for a key in the body |
| Financial consistency | `Idempotency - Freelancer A Income Counts Two Transactions` (06) | Exactly two transactions after all replays and conflicts |
| Malformed and oversized bodies | Malformed JSON on login and booking, 12 KB body (07) | `400 Request body is not valid JSON`; `413 Request body too large` |
| NoSQL operators and smuggled operators | `$gt` login email, `$ne` gig title, `$gt` gig price, `$set` gig body, `__proto__` key, operator object in a path ID (07) | Fixed `400` messages; G1 unchanged afterwards |
| Invalid identifiers and unknown routes | Invalid gig, booking and admin gig IDs; unknown route; unsupported `PATCH` (07) | Fixed `400` messages; `404 Route not found` |
| Security headers | `/health` and a `404` response (08) | CSP directives (`default-src`, `script-src`, `style-src`, `img-src`, `connect-src` with the client origin, `object-src 'none'`, `base-uri`, `frame-ancestors 'none'`, no `unsafe-*` or wildcard), HSTS of at least 180 days, `X-Frame-Options`, `Referrer-Policy`, CORP, COOP, `X-Permitted-Cross-Domain-Policies` |
| Spoofed correlation ID | `X-Request-ID` supplied by the caller (08) | Response carries a server-generated UUID instead |
| CORS | Trusted and untrusted origins, booking preflights including `Idempotency-Key` (08) | Trusted origin allowed and can read `Retry-After`; untrusted origin never reflected and never `*` |
| Stored markup | Gig created with `<script>`, `<img onerror>`, `<b>` and `<i>` markup; markup-only title update (08) | Stored text has no markup; markup-only title `400` |
| Booking validation probes and booking limiter | Short key, NoSQL `gigId`, price and owner overrides, then invalid gig IDs until `429`, then a forged `X-Forwarded-For` (11) | Probes `400` with `RateLimit-Remaining` 9, 8, 7; `429` with `RateLimit-*` and `Retry-After`; the forwarded header does not reset the limit |
| Registration limiter | Invalid registrations until `429`; a valid sign-up with a forged `X-Forwarded-For` (12) | `429 Too many registration attempts. Please try again later.`, `w=3600`; no account created |
| Login brute force | Wrong passwords until `429`; forged `X-Forwarded-For`; the correct password (13) | `429 Too many authentication attempts. Please try again later.`, also for the correct password |

Folder 09 removes the fixture gigs through the administrator route and confirms that the booking history survives.

## How the expired and forged tokens are made

The pre-request script mints tokens with CryptoJS, which is built into the Postman and Newman sandbox. It decodes Client B's real login token and reuses its `id`, `role` and `sessionVersion`, so only the property under test changes. Header and payload are base64url-encoded without padding (`+` and `/` become `-` and `_`), and signed with HMAC-SHA256 using the runtime `jwtSecret`.

- The **expired** token has `iat` two hours and `exp` one hour in the past.
- The **control** token is minted the same way with `exp` ten minutes in the future and must return `200`. If it does not, the minting is wrong and the run stops before any expiry assertion is trusted.
- During setup, the suite re-signs Client B's real token with `jwtSecret` and compares the signature. A wrong secret stops the run with `jwtSecret does not match the API JWT_SECRET`, without printing token material.

`jwtSecret` must be the `JWT_SECRET` of the API process under test. It is passed only on the command line and is never written to a file. If it is missing, the run makes one harmless `/health` request, reports a single guard error and stops. The same applies to a missing `adminPassword`.

## Fixtures required

- A freshly started API with `USE_HTTPS=true` at `https://localhost:4000`, and the certificate `api/certs/localhost-cert.pem` with `DNS:localhost` in its subject alternative names (see the root `README.md`).
- MongoDB with transaction support: Atlas, or a local single-node replica set. Booking creation uses `session.withTransaction()`.
- The provisioned administrator `admin.demo@hustlehub.test` in that database. Register it as a client, then set `role: "admin"` in MongoDB; there is no provisioning API.
- `CLIENT_ORIGIN` in `api/.env` matching `clientOrigin`, normally `http://localhost:5173`.
- `JWT_EXPIRES_IN=1h` or shorter. The suite rejects longer token lifetimes.
- Dependencies installed in `api` (`npm ci`), which includes Postman CLI 1.76.0.

## Run it (PowerShell 7, from the `api` folder)

Terminal 1 starts the API. Stop and restart it (`Ctrl+C`, then the same command) before **each** cycle:

```powershell
npm start
```

Terminal 2 runs the security matrix. The first statement reads `JWT_SECRET` from `api/.env` into a shell variable, so the secret is not typed or stored. Replace `<admin-password>`; the single quotes keep characters such as `$` literal:

```powershell
$jwt = ((Get-Content .env | Select-String -Pattern '^JWT_SECRET=').Line -split '=', 2)[1].Trim().Trim('"'); npm run test:security --silent -- --env-var 'adminPassword=<admin-password>' --env-var "jwtSecret=$jwt"
```

Restart the API in terminal 1, then run the rate-limit cycle in terminal 2:

```powershell
npm run test:security:limits --silent
```

Keep `--silent`: without it npm echoes the full command line, including the `--env-var` values.

Expected results with zero failures:

| Cycle | Request definitions | Executed requests | Assertions | JUnit report |
|---|---:|---:|---:|---|
| Security matrix | 103 | 103 | 278 | `evidence/part3/security-tests/security-matrix.xml` |
| Rate limits | 13 | 34 | 102 | `evidence/part3/security-tests/security-limits.xml` |

The rate-limit loops repeat their request until the limiter blocks it, which is why the limits cycle executes more requests than it defines. Postman CLI exits with a non-zero code on any failure.

To run in the Postman app, import both JSON files, enter `adminPassword` and `jwtSecret` as local current values only, run **one** top-level folder per fresh API process with **Keep variable values** enabled, and do not export the environment with those values filled in.

## Determinism

- Each cycle registers new accounts with unique emails and a generated password, so no run depends on earlier data.
- The fresh-start checks and the matrix's `RateLimit-Remaining` assertion stop the run with a clear message instead of producing a run that passes or fails depending on earlier traffic.
- The rate-limit cycle asserts exact remaining counts (9, 8, 7) and bounds every loop by the configured limit.
- The first failed assertion stops the run, so later requests never run against missing state. Each folder also checks that the previous folder finished in the same cycle.
- Token times are relative to the collection-runner host clock. The API and runner should share a clock; the control token tolerates up to ten minutes of skew.
- Each cycle leaves its test accounts and two bookings with their transactions (matrix) in the database, as the Part 2 suite does. The fixture gigs are removed.

## Not covered

- **Concurrent duplicate submissions.** The CLI sends requests one at a time, so two simultaneous bookings with the same key are not exercised here. The unit suite covers the logic with doubles; a live race needs parallel requests against a replica set.
- **Deleted accounts and changed roles.** No API route deletes a user or changes a role, so these `401` paths remain covered by `api/test/sessionRevocation.test.js`.
- **`500 Authentication service unavailable`** requires a database outage and is covered by the unit tests.
- **Signing algorithm.** `verifyToken` does not pin `algorithms`, so a token signed with the same secret using HS384 or HS512 is accepted. This needs the secret and is not asserted by the suite.
- React document CSP and browser behaviour, which the API suite cannot observe.

## Continuous integration (P3-16)

The GitHub Actions workflow runs the security matrix and rate-limit folder on **separate disposable Docker Compose stacks**, each with its own MongoDB replica set, HTTPS certificate, JWT secret and administrator fixture. The CLI uses local collection files and `--report-events=false`. It verifies the generated public certificate without disabling TLS checks, rejects missing or skipped requests, and emits only sanitized pass/fail artifacts under `ci-output/`. There are no production database secrets or assessment credentials in CI.

Run from the repository root to reproduce these two suites on a machine with Docker Desktop running:

```bash
node scripts/ci/integration.mjs security
node scripts/ci/integration.mjs limits
```

The archived Newman evidence remains unchanged. Fresh CI reports use generated case identifiers and do not replace the submitted screenshots or JUnit files.
