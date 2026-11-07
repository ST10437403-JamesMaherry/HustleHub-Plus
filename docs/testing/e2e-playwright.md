# Real-browser integration tests (Playwright)

## Purpose

The Vitest suite in `client/src/test` renders React components in jsdom with mocked API responses. It cannot show that the real frontend, the HTTPS API and MongoDB work together in a browser.

The Playwright suite in [`e2e/`](../../e2e/) fills that gap. It drives Chromium through the running React application against the running HTTPS API and its database. Nothing is mocked. Each assertion checks what a user sees, and the important figures are cross-checked against the API and an independent tax calculation.

## Coverage

| Spec | Test | What it proves |
|---|---|---|
| `marketplace-journey.spec.js` | Freelancer registers, signs in and publishes a gig | The registration form (freelancer role) redirects to sign-in with the email prefilled. Sign-in stores a JWT in `sessionStorage` and lands on **Your gigs**. The gig form publishes a gig with the correct price. |
| | Client finds the gig, confirms a booking and sees it in history | Marketplace search, the booking confirmation step (simulated payment notice), the confirmation with reference and amount, and the **My bookings** row. The API confirms exactly one persisted booking with the same reference and amount. |
| | Freelancer dashboard shows the income and illustrative tax | Total income, transaction count, income this tax year and illustrative annual tax are displayed exactly. They match the API **and** an independent SARS 2026/27 calculation ([`support/sars-oracle.js`](../../e2e/support/sars-oracle.js)), with tax above zero. Also checks the annualised figure in the explanation, the 12-month breakdown and the recent booking. |
| | Sign-out revokes the session | **Sign out** calls `POST /api/auth/logout` and removes the JWT. A copy of the old JWT is then rejected by the API with `401` (server-side session revocation), and `/freelancer/dashboard` and `/freelancer/gigs` redirect to sign-in. |
| `access-control.spec.js` | A wrong password is rejected **(failure path)** | Shows `Email or password is incorrect.`, stays on `/login`, clears the password field and stores no JWT. |
| | A client cannot open freelancer pages **(failure path)** | No **Dashboard** link for clients. A direct visit to `/freelancer/dashboard` shows **Access denied.** with no financial data. |
| | Visitors are sent to sign in | An anonymous visit to `/bookings` redirects to `/login`. |

The gig is priced at R250 000 so that the projected annual income reaches a taxable bracket. The non-zero tax path is therefore exercised in a real browser. (The functional Postman suite's R800.25 booking stays below the tax threshold.)

## Isolated, repeatable data

- Every run creates new accounts: `e2e.client.<runId>@hustlehub.test` and `e2e.freelancer.<runId>@hustlehub.test`, each with a random password generated in memory. Passwords and JWTs are not written to the JUnit report or the evidence screenshots. Playwright's local HTML report and failure traces do record typed values, so they stay in the git-ignored `e2e/playwright-report/` and `e2e/test-results/` folders and are never committed as evidence.
- The suite never signs in as, edits or deletes any existing user, including the assessment administrator.
- After the journey, the fixture gig is deleted by its own freelancer so it does not remain in the public marketplace. The booking and transaction remain, because the application deliberately preserves financial history.
- `E2E_BASE_URL` and `E2E_API_URL` must be local origins. The configuration refuses remote addresses so the suite cannot write to a deployed system.
- For full separation from assessment data, point the API at a separate database for browser-test runs, for example `.../hustlehub_e2e?...` in `MONGO_URI`.

## Certificate strategy (test only)

The API uses a self-signed local certificate. The suite does **not** use `ignoreHTTPSErrors` and does not disable TLS anywhere in application code:

- **Browser:** `playwright.config.js` computes the SHA-256 hash of the public key in `api/certs/localhost-cert.pem` and launches only the test browser with `--ignore-certificate-errors-spki-list=<hash>`. Chromium accepts that one key and still rejects every other untrusted certificate.
- **Node fixtures:** `support/api.js` passes the same file as the `ca` for HTTPS requests, so certificate verification stays on.
- If the API presents a different certificate, global setup stops with `presented a certificate that does not match`.

## Setup

Requirements: Node.js 20+, the API configured as described in the root `README.md` (MongoDB replica set or Atlas, `USE_HTTPS=true`, the local certificate), and the client dependencies installed (`npm --prefix client ci`).

Install the suite and its browser once:

```bash
npm --prefix e2e ci
npm --prefix e2e run install:browser
```

On Windows, `install:browser` downloads Chromium only. The `--with-deps` system packages apply to Linux, including GitHub Actions.

### Configuration

All settings are optional environment variables.

| Variable | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` | Frontend origin. Playwright starts Vite there unless a frontend is already listening. |
| `E2E_API_URL` | `https://localhost:4000` | API origin, used for `VITE_API_URL` and the fixtures. |
| `E2E_CA_CERT` | `../api/certs/localhost-cert.pem` | Certificate to trust, relative to `e2e/`. |
| `E2E_SKIP_WEBSERVER` | unset | Set to `1` when the frontend is started separately (for example by Docker Compose). |
| `E2E_CHROMIUM_PATH` | unset | Use a preinstalled Chrome/Chromium instead of the Playwright download. |

`CLIENT_ORIGIN` in `api/.env` must equal `E2E_BASE_URL`.

## Run locally

1. **Terminal 1:** start a **fresh** API process:

   ```bash
   npm --prefix api start
   ```

2. **Terminal 2:** run the suite from the repository root:

   ```bash
   npm --prefix e2e test
   ```

   Playwright starts Vite on port 5173 with `VITE_API_URL=https://localhost:4000` if nothing is listening there. Otherwise it reuses the running frontend.

| Command | Use |
|---|---|
| `npm --prefix e2e test` | Headless run. Exits non-zero if any test fails. |
| `npm --prefix e2e run test:headed` | Watch the browser while it runs. |
| `npm --prefix e2e run test:evidence` | Same run, writing the JUnit report and step screenshots to `evidence/part3/e2e/`. |
| `npm --prefix e2e run report` | Open the last local HTML report. |

Failures keep a screenshot and a trace in `e2e/test-results/` (`npx playwright show-trace <trace.zip>`).

## Rate limits: one suite per API process

The limiters count per IP address in API memory. One browser-suite run uses 3 registrations, 1 failed login and 1 booking. The functional Postman suite needs almost the entire registration and booking quota of a fresh process, and Ewald's security suite checks for a fresh process.

**Start a fresh API process before each suite:** Playwright, the functional Newman collection or either security cycle. Do not chain them on one process.

## Continuous integration (P3-16)

The suite is designed to be called directly from GitHub Actions:

```yaml
- run: npm --prefix e2e ci
- run: npx --prefix e2e playwright install --with-deps chromium
# Start MongoDB (replica set) and a freshly started HTTPS API with a generated
# certificate and JWT secret, then:
- run: npm --prefix e2e test
  env:
    CI: "true"
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: |
      e2e/playwright-report
      e2e/test-results
```

`CI=true` makes `test.only` a failure. The command's exit code is the job result. The HTML report and traces contain the generated test-account passwords typed during the run, so keep those artifacts private with a short retention period, and use a disposable CI database. If Compose already serves the frontend on port 5173, either set `E2E_SKIP_WEBSERVER=1` or rely on the automatic reuse.

## Evidence

`npm --prefix e2e run test:evidence` writes:

- `evidence/part3/e2e/playwright-junit.xml`
- `evidence/part3/e2e/screenshots/01`–`07-*.png`: the published gig, the booking confirmation, booking history, the income and tax dashboard, the rejected login and the client access denial. All use generated test data.
