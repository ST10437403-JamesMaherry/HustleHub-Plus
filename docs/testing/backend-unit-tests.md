# Backend unit testing

## Purpose

The API uses Node.js's built-in `node:test` runner and strict assertions. This continues the existing Part 3 finance suites without introducing a second testing framework.

Unit tests cover isolated calculation, aggregation, input validation, authorization, JWT handling and error-response behaviour. They do **not** claim to validate the live MongoDB booking transaction or a complete HTTP request. Full HTTP/database checks are handled by the separate Postman/Newman and CI milestones.

## Run from the repository root

```bash
npm --prefix api ci
npm --prefix api test
```

To print Node.js test coverage in the terminal:

```bash
npm --prefix api run test:coverage
```

The standard `test` command uses `node --test test/*.test.js`. It discovers the test files in `api/test/`, returns a nonzero exit code if assertions fail, and does not require MongoDB Atlas, an API server, or live secrets. Test-only signed JWTs use a temporary, randomly generated signing key within the test process. `api/package.json` retains `test:api` as a separate Newman command for end-to-end API checks.

## Covered behaviours

| Suite | Coverage |
|---|---|
| `taxEstimator.test.js` | SARS 2027 brackets, rebates, supported inputs and annualisation |
| `incomeAnalytics.test.js` | Freelancer-scoped confirmed transactions, Johannesburg tax-year boundaries, exact cents, monthly reporting and legacy API fields |
| `financeRegression.test.js` | Independent tax examples, lifetime versus tax-year income, invalid aggregate values and report disclaimers |
| `requestValidation.test.js` | Registration/login, NoSQL-operator inputs, password byte limits, gig validation and selected text sanitisation |
| `securityMiddleware.test.js` | Booking request validation, role checks, JWT verification and controlled errors |

Test helpers in `api/test/helpers/` emulate Express request and response objects without starting a server. The tests use in-memory fixture values and must not connect to the assessment database or commit credentials.

## Follow-on coverage

P3-05 extends authentication tests for server-side revocation and P3-06 extends booking tests for idempotency and replay protection. Real database transaction integrity, including rollback and concurrency, requires a MongoDB replica set and is part of the later integration-testing milestone. GitHub Actions can run `npm --prefix api test` after `npm ci` and fail the workflow when any unit test fails.

The module manual's Learning Unit 5 uses Jest to demonstrate unit-testing principles; the project uses Node's built-in runner because its established finance suites already use that API and no additional package is necessary. This preserves the same testing goals: isolated valid/invalid cases and repeatable CI execution.
