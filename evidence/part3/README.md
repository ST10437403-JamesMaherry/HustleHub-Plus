# HustleHub+ — Engineering Evidence Index

This directory preserves results from real local and CI test runs of the HustleHub+ marketplace. The reports and screenshots represent **recorded runs**, not live status guarantees for a new clone, personal cloud account, or later commit.

For the product overview, see the [README](../../README.md). For ongoing development conventions and infrastructure ownership, see the [engineering playbook](../../HUSTLEHUB_PLAYBOOK.md).

## System verification

| Area | Evidence | What it demonstrates |
|---|---|---|
| Marketplace and finance | [Income dashboard](e2e/screenshots/05-freelancer-income-tax-dashboard.png), [financial API assertions](newman/financial-assertions.png) | Confirmed-income reporting and independently checked illustrative tax |
| End-to-end browser workflow | [Browser JUnit report](e2e/playwright-junit.xml), [screenshots](e2e/screenshots/) | Account creation, gig publishing, booking, income, sign-out, and access controls |
| API functionality | [Functional report](newman/functional-report.xml), [summary](newman/functional-summary.png) | Real API calls, role checks, validation, bookings and income contracts |
| API security | [Security matrix](security-tests/security-matrix.xml), [rate-limit cycle](security-tests/security-limits.xml) | JWT rejection, roles, idempotency misuse, errors, and rate limits |
| Backend and frontend unit tests | [Backend report](unit-tests/api-node-test.xml), [frontend report](unit-tests/client-vitest.xml) | Regression checks for business logic and UI behaviour |
| Docker runtime | [Healthy containers](docker/compose-ps.png), [HTTPS and frontend checks](docker/api-https-health.png) | API and Nginx client services running with successful health responses |
| Continuous integration | [Workflow runs](ci/github-actions-runs.png) | Recorded GitHub Actions runs of the integrated test pipeline |
| Static code analysis | [Analysis captures](static-analysis/) | Recorded Sonar analysis, findings and gate outcome |
| Observability | [Grafana captures](logging/) | Structured application events, search and privacy checks |

## Recorded automated test results

| Suite | Recorded result | Evidence |
|---|---|---|
| Functional API | 122 executed requests; **335 assertions passed**, 0 failed | [Report](newman/functional-report.xml), [summary](newman/functional-summary.png) |
| API security matrix | 103 requests; **278 assertions passed**, 0 failed | [Report](security-tests/security-matrix.xml), [summary](security-tests/security-matrix-summary.png) |
| Rate-limit security cycle | 34 requests; **102 assertions passed**, 0 failed | [Report](security-tests/security-limits.xml), [summary](security-tests/security-limits-summary.png) |
| Playwright browser tests | **7 passed**, 0 failed | [JUnit](e2e/playwright-junit.xml), [summary](e2e/playwright-summary.png) |
| Backend unit tests | **98 passed**, 0 failed | [JUnit](unit-tests/api-node-test.xml) |
| Frontend unit tests | **28 passed**, 0 failed | [JUnit](unit-tests/client-vitest.xml) |

The request-loop summaries and JUnit reports count repeated requests differently. For the functional suite, the summary records 335 assertions while the JUnit report contains fewer entries because repeated requests are grouped. This is a reporting-format distinction, not evidence of an omitted test.

## Browser journey screenshots

| Screenshot | View |
|---|---|
| [Freelancer published gig](e2e/screenshots/01-freelancer-gig-published.png) | An authenticated freelancer publishes an active service |
| [Client booking confirmation](e2e/screenshots/02-client-booking-confirm.png) | Booking review and simulated-payment notice |
| [Booking confirmed](e2e/screenshots/03-client-booking-confirmed.png) | Confirmation reference and amount |
| [Client booking history](e2e/screenshots/04-client-booking-history.png) | Persisted confirmed booking |
| [Freelancer income and tax](e2e/screenshots/05-freelancer-income-tax-dashboard.png) | Year-to-date income and illustrative annual tax |
| [Invalid sign-in](e2e/screenshots/06-login-rejected.png) | Safe invalid-credentials error |
| [Cross-role access denied](e2e/screenshots/07-client-access-denied.png) | Client cannot view freelancer financial data |

### Historical tax-output context

The dashboard screenshot was taken on **7 November 2026**. It showed R250,000 in confirmed simulated income and an illustrative tax estimate of **R56,718.82**. The estimate was calculated using elapsed days in the 2026/27 South African tax year. Repeating the calculation on another date may change the projection even when the underlying transactions remain unchanged.

For the tax model and independent test approach, see [tax methodology](../../docs/finance/tax-estimation.md) and [browser test guide](../../docs/testing/e2e-playwright.md).

## Docker health reproduction

The container evidence shows the Express HTTPS API and Nginx client both reporting healthy. To reproduce it with your **own** configured MongoDB Atlas credentials:

```bash
cd ~/Documents/GitHub/HustleHub-Plus
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps api client

mkdir -p api/certs
docker compose cp api:/app/certs/localhost-cert.pem api/certs/compose-localhost-cert.pem
curl --fail --cacert api/certs/compose-localhost-cert.pem https://localhost:4000/health
curl --fail --silent --show-error -o /dev/null -w 'Frontend HTTP %{http_code}\n' http://localhost:5173/login
```

Expected: both services healthy, API JSON containing `"status":"OK"` and `"protocol":"HTTPS"`, and frontend HTTP `200`. Trust the public certificate in your browser for local HTTPS; never globally disable certificate verification. The normal stack uses an external Atlas database. The disposable CI overlay is explained in the [Compose guide](../../docs/docker/compose.md).

## CI and static analysis context

These captures belong to earlier verified GitHub and Sonar runs. The personal repository uses `main`, while the imported workflow still scopes its blocking Sonar scan to `dev`. A passing personal `main` workflow **does not currently imply a passing Sonar scan**. Follow the [personal service ownership section](../../HUSTLEHUB_PLAYBOOK.md#personal-service-ownership) to move analysis into a personally owned Sonar project and update the quality gate.

No production Atlas credentials or long-lived signing secrets are required for the isolated CI integration suites; they use disposable fixtures and generated values.

## Evidence handling

- Test-account addresses are generated for the suites; avoid treating their records as persistent production data.
- A terminal summary was redacted to conceal an administrator password supplied at runtime. The redaction did not change test counts or the reported outcome.
- Do not commit environment values, JWTs, database connection strings, administrator passwords, private keys or Grafana tokens.
- Review the historical repository, screenshots and Git commits for sensitive values before public publication. Rotate the historically exposed administrator credential wherever still valid.
- Keep real and simulated transactions clearly distinguished in demonstrations and documentation.

For test repetition and release checks, use the [engineering playbook](../../HUSTLEHUB_PLAYBOOK.md).
