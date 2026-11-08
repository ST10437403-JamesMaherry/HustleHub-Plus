# Threat-to-Control Security Review (P3-17)

This review maps the threats to HustleHub+ to the controls that address them, as implemented on `dev` after the DevSecOps pipeline (P3-16) was merged. It separates the controls built in Parts 1 and 2 from the two security features added in Part 3:

- **Session revocation (P3-05):** a server-side session version that invalidates JWTs on sign-out.
- **Booking replay protection (P3-06):** an `Idempotency-Key` per booking attempt, backed by a unique index and a database transaction.

Other Part 3 work that adds or strengthens controls is labelled with its issue: structured logging (P3-07), Grafana Cloud monitoring (P3-08), containers (P3-09 to P3-11), the security test suite (P3-13), static analysis (P3-15) and CI (P3-16).

## Method

- **Trust boundaries** come from the [architecture document](../architecture/hustlehub-architecture.md) and the Part 3 deployment (containers, Grafana Cloud, GitHub Actions and SonarQube Cloud).
- **STRIDE** classifies each threat: **S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege.
- **OWASP Top 10:2025** gives each threat a category. The 2025 edition is current, so its IDs are used (Injection is A05, not the 2021 A03).
- **Part** shows when a control was introduced: *Part 1/2* for the original controls, or the Part 3 issue number.
- Only controls that exist in the code or configuration are listed. A threat without a full control is carried into the residual risks.

OWASP Top 10:2025 categories used: A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions.

## Trust boundaries

| ID | Boundary | What crosses it |
|---|---|---|
| B1 | Browser to frontend and API | Static SPA files, API requests, credentials and Bearer JWTs |
| B2 | Request to application logic | JSON bodies, path parameters and headers |
| B3 | Anonymous to authenticated | Credentials in, signed JWT out; JWT back on every protected request |
| B4 | Authenticated user to resources | Role- and ownership-bound reads and writes, including bookings |
| B5 | API to MongoDB | Validated queries, booking and transaction writes |
| B6 | API to Grafana Cloud | Structured log events over HTTPS with a write-only token |
| B7 | Source code to CI, analysis and images | Commits, dependencies, GitHub Actions, the Sonar token and container images |
| Source | Sources used to compile this list

## Threat-to-control matrix

### B1: Browser to frontend and API

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T01 | Credentials or JWTs intercepted in transit | I | A04 | API served only over HTTPS; HSTS set by Helmet | `api/index.js` | Part 1/2 |
| T02 | A hostile website reads API responses in a victim's browser | I | A02 | CORS allows only `CLIENT_ORIGIN`, a fixed method list and named request headers | `api/index.js` | Part 1/2; `Idempotency-Key` header added in P3-06 |
| T03 | Clickjacking of the application | T | A02 | API CSP `frame-ancestors 'none'`; frontend Nginx sends `X-Frame-Options: DENY` | `api/index.js`, `client/nginx/default.conf` | Part 1/2; Nginx in P3-10 |
| T04 | Server fingerprinting to target known flaws | I | A02 | `X-Powered-By` disabled; Nginx `server_tokens off` | `api/index.js`, `client/nginx/default.conf` | Part 1/2; Nginx in P3-10 |
| T05 | Stored XSS through gig text, used to steal the session token | T, I | A05 | Gig text sanitised before validation; React renders text through JSX escaping; restrictive API CSP | `api/middleware/sanitizeInput.js`, client components | Part 1/2 |

### B2: Request to application logic

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T06 | Oversized or malformed bodies exhaust or crash the API | D | A10 | `express.json` limit of 10kb; malformed JSON returns 400, oversized bodies 413 | `api/index.js`, `api/middleware/errorHandler.js` | Part 1/2 |
| T07 | NoSQL operator injection (for example an object in place of an email) | T, I | A05 | Validators accept only primitive strings and rebuild `req.body`; ObjectId checks before lookups; email lookups use `String(email)` | `api/middleware/validate*.js`, `api/controllers/authController.js` | Part 1/2; hardened in P3-15 |
| T08 | Mass assignment of owner, price or unexpected fields | T, E | A01 | Allowlist validators forward only known fields; gig creation copies named fields; ownership taken from the JWT | `api/middleware/validateGig.js`, `api/middleware/validateBooking.js`, `api/controllers/gigController.js` | Part 1/2; hardened in P3-15 |
| T09 | Regular expression denial of service (ReDoS) | D | A06 (closest) | Linear-time email pattern; length checks; trailing-slash trim without a regex | `api/middleware/validate*.js`, `api/models/User.js`, `api/middleware/requestContext.js` | P3-15 |
| T10 | Error responses reveal stack traces or internals | I | A10 | Central error handler returns bounded, generic JSON; details stay server-side | `api/middleware/errorHandler.js` | Part 1/2 |

### B3: Anonymous to authenticated

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T11 | Password brute force or credential stuffing | S | A07 | Login limiter: 5 failed attempts per 15 minutes per IP; successful logins not counted | `api/middleware/rateLimiters.js` | Part 1/2 |
| T12 | Account enumeration through login responses | I | A07 | Unknown accounts and wrong passwords get the same `Invalid credentials` | `api/controllers/authController.js` | Part 1/2 |
| T13 | Offline cracking of leaked password hashes | I | A04 | bcrypt with a work factor of 12 (configurable, minimum 10); 72-byte password limit enforced | `api/utils/password.js`, validators | Part 1/2 |
| T14 | Self-registration as an administrator | E | A01 | Registration accepts only the `client` and `freelancer` roles | `api/middleware/validateRegistration.js` | Part 1/2 |
| T15 | Forged or altered JWTs | S, E | A07 | Signature and expiry verified with the server-only secret before any claim is used | `api/utils/token.js`, `api/middleware/authMiddleware.js` | Part 1/2 |
| T16 | A stolen or copied JWT is replayed after sign-out | S | A07 | Each JWT carries `sessionVersion`; every protected request compares it with the user's current version in MongoDB; sign-out increments the version atomically, revoking all earlier tokens | `api/middleware/authMiddleware.js`, `api/controllers/authController.js`, `api/models/User.js` | **P3-05** |
| T17 | A deleted account or demoted role keeps access until token expiry | E | A01 | The middleware reloads the user and requires the stored role to match the token | `api/middleware/authMiddleware.js` | **P3-05** |

### B4: Authenticated user to resources

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T18 | Reading or changing another user's gigs, bookings or income (IDOR) | I, T | A01 | `protect` and `authorizeRoles` on every protected route; ownership taken from the JWT and included in every query | `api/routes/*.js`, `api/controllers/*.js` | Part 1/2 |
| T19 | A client changes the booking price or owner | T | A01 | Booking body accepts only `gigId`; price and freelancer come from the stored gig | `api/middleware/validateBooking.js`, `api/controllers/bookingController.js` | Part 1/2 |
| T20 | A retried or replayed booking request creates duplicate financial records | T, R | A06 | UUID v4 `Idempotency-Key` required; unique `{client, requestKey}` index; same key and gig returns the original record (200), a different gig returns 409 | `api/models/Booking.js`, `api/controllers/bookingController.js`, `client/src/components/bookings/BookGigAction.jsx` | **P3-06** |
| T21 | Booking flood | D | A06 | Booking limiter: 10 per 15 minutes, applied after authentication | `api/middleware/rateLimiters.js` | Part 1/2 |
| T22 | A user denies a sign-in or booking took place | R | A09 | One allowlisted JSON event per security-relevant outcome, with a server-generated request ID | `api/utils/logger.js`, `api/middleware/requestContext.js` | P3-07 |

### B5: API to MongoDB

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T23 | A booking is saved without its transaction, or the reverse | T | A08 | Booking and simulated transaction written in one `session.withTransaction()`; unique index on `Transaction.booking` | `api/controllers/bookingController.js`, `api/models/Transaction.js` | Part 1/2; replay handling in P3-06 |
| T24 | Database credentials exposed | I | A02 | `MONGO_URI` exists only in the server environment; the frontend never connects to MongoDB; CI uses a disposable local replica set with no published port | `api/config/db.js`, `compose.ci.yaml`, `scripts/ci/integration.mjs` | Part 1/2; CI isolation in P3-16 |

### B6: API to Grafana Cloud

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T25 | Passwords, tokens or personal data written to logs | I | A09 | Event names, outcomes and fields are allowlisted; no IPs, emails, bodies or tokens are logged | `api/utils/logger.js` | P3-07 |
| T26 | The log-shipping token is stolen and misused | S, T | A02 | Access policy limited to `logs:write`; token kept in `.env` only; expiry set | `api/utils/lokiTransport.js` | P3-08 |
| T27 | Attacks go unnoticed | R | A09 | Grafana dashboard panels for sign-in failures, booking outcomes, errors and request correlation | `docs/monitoring/grafana-dashboard.json` | P3-08 |

### B7: Source code to CI, analysis and images

| ID | Threat | STRIDE | OWASP | Control | Implemented in | Part |
|---|---|---|---|---|---|---|
| T28 | Secrets committed to the repository | I | A02 | `.env` files ignored; example files contain blank secrets; test passwords passed at run time; CI generates disposable secrets and stores only `SONAR_TOKEN` | `.gitignore`, `.env.example` files, `postman/*environment.json`, `.github/workflows/ci.yml` | Part 1/2; P3-13, P3-16 |
| T29 | Known-vulnerable dependencies | T, E | A03 | CI audits `api`, `client` and `e2e` separately and fails on high or critical advisories | `.github/workflows/ci.yml` (dependencies job) | P3-16 |
| T30 | Insecure or defective code merged | T | A06, A08 | SonarQube Cloud analysis with a blocking quality gate on `dev` and PRs into `dev`; unit, API, security and browser suites; a final CI gate that fails on any failed or skipped required job | `sonar-project.properties`, `.github/workflows/ci.yml`, `scripts/ci/gate.cjs` | P3-15, P3-16 |
| T31 | A compromised workflow step or untrusted PR steals secrets | T, E | A03 | Actions pinned to full commit SHAs; `permissions: contents: read`; checkout without persisted credentials; Sonar job refuses fork PRs | `.github/workflows/ci.yml` | P3-16 |
| T32 | Container compromise leads to host access or exposed services | E, I | A02 | Non-root API and Nginx images; ports bound to `127.0.0.1`; TLS key only in a named volume readable by the API user | `api/Dockerfile`, `client/Dockerfile`, `compose.yaml` | P3-09 to P3-11 |

### Sources

https://top10.owasp.org/2025/