# Part 3 evidence index

This folder holds the evidence for the Part 3 rubric (DevSecOps, Monitoring and Finalisation). Every file listed here comes from a real, successful run. Evidence that has not been produced yet is marked **Pending** with its owning issue. Nothing is fabricated or edited after the run. The only exception is redaction: one secret visible in a terminal capture was covered with a labelled `[REDACTED]` box. The result is unchanged, and the redaction is listed under [Redactions](#redactions).

None of these files contains account passwords, JWTs, `JWT_SECRET`, MongoDB connection strings or Grafana tokens. Test accounts use generated `@hustlehub.test` addresses.

The step-by-step demonstration that walks through this evidence is in [`docs/demo/part3-demonstration-runbook.md`](../../docs/demo/part3-demonstration-runbook.md).

## Rubric map

| Rubric criterion (marks) | Evidence in this folder | Implementation and explanation |
|---|---|---|
| Final features: tax + income dashboard (20) | [`e2e/screenshots/05-freelancer-income-tax-dashboard.png`](e2e/screenshots/05-freelancer-income-tax-dashboard.png), [`newman/financial-assertions.png`](newman/financial-assertions.png) | [`docs/finance/tax-estimation.md`](../../docs/finance/tax-estimation.md), [`docs/finance/income-api-contract.md`](../../docs/finance/income-api-contract.md) |
| CI/CD pipeline (20) | [`ci/github-actions-runs.png`](ci/github-actions-runs.png): passing pull-request and `dev` runs. | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`docs/ci/devsecops.md`](../../docs/ci/devsecops.md) |
| Static code analysis (10) | [`static-analysis/`](static-analysis/): before/after overview, accepted issues, passed quality gate | [`docs/security/static-analysis.md`](../../docs/security/static-analysis.md) |
| Docker: backend + frontend (10) | **Pending (P3-19 capture):** `docker/compose-ps.png` (`docker compose ps` with `api` and `client` both `healthy`) and `docker/api-https-health.png` (`curl.exe -k https://localhost:4000/health` answered by the Compose API container). See the [final QA checklist](../../docs/demo/part3-demonstration-runbook.md#final-qa-checklist). | [`docs/docker/compose.md`](../../docs/docker/compose.md) |
| Logging (10) | [`logging/`](logging/): Grafana Cloud dashboard, Explore queries and privacy check | [`logging/README.md`](logging/README.md), [`docs/monitoring/`](../../docs/monitoring/) |
| Own security features (15) | [`security-tests/`](security-tests/) (idempotency misuse, revocation, limits), [`e2e/playwright-junit.xml`](e2e/playwright-junit.xml) (sign-out revokes the server session) | [`docs/security/booking-idempotency.md`](../../docs/security/booking-idempotency.md), [`docs/security/session-revocation.md`](../../docs/security/session-revocation.md) |
| Security review in README (10) | Not evidence-based | [README Security Review](../../README.md#security-review), [`docs/security/threat-control-review.md`](../../docs/security/threat-control-review.md) |
| README update (5) | Not evidence-based | Root `README.md` |

## Test results

| Suite | Command (repository root) | Result | Files |
|---|---|---|---|
| Functional API, Part 2 + Part 3 financial (P3-12) | `npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'` | 120 request definitions, 122 executed, **335 assertions, 0 failed** | [`newman/functional-report.xml`](newman/functional-report.xml), [`newman/functional-summary.png`](newman/functional-summary.png), [`newman/financial-assertions.png`](newman/financial-assertions.png) |
| Security matrix (P3-13) | `npm --prefix api run test:security` (see the suite doc) | 103 requests, **278 assertions, 0 failed** | [`security-tests/security-matrix.xml`](security-tests/security-matrix.xml), [`security-tests/security-matrix-summary.png`](security-tests/security-matrix-summary.png) |
| Security rate limits (P3-13) | `npm --prefix api run test:security:limits` | 34 requests executed, **102 assertions, 0 failed** | [`security-tests/security-limits.xml`](security-tests/security-limits.xml), [`security-tests/security-limits-summary.png`](security-tests/security-limits-summary.png) |
| Real-browser E2E (P3-14) | `npm --prefix e2e run test:evidence` | **7 passed, 0 failed** | [`e2e/playwright-junit.xml`](e2e/playwright-junit.xml), [`e2e/playwright-summary.png`](e2e/playwright-summary.png), [`e2e/screenshots/`](e2e/screenshots/) |
| Backend unit tests | `npm --prefix api test` | **98 passed, 0 failed** | [`unit-tests/api-node-test.xml`](unit-tests/api-node-test.xml) |
| Frontend unit tests | `npm --prefix client test` | **28 passed (5 files), 0 failed** | [`unit-tests/client-vitest.xml`](unit-tests/client-vitest.xml) |

**Counts in the JUnit files.** The Postman CLI summary table (the screenshots) is the authoritative total. The JUnit exports list each request once, so requests that repeat in a loop (for example *Booking Limit - Automatic Loop Until 429*) are merged. That is why `functional-report.xml` contains 329 test cases against 335 assertions, and `security-limits.xml` contains 39 test cases against 102 assertions. Both formats report 0 failures.

Every API-backed suite needs **its own freshly started API process** (`npm --prefix api start`), because the rate limiters count in memory. Run order used for the final cycle: functional Newman → restart → E2E → restart → security matrix → restart → security limits.

Reproducing the unit-test reports: the API report comes from

```bash
cd api && node --test --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=junit --test-reporter-destination=../evidence/part3/unit-tests/api-node-test.xml test/*.test.js
```

The client's Vitest configuration always writes its JUnit file to `evidence/part2/frontend-tests/react-tests.xml`. Copy that file to `unit-tests/client-vitest.xml`, then restore the Part 2 file with `git restore evidence/part2/frontend-tests/react-tests.xml`.

## Application screenshots

Captured by the Playwright suite in a real Chromium browser against the HTTPS API, using generated demonstration data.

| File | Shows |
|---|---|
| [`01-freelancer-gig-published.png`](e2e/screenshots/01-freelancer-gig-published.png) | A newly registered freelancer publishes a gig. |
| [`02-client-booking-confirm.png`](e2e/screenshots/02-client-booking-confirm.png) | The client's booking confirmation step with the simulated-payment notice. |
| [`03-client-booking-confirmed.png`](e2e/screenshots/03-client-booking-confirmed.png) | Booking confirmed, with reference and recorded simulated payment. |
| [`04-client-booking-history.png`](e2e/screenshots/04-client-booking-history.png) | The booking in the client's history (transaction persisted). |
| [`05-freelancer-income-tax-dashboard.png`](e2e/screenshots/05-freelancer-income-tax-dashboard.png) | Freelancer dashboard: R250 000 income, R56 718.82 illustrative tax, projection explanation, March–February monthly breakdown. |
| [`06-login-rejected.png`](e2e/screenshots/06-login-rejected.png) | A wrong password is rejected with a generic message. |
| [`07-client-access-denied.png`](e2e/screenshots/07-client-access-denied.png) | A client is denied the freelancer dashboard. |

Worked check of screenshot 05 (7 November 2026 = day 252 of 365): R250 000 × 365 ÷ 252 = **R362 103.17** projected. Tax = R44 118 + 26% × (R362 103.17 − R245 100) − R17 820 primary rebate = **R56 718.82**. The Playwright test and the Postman oracle both check this calculation independently of the API code.

## Redactions

| File | What was covered | Why |
|---|---|---|
| [`newman/functional-summary.png`](newman/functional-summary.png) | The value passed as `--env-var 'adminPassword=...'` on the command line | It was the assessment administrator's password. It is redacted here and is being rotated in the assessment database before submission. |
