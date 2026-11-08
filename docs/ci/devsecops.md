# HustleHub+ DevSecOps pipeline (P3-16)

## Scope and baseline

This implementation builds on the clean source snapshot at `55c68dc3c6fa3291c5ea11009dd8522dea3ed88c` (8 November 2026). It reuses the existing API, client, tax logic, authentication, idempotency protection, logging, Dockerfiles, Compose fixture, Postman collections, Playwright tests and Sonar project.

It does not deploy to a hosting service, modify Atlas, change production controllers, or push images to a registry. It implements continuous integration and deployment-readiness verification; hosted deployment is optional in the lecturer guidelines.

Assessment anchors:

- INSY7314 POE, pp. 8-9: automatic GitHub Actions dependency installation, backend/frontend tests and builds, failing checks, static analysis and Compose orchestration.
- INSY7314 POE, p. 16: a robust pipeline with security tests, both stack builds, correct failure propagation and both application containers running in the pipeline.
- INSY7314 Module Manual, Learning Unit 6, especially pp. 155-159: workflow execution, interpreting failures and using repository secrets rather than committing credentials.
- Lecturer POE Guidelines: backend unit/Newman testing, frontend unit/browser testing, container execution and inspectable evidence.

## Files

| Path | Responsibility |
|---|---|
| `.github/workflows/ci.yml` | Automatic workflow, independent checks, Sonar integration and final gate |
| `scripts/ci/integration.mjs` | Isolated Compose lifecycle, identity checks, TLS export, suite execution and cleanup |
| `scripts/ci/seed-admin.cjs` | Guarded administrator provisioning through stdin inside the disposable API container |
| `scripts/ci/newman.cjs` | Runs the existing collections with in-memory credentials and complete-run checks |
| `scripts/ci/playwright.config.cjs` | Runs the existing Chromium tests against the built Nginx client |
| `scripts/ci/playwright-reporter.cjs` | Publishes browser case results without typed values, traces or attachments |
| `scripts/ci/report.cjs` | Safe JUnit/JSON reporting, fixture validation and Newman result evaluation |
| `scripts/ci/normalise-coverage.cjs` | Converts valid LCOV source paths to repository-relative paths before upload |
| `scripts/ci/gate.cjs` | Fails on unsuccessful or unexpectedly skipped required jobs |
| `scripts/ci/contract.test.cjs` | Tests CI helper behaviour and security/configuration contracts |
| `scripts/ci/negative-control.cjs` | Intentionally failing test used only by an explicit manual evidence run |
| `ci-output/.gitignore` | Keeps generated reports out of Git |

All application source, dependency manifests and existing test collections are preserved. No new npm package is required by the CI helpers.

## Workflow structure

| Job | What executes | Failure condition |
|---|---|---|
| Configuration contracts | Existing 10 client-container checks, 17 Compose checks, 20 new CI checks and shell syntax checks | Failed assertion or syntax error |
| Backend | Node 22, locked installation, existing backend tests and LCOV coverage | Install/test failure or missing coverage |
| Frontend | Node 24, locked installation, Vitest coverage, ESLint and Vite production build | Install/test/lint/build failure or missing coverage |
| Dependency audits | Independent `api`, `client` and `e2e` installations and npm audits | Any high/critical advisory or audit/registry error |
| Docker integration | Separate runner/stack for each of smoke, functional, security, limits and browser | Build/startup/non-root/TLS/test/completeness/cleanup failure |
| Sonar | Existing project configuration, both LCOV files and blocking quality gate | Missing token, unavailable analysis, scanner error or failed quality gate |
| CI gate | Evaluates all required upstream job results | Any required result other than `success` |

Integration matrix jobs use `fail-fast: false`, so one failing suite does not cancel the others. This does NOT suppress failures. The final `CI gate` is the status to require on `dev` pull requests.

Each integration job builds both real Docker images, starts both application containers plus a local MongoDB replica set, checks that all are healthy, verifies both application UIDs are nonzero and then executes its assigned suite. Browser tests use the built Nginx frontend, not a substitute Vite development server.

Five separate stacks trade some repeated builds for deterministic tests. No test suite shares API rate-limit counters, accounts, transactions or MongoDB data with another suite.

## Events and Sonar scope

The workflow runs automatically on:

- Pushes to `dev`, `main`, `feature/**`, `fix/**` and `chore/**`.
- Pull requests targeting `dev` or `main`.
- Explicit manual dispatches.

The existing Sonar project is configured with `dev` as its main branch and uses the Free plan. Consequently the required Sonar job runs on `dev` pushes, PRs targeting `dev`, and manual runs on `dev`. Feature pushes and `main` events run the other checks; the final summary explicitly states that Sonar is out of scope for those events. A passing feature-push run is NOT the complete Sonar-gated acceptance run: open a PR into `dev` and require its full result.

The final release review must preserve this distinction. Do not describe a `main` event that skipped Sonar as a fresh Sonar analysis of `main`. Changing the Sonar project's branch/plan policy belongs to the final release configuration, not an implicit scanner override here.

Fork PRs run the secret-free checks. A PR into `dev` from a fork cannot receive full sign-off: the Sonar job explicitly fails before checking out fork code or providing the token. Review the contribution and run the approved code from a trusted repository branch. Do not solve this by switching to `pull_request_target` or exposing secrets to untrusted code. Dependabot PRs may likewise need an approved trusted run because ordinary repository secrets are unavailable.

## Secret and database boundaries

The only persistent CI secret required is `SONAR_TOKEN`, scoped to Sonar steps. API integration jobs generate their own 64-character hexadecimal JWT signing secret and administrator password. They never consume production `MONGO_URI`, the assessment administrator password, or Grafana credentials.

`integration.mjs`:

1. Selects the existing Compose files with project name `hustlehub-ci`.
2. Uses a private empty env file, overriding local dotenv discovery.
3. Requires the effective API URI to be exactly `mongodb://mongo:27017/hustlehub_ci?replicaSet=rs0` and `COMPOSE_CI_FIXTURE=true`.
4. Checks that MongoDB has no published host port, application ports bind to `127.0.0.1`, logging delivery is disabled and HTTPS/CORS settings are correct.
5. Refuses to reuse an existing `hustlehub-ci` container set.
6. Creates a new disposable database and certificate volume.
7. Seeds the administrator directly in MongoDB with the application's bcrypt helper, avoiding registration/login rate-limit consumption.
8. Exports only the public certificate to a private temporary directory.
9. Runs one suite, then removes only this disposable project and its volumes.

The seeding script independently checks the database URI, fixture marker, credential shape, database name and replica-set identity. It is not included in the API image and is not an HTTP endpoint. Passwords are passed through process environment, not command arguments or persisted Postman environments.

Never run the CI fixture against Atlas. Never publish its unauthenticated MongoDB port. The ordinary Atlas-connected `hustlehub` Compose project, its TLS volume and its database are not CI targets.

## Certificate verification

The existing certificate initializer provides a localhost certificate. The API's healthcheck verifies it inside the container. Newman receives the exported public certificate through `sslExtraCaCerts`; redirects and insecure TLS are disabled.

Playwright reuses the existing narrowly scoped certificate public-key pin and CA-verified Node fixtures. Its CI configuration disables automatic Vite startup, because the real frontend container must be tested. There is no `NODE_TLS_REJECT_UNAUTHORIZED=0`, Newman `--insecure`, browser-wide `ignoreHTTPSErrors`, or application TLS downgrade.

## Postman/Newman integration details

No collection is rewritten. Mark's functional collection runs in full; Ewald's security collection runs twice with distinct top-level folders, each on its own fresh stack:

| Suite argument | Existing collection | Selection |
|---|---|---|
| `functional` | `postman/postman_collection.json` | All 120 request definitions |
| `security` | `postman/part3_security_collection.json` | `Security Matrix` |
| `limits` | `postman/part3_security_collection.json` | `Rate Limits` |

The runner uses Newman's library API to supply the same `baseUrl`, `clientOrigin`, `adminEmail`, `adminPassword` and `jwtSecret` variables without putting credentials on the command line. It checks callback errors, script/request/assertion failures, pending/skipped assertions, and whether every selected request definition was visited. A collection that stops early cannot claim success just because the last executed assertion passed.

The CI JUnit report records each emitted assertion plus one run-completeness check. Therefore its case count differs from older Newman reports which may collapse repeated requests. The console states actual executed request and assertion-event counts; these are not hard-coded success numbers.

Do not run the original Newman npm scripts against the same process one after another. They retain their normal local usage and report paths; CI intentionally uses separate in-memory runners to avoid mutating submission evidence.

## Artifacts and diagnostics

Artifacts retained for 14 days:

- `backend-coverage` and `frontend-coverage`: the respective `lcov.info` files, normalized to repository-relative source paths so separate analysis jobs can resolve them.
- `integration-smoke`, `integration-functional`, `integration-security`, `integration-limits`, `integration-browser`: safe JUnit/JSON results, pre-test container status/UID snapshots, startup classifications and the final runner result.

Raw error text, expected/actual response bodies, JWTs, environments, TLS private keys, Playwright HTML reports, traces and screenshots are not exported. Generated case identifiers avoid accidental sensitive data in assertion names. Console output identifies a failed Newman request by its static collection name, or a browser test by source file and line. Reproduce locally using the existing owner documentation when detailed payload diagnostics are needed.

An empty result set, skipped required test, script error, early abort or incomplete run fails. CI startup classifications include only `database.ready` / `app.start`, success/failure and a fixed phase name. Raw database exception messages are deliberately not copied.

Artifacts are diagnostic outputs, not proof of success on their own. Always inspect the job conclusion and `CI gate`. A partial coverage file or a pre-test healthy container snapshot does not override a later failure.

The API health endpoint is a liveness check after database startup, not a continuous database-readiness monitor. The actual booking/income integration tests separately verify live persistence.

## Configure GitHub once

In the repository, open Settings > Secrets and variables > Actions. Confirm that `SONAR_TOKEN` exists and is authorised to analyse the existing project `hustlehub-plus_insy7314poe` in organisation `st10257942`. Its existence and value cannot be established from a source snapshot; a real scan is the verification.

Do not add the Atlas URI, normal JWT secret, assessment password or Grafana token for this pipeline. Where branch rules are available, require `CI gate` on `dev` and avoid bypassing it. Ensure repository Actions policy permits the pinned official GitHub actions and SonarSource scan action.

All action references are full commit SHAs verified against upstream tags on 8 November 2026. Check out with persisted Git credentials disabled; use a read-only repository token. Node dependency caches are deliberately disabled for this first pipeline to keep trust boundaries straightforward.

## Local verification on macOS

From the repository root, after installing all four implementation stages:

```bash
cd ~/Documents/GitHub/INSY7314POE
npm --prefix api ci
npm --prefix client ci
npm --prefix e2e ci

node --test scripts/ci/contract.test.cjs
node --test client/docker/containerConfig.check.mjs scripts/composeConfig.test.mjs
npm --prefix api run test:coverage
npm --prefix client run test:coverage
npm --prefix client run lint
VITE_API_URL=https://localhost:4000 npm --prefix client run build
```

The baseline has 98 backend and 28 frontend tests. The new helper suite has 20 tests; existing container configuration suites total 27. Counts describe the source baseline, not a promise that a future run will pass.

Check the full dependency graph, including development tooling:

```bash
npm --prefix api audit --audit-level=high
npm --prefix client audit --audit-level=high
npm --prefix e2e audit --audit-level=high
```

The gate deliberately blocks high/critical advisories in runtime AND test/build dependencies. Moderate/low findings are displayed but do not cross this threshold; review and track them. Registry outages also fail rather than masquerading as a clean audit. Previous work already documented outstanding API/client advisories. A failing audit is not a reason to weaken the gate.

For an affected package, `npm --prefix <package> audit fix` can apply compatible fixes. Review its manifest/lockfile diff and rerun the regression checks. Do not use `--force`, delete the lockfile, set `continue-on-error`, or silently suppress findings. Commit dependency remediation separately. Incompatible upgrades require assessment rather than an invented version override.

For the full local integration milestone, first stop the ordinary Compose stack without removing its certificate volume, and stop any native API/Vite processes occupying ports 4000 and 5173:

```bash
docker compose down
npm --prefix e2e run install:browser

bash <<'SH'
set -euo pipefail
for suite in smoke functional security limits browser; do
  node scripts/ci/integration.mjs "$suite"
done
SH
```

Every invocation builds its own stack and cleans it up. No root `.env` or Atlas IP access-list change is needed. The script is intended for macOS/Linux, matching the development machine and hosted Ubuntu runners.

If an interrupted run leaves the disposable project behind, inspect it first:

```bash
docker compose --env-file /dev/null -p hustlehub-ci -f compose.yaml -f compose.ci.yaml ps -a
```

Remove only that disposable project before retrying:

```bash
docker compose --env-file /dev/null -p hustlehub-ci -f compose.yaml -f compose.ci.yaml down --volumes --remove-orphans
```

Do not substitute the normal Atlas-connected project name into that command.

## First GitHub validation and PR

Push all four commits together, then open the PR against `dev`. A feature push exercises the secret-free checks; the PR into `dev` additionally requires Sonar. Missing `SONAR_TOKEN`, a failed scan, an unavailable service or an audit finding must remain visible failures.

Do not merge based only on a successful image build, successful artifact upload, or a green individual job. Require the complete PR run's `CI gate` to succeed. Record the tested commit and run URL for P3-19.

Suggested PR title:

`ci: automate full-stack tests security gates and Docker verification (P3-16)`

Suggested brief description:

> Adds automatic backend/frontend quality checks, isolated Docker-based Newman and Playwright tests, dependency audits, and the existing Sonar quality gate. Uses disposable credentials and MongoDB fixtures, publishes safe test reports, and fails the final gate when a required check fails. Includes CI helper tests and setup/evidence documentation.

Add actual local and GitHub outcomes after running them; do not paste unverified passing totals.

## Prove that failure propagates

The manual `failure_probe` input runs a real, intentionally failing `node:test` assertion in the backend job. It changes no application file and cannot be enabled accidentally by ordinary push or PR events. The expected result is a failed backend job and failed final `CI gate`, not a successful job labelled as a failure test.

GitHub normally exposes manual dispatch after the workflow exists on the repository's default branch. After a verified normal PR run and merge, open Actions > HustleHub DevSecOps > Run workflow, select `dev`, and enable the failure probe. Capture the failed test and failed gate. Then run normally with the checkbox disabled and capture the passing result. Wait for the negative-control run to finish before starting its replacement, because same-ref manual runs cancel older runs.

Before the workflow is on the default branch, an alternative is a temporary feature-branch commit changing one existing assertion to a deliberately wrong expectation. Push it, capture the failing PR run, restore the exact assertion in a follow-up commit, push and require the new run to pass. Never merge the broken assertion or disable the assertion to obtain green.

The helper tests also execute the negative-control file in a subprocess and verify its nonzero exit. That local helper test proves the fixture works; it is not a substitute for the real red/green GitHub evidence.

## Completion boundary

P3-16 is complete only after a real PR-to-dev run and subsequent dev run pass, the intentional failure run is recorded, and the associated documentation/evidence is updated. Local syntax and helper tests cannot validate GitHub permissions, Sonar authentication, registry availability or the live Docker stack.

Known separate follow-ups remain: explicit JWT algorithm pinning from the security review, final README/architecture updates, final coordinated evidence and the release/submission review. A passing pipeline proves its implemented checks passed; it is not a claim that all possible security weaknesses are absent.

## References

- IIE, INSY7314 POE (2026), pp. 8-9 and 16; INSY7314 Module Manual (2026), LU6, pp. 155-159; lecturer POE Guidelines.
- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.docker.com/reference/cli/docker/compose/up/
- https://docs.npmjs.com/cli/commands/npm-audit/
- https://github.com/postmanlabs/newman (library API, run summary, events and CA configuration)
- https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans
- https://github.com/SonarSource/sonarqube-scan-action
- Existing project contracts: `docs/testing/security-postman-suite.md`, `docs/testing/e2e-playwright.md`, `docs/security/static-analysis.md`, `docs/docker/compose.md`.
