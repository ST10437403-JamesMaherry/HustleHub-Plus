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

## Verification evidence

Each threat links to the checks that exercise its control. *CI* means the check also runs in the P3-16 pipeline; integration suites run against a disposable Docker stack with a real MongoDB replica set.

| Threats | Automated check | CI | Evidence |
|---|---|---|---|
| T01-T04 | P3-13 security matrix, folder *08 Security Protections* (HTTPS, headers, CSP, CORS preflight) | `integration (security)` | `evidence/part3/security-tests/security-matrix.xml` |
| T05 | `api/test/requestValidation.test.js` (sanitisation removes markup); P3-13 folder *07 Malformed Input and Safe Errors* | `backend`, `integration (security)` | `evidence/part3/unit-tests/api-node-test.xml` |
| T06, T10 | `api/test/securityMiddleware.test.js` (malformed JSON, no exception details); P3-13 folder 07 | `backend`, `integration (security)` | `api-node-test.xml`, `security-matrix.xml` |
| T07 | `requestValidation.test.js` (NoSQL-operator and object-valued credentials rejected); `staticAnalysisFixes.test.js` (plain-string lookups); P3-13 folder 07 | `backend`, `integration (security)` | `api-node-test.xml`; Sonar rule S5147 closed (`evidence/part3/static-analysis/`) |
| T08, T19 | `requestValidation.test.js` (mass-assignment fields blocked); `securityMiddleware.test.js` (client-supplied price and ownership rejected); `staticAnalysisFixes.test.js` | `backend` | `api-node-test.xml`; Sonar rule S4684 closed |
| T09 | `staticAnalysisFixes.test.js` (50,000-character slash run, email edge cases) | `backend` | Sonar rule S8786 closed |
| T11, T21 | P3-13 rate-limit cycle, folders *11 Booking Limiter* and *13 Login Limiter*, each on a fresh API process | `integration (limits)` | `evidence/part3/security-tests/security-limits.xml` |
| T12 | Playwright *a wrong password is rejected without creating a session* | `integration (browser)` | `evidence/part3/e2e/screenshots/06-login-rejected.png` |
| T13, T14 | `requestValidation.test.js` (bcrypt byte limit, administrator self-registration blocked) | `backend` | `api-node-test.xml` |
| T15 | `securityMiddleware.test.js` (corrupted and expired tokens); P3-13 folder *02 Authentication and Forged Tokens* (forged, expired and altered JWTs) | `backend`, `integration (security)` | `security-matrix.xml` |
| T16, T17 | `api/test/sessionRevocation.test.js`; `client/src/test/logout.test.jsx`; P3-13 folder *03 Session Revocation*; Playwright *sign-out revokes the session* | `backend`, `frontend`, `integration (security, browser)` | `security-matrix.xml`, `evidence/part3/e2e/playwright-junit.xml` |
| T18 | P3-13 folders *04 Role Isolation* and *05 Cross-account Isolation*; Playwright *a client cannot open freelancer pages* | `integration (security, browser)` | `security-matrix.xml`, `e2e/screenshots/07-client-access-denied.png` |
| T20 | `api/test/bookingIdempotency.test.js` (replay, conflict, client scoping, concurrent submissions); `client/src/test/bookingIdempotency.test.jsx`; P3-13 folder *06 Idempotency Misuse* | `backend`, `frontend`, `integration (security)` | `security-matrix.xml` |
| T22, T25 | `api/test/logging.test.js` (allowlisted fields, server request IDs); Grafana privacy query | `backend` | `evidence/part3/logging/explore-request-correlation.png`, `privacy-check-no-results.png` |
| T23 | `bookingIdempotency.test.js` (failed transaction insert rolls back the booking); functional suite on a real replica set | `backend`, `integration (functional)` | `evidence/part3/newman/functional-report.xml` |
| T24, T32 | `scripts/composeConfig.test.mjs`, `client/docker/containerConfig.check.mjs`, `api/test/containerHealth.test.js`; integration runner checks non-root UIDs, `127.0.0.1` ports and the CI database URI | `configuration`, `integration (smoke)` | `docs/ci/devsecops.md` |
| T26, T27 | `api/test/lokiTransport.test.js` (unsafe settings disable shipping without printing the token); dashboard | `backend` | `evidence/part3/logging/dashboard-overview.png` |
| T28 | The P3-13 suite fails if any response contains a secret, password, connection string or internal field; Postman environments hold only empty secret values; CI generates its own secrets | `integration (security)`, workflow design | `docs/testing/security-postman-suite.md`, `docs/ci/devsecops.md` |
| T29 | `npm audit --audit-level=high` for `api`, `client` and `e2e` | `dependencies` | `evidence/part3/ci/github-actions-runs.png` |
| T30 | SonarQube Cloud quality gate; final CI gate | `sonar`, `gate` | `evidence/part3/static-analysis/`, `evidence/part3/ci/github-actions-runs.png` |
| T31 | Workflow review: SHA-pinned actions, read-only permissions, fork refusal step | Workflow design | `.github/workflows/ci.yml` |

**Recorded CI runs (HustleHub DevSecOps, 8 November 2026):** the pull-request run for #123 (run #4) and the `dev` run after the merge (run #5, commit `cac4305`) both completed successfully ([`evidence/part3/ci/github-actions-runs.png`](../../evidence/part3/ci/github-actions-runs.png)). Runs #1 and #2 on the same branch failed before the integration runner was fixed, which shows failures stop the workflow. The deliberate `failure_probe` run and its screenshots are still to come, as part of P3-16's evidence (see `evidence/part3/README.md`).

## Residual risks

These risks remain after the controls above. Each is either accepted for this assessment or has a named follow-up.

| ID | Risk | Threats | Why it remains | Mitigation or owner |
|---|---|---|---|---|
| R01 | **Payments are simulated.** No payment provider, card data or real money is involved. | T19, T20, T23 | Out of scope for the module. Replay protection guards the booking records, not a real charge. | A real deployment would need a PCI-compliant provider, using the provider's own idempotency support. |
| R02 | **TLS is local only.** The API uses a self-signed localhost certificate, and the frontend is served over plain HTTP on localhost. | T01 | Local development and assessment setup. | A public deployment needs a CA-issued certificate and HTTPS for the frontend as well. |
| R03 | **Tax figures are illustrative.** The estimate annualises year-to-date income against the SARS 2027 tables and is not tax advice. | n/a | A deliberate feature limitation, shown in the UI and API response. | See `docs/finance/tax-estimation.md`. |
| R04 | **JWT algorithm not pinned.** P3-13 showed that an HS512 token signed with the same secret is accepted. | T15 | Exploiting it needs the signing secret, so the practical risk is low, but RFC 8725 requires an explicit algorithm list. | Pass `algorithms: ['HS256']` to `jwt.verify` (James; also listed in `docs/ci/devsecops.md`). |
| R05 | **Token readable by XSS.** The JWT is kept in `sessionStorage`, and the SPA's Nginx config sends no Content-Security-Policy. | T05 | Sanitisation and React escaping reduce XSS risk but do not remove it. | Add a CSP to `client/nginx/default.conf`; consider an HttpOnly cookie design. |
| R06 | **Rate limits live in process memory.** Counters reset on restart, aren't shared between instances, and are kept per IP. | T11, T21 | Single-instance deployment. | A shared store (for example Redis) is needed before scaling out. Side effects: users behind one IP share a limit; after a lockout even the correct password is refused for 15 minutes; booking and registration limiters also count rejected (400) requests. |
| R07 | **Account enumeration through registration.** Registering an existing email returns 409. | T12 | Clear feedback for genuine users; limited to 10 attempts per hour. | Accepted. A generic response with email confirmation would remove it. |
| R08 | **Sign-out limits.** Sign-out ends every session on every device. If the sign-out request fails, the token stays valid until it expires (`JWT_EXPIRES_IN`, 1 hour in the example config). | T16 | Per-device sessions need a session store; the UI warns when server revocation isn't confirmed. | Accepted for Part 3. |
| R09 | **Monitoring without alerting.** Grafana shows dashboards but has no alert rules, and the log token is short-lived and must be renewed. | T27 | Dashboards were the P3-08 scope. | Add alert rules for repeated sign-in failures and API errors; renew the token before it expires. |
| R10 | **Demo password in Git history.** The old admin password was blanked in `postman/postman_environment.json` during P3-16, but earlier commits still contain it. | T28 | Removing a file value does not change history. | Rotate the administrator password (P3-18). |
| R11 | **Moderate and low advisories pass CI.** Only high and critical advisories fail the dependency job. | T29 | A deliberate threshold. | Review moderate findings at release (P3-20). |
| R12 | **Static-analysis scope.** `client/Dockerfile`, the Nginx config, the Compose files and `docker/` fall outside `sonar.sources`. The Free plan offers no custom gate and analyses only `dev`, and the Sonar token belongs to one team member's account. | T30 | Free-plan limits and the original source scope. | Add the infrastructure paths to `sonar.sources`; move to an organisation-owned token if the project continues. |
| R13 | **Concurrent bookings are tested with doubles.** Concurrent duplicate requests are covered by unit tests with database doubles. The API suites run against a real replica set but send requests one at a time. | T20, T23 | The suites are deterministic by design. | A concurrent load test against the CI stack. |
| R14 | **The CI gate only blocks if required.** The pipeline fails correctly, but merges are blocked only if `CI gate` is a required check in the branch rules, and that can't be confirmed from the source. | T29-T31 | Repository settings are outside the code. | Require `CI gate` on `dev` (repository owner). |
