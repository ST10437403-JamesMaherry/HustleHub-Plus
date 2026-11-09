# Part 3 demonstration runbook

A chronological script for recording the final HustleHub+ demonstration video. It covers the Part 3 requirement to show authentication, gig creation, booking and transaction recording, plus the income and tax dashboard, the security features and the DevSecOps evidence. Target length: about 12 minutes. Each step names the rubric criterion it supports. Timings are guides.

Supporting evidence: [`evidence/part3/README.md`](../../evidence/part3/README.md).

## Before recording (not filmed)

1. **Stack.** Start the containerised stack (`docker compose up --build`) and wait until both services are healthy. If the Docker demonstration is recorded separately, use a freshly started local API (`npm --prefix api start`) and frontend (`npm --prefix client run dev`) instead.
2. **Fresh limits.** Restart the API so every rate-limit counter starts at zero.
3. **Demonstration accounts.** Do not reuse any account whose password has been shared. Register two new accounts on camera (step 2), using `@hustlehub.test` addresses and a password you do not show.
4. **Screen hygiene.** Close `api/.env`, `.env`, Atlas connection strings, Grafana tokens and password managers. Use a browser profile with no saved passwords. Turn off notifications.
5. **Tabs ready:** the app (`http://localhost:5173`), GitHub Actions (latest passing run on `dev`), SonarQube Cloud project overview, the Grafana dashboard, and the repository open at `README.md`.
6. **Terminal ready:** repository root, font size increased.

## Script

| # | Time | Show | Say / point out | Rubric |
|---:|---|---|---|---|
| 1 | 0:00 | Repository root, README contents and group members | HustleHub+ is a secure freelance marketplace. Part 3 adds tax estimation, CI/CD, static analysis, Docker, logging and our own security features. | README update |
| 2 | 0:45 | **Register** a freelancer, then a client (Create account → role → details) | Public registration offers only client and freelancer. Administrators are provisioned separately. Passwords are bcrypt-hashed. | Auth (carried from Parts 1–2) |
| 3 | 1:45 | **Sign in** as the freelancer. Open DevTools → Application → Session Storage | The JWT is stored in `sessionStorage`, not cookies or `localStorage`, and travels over HTTPS. | Auth |
| 4 | 2:15 | **My gigs → Publish gig**, for example "Brand Strategy Workshop", R250 000.00 | Ownership comes from the JWT. Input is validated and sanitised server-side. | Gig creation |
| 5 | 3:00 | Sign out → sign in as the **client** → search the marketplace → **Book this gig → Confirm booking** | The booking sends an `Idempotency-Key`. One booking creates exactly one simulated transaction in a MongoDB transaction. | Booking + transaction |
| 6 | 3:45 | **My bookings** (reference and amount). Optionally, the Atlas `bookings` and `transactions` collections, connection string hidden | The booking and its transaction are persisted and linked to both users. | Transaction recording |
| 7 | 4:30 | Sign out → sign in as the **freelancer → Dashboard** | Total income, income this tax year (2026/27), **illustrative annual tax**, the projection explanation and the March–February monthly bars. | **Tax + income dashboard** |
| 8 | 5:15 | `docs/finance/tax-estimation.md` | Year-to-date income is annualised (× 365 ÷ elapsed days), SARS 2026/27 brackets are applied and the R17 820 primary rebate is subtracted. Worked example: R250 000 on day 252 → R362 103.17 → **R56 718.82**. Illustrative only. | Tax logic explained |
| 9 | 6:00 | **Sign out**, then in a terminal call `/api/auth/me` with the old token copied before sign-out (or show the Playwright test) | Sign-out revokes the session on the server, so a stolen JWT stops working. | **Own security feature 1** |
| 10 | 6:30 | `docs/security/booking-idempotency.md` and the replay result in `evidence/part3/newman/financial-assertions.png` | A replayed booking with the same key returns the original booking and does not double-charge or double-count income. | **Own security feature 2** |
| 11 | 7:00 | Terminal: `npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'` (type the password off-screen or paste it from a hidden variable) | 120 requests: functional, financial and negative cases. Zero failures, JUnit report written. | Testing |
| 12 | 8:00 | `npm --prefix e2e test` (restart the API first) | Real Chromium against the HTTPS API: the journey, the dashboard tax figure checked against an independent calculation, and failure paths. | Testing |
| 13 | 8:45 | **GitHub Actions**: the latest passing run and its jobs | Install, unit tests, Newman, Playwright and build for API and client. Then show a failed run to prove the pipeline fails when a test fails. | **CI/CD** |
| 14 | 9:45 | **SonarQube Cloud** overview and `static-analysis` evidence | Quality gate passed. Explain one issue that was fixed and the accepted issues, with their justification. | **Static analysis** |
| 15 | 10:30 | `docker compose ps` and the two Dockerfiles | Both containers are healthy. The API serves HTTPS inside Compose and the client is served by nginx. | **Docker** |
| 16 | 11:00 | **Grafana** dashboard and the Explore privacy query | Login attempts, bookings, transactions and errors are logged as structured events. No passwords, tokens or emails are logged. | **Logging** |
| 17 | 11:45 | README security review section | Threat-to-control mapping: injection, XSS, authentication weaknesses, access control. | Security review |
| 18 | 12:15 | Close | Recap: features, security, testing, pipeline, monitoring. | — |

## Fallbacks

| Problem during recording | Do this |
|---|---|
| `429 Too many ...` | The limiter counted earlier attempts. Restart the API and continue from the last step. |
| Browser cannot reach the API | Re-trust `api/certs/localhost-cert.pem` or open `https://localhost:4000/health` once. Check that `CLIENT_ORIGIN` matches. |
| Dashboard shows R0 | Make sure the booking was made against the freelancer's own gig, then use **Refresh data**. |
| A pipeline run is still in progress | Show the most recent completed passing run. |

## Final QA checklist

Complete these checks before submission. The first block was verified against the `dev` snapshot of 9 November 2026. The second block requires a team member's machine or accounts.

**Verified**

- [x] Every relative link and heading anchor in all repository Markdown files resolves (0 broken).
- [x] Every committed JUnit report has 0 failures and 0 skipped: functional Newman, security matrix, security limits, Playwright (7), API unit (98), client Vitest (28).
- [x] The totals in the evidence index and README match the CLI summary screenshots (335, 278, 102 assertions). The JUnit testcase counts differ, as explained in the [evidence index](../../evidence/part3/README.md#test-results).
- [x] Part 3 screenshots checked for secrets. One administrator password was visible on a command line and has been redacted (see [Redactions](../../evidence/part3/README.md#redactions)). No JWTs, connection strings, `.env` contents or Grafana tokens are visible. The Grafana stack name and request IDs are not secrets.
- [x] Every `npm` command in this runbook and the evidence index exists in the relevant `package.json`.

**Still to do (team)**

- [ ] **Rotate the assessment administrator password** in Atlas (re-register, or replace the hash) and share the new one with the marker outside the repository. The old password was committed earlier and appeared in a screenshot.
- [ ] **Docker evidence:** run `docker compose up --build -d`, wait about a minute, then capture `docker compose ps` (both services `healthy`) as `evidence/part3/docker/compose-ps.png` and `curl.exe -k https://localhost:4000/health` as `evidence/part3/docker/api-https-health.png`. Then replace the *Pending* text in the evidence index and the README Part 3 rubric row with links to those files.
- [ ] **Record the video** using the script above, check it for secrets, and add the link to the README **Demonstration Video** section.
- [ ] Update the *Group Contributions* note once P3-19 and P3-20 are closed.

## After recording

- Watch the full video for any visible secret (connection string, token, password, `.env` contents). Re-record that section if one appears.
- Add the video link to the root README's **Demonstration Video** section.
- Remove or disable the demonstration accounts after marking, as already stated for the assessment credentials.
