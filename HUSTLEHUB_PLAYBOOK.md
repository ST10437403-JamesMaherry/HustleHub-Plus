# HustleHub+ — Engineering Playbook

**Purpose:** A working reference for maintaining and extending HustleHub+ as a secure freelance marketplace and portfolio project. Use it to preserve implementation quality, security invariants and a reliable source of truth during future development.

## 1. Source of truth

1. The latest **clean, committed snapshot from the personal `main` branch** is the starting point for future work. The repository, not a remembered code sketch, determines what actually exists.
2. For implementation decisions, inspect the affected application files, tests, configuration contracts, and linked engineering documentation before proposing changes.
3. Preserve existing business rules and security boundaries unless a new requirement explicitly changes them. Avoid inventing APIs, database fields, directories, permissions or test commands.
4. If a snapshot becomes stale after commits, take a new one. State the exact commit hash when documenting a new baseline.
5. The personal repository's `origin` should point to `HustleHub-Plus.git`, with `main` as the product baseline. Do not push product-development work to earlier collaboration remotes.

Useful checks:

```bash
cd ~/Documents/GitHub/HustleHub-Plus
git remote -v
git branch --show-current
git status --short
git log -1 --oneline
```

## 2. Product contract

HustleHub+ has three account roles: `client`, `freelancer` and `admin`.

- Visitors browse active listings and create client/freelancer accounts.
- Clients book active gigs, receive a confirmation and review their own booking history.
- Freelancers manage only their gigs and can review their own confirmed transactions, income and illustrative tax projection.
- Administrators review safe user/booking data and moderate gigs; public registration must never grant administrator privileges.

**Money:** Payments are simulated. Successful bookings persist a booking and its simulated transaction. Never present this system as a live payments platform without an explicitly designed payment-provider integration.

**Financial reporting:** Confirmed transactions are the source for income. The currently implemented tax logic uses a **2026/27 South African tax-year model** and annualises year-to-date revenue. It is illustrative, not a determination of tax owed. Changing or adding tax years requires updated sources, independent test oracles and UI explanations.

## 3. Architectural boundaries

| Boundary | Invariant |
|---|---|
| Browser → API | The browser talks to the Express API over HTTPS; it never holds Atlas or JWT signing secrets |
| Authentication | API validates JWT signatures, expiry, current database role and session version on protected requests |
| Authorisation | Ownership and role checks run server-side, even when the React UI already hides a control |
| Booking | Server determines owner, freelancer and price; UUID-v4 idempotency key prevents duplicate records |
| Persistence | Booking and transaction creation are atomic within MongoDB transactions |
| Income | Only the authenticated freelancer's confirmed transactions feed reporting |
| Logging | Allowlisted structured events; never log tokens, credentials, request bodies or personal data |
| Containers | API and Nginx client run as non-root processes with localhost-bound development ports |
| Tests | Unit tests and isolated end-to-end suites remain reproducible and block regressions |

Important implementation locations:

```text
api/index.js                    Express bootstrap and HTTPS
api/routes/                    Route authentication and endpoint boundaries
api/controllers/               Booking, income, authentication and gig workflows
api/middleware/                Auth, roles, validation, sanitisation and limits
api/models/                    MongoDB schemas
api/services/                  Tax and income calculations
api/utils/                     JWT helpers and event logging
client/src/                    React application
client/src/context/            Auth and session state
client/src/services/api.js     Shared API request logic
postman/                      Functional and security request suites
e2e/                          Browser-level tests
compose.yaml                  Local Atlas-backed Docker stack
compose.ci.yaml               Disposable CI integration database
.github/workflows/ci.yml      CI jobs and final quality gate
scripts/ci/                   CI test orchestration and validation
```

## 4. Code and UI conventions

- Keep React components focused; reuse the existing `AuthContext`, route guards and shared `api.js` service rather than creating parallel request logic.
- Keep backend modules separated by routes, middleware, controllers, services and models. Validate at the boundary and enforce domain invariants in the appropriate service/controller.
- Keep changes targeted. Do not replace functioning project code with a generic boilerplate rewrite.
- Use consistent JavaScript code formatting and **short, functional comments** explaining non-obvious behaviour and security decisions. Do not add redundant comments or commentary about the history of a change.
- Preserve existing naming conventions and API response contracts.
- Keep the interface minimal, typography-driven and high contrast. Prefer black/near-black surfaces, neutral text, square corners, whitespace and deliberate hierarchy. Avoid gradients, glows, icons and ornamental interface patterns.
- Prefer accessible semantic controls, visible focus states, keyboard navigation and useful empty/loading/error states.

## 5. Development workflow

Start changes from the latest personal `main` branch and use a scoped feature branch.

```bash
cd ~/Documents/GitHub/HustleHub-Plus
git switch main
git pull --ff-only origin main
git switch -c feature/<short-topic>
```

Before changing code:

1. Read the relevant source, test suite, route contracts and architecture/security documents.
2. Identify the smallest change that satisfies the requirement.
3. Add or adjust a test for behaviour or a security invariant that changes.
4. Keep the work broken into reviewable commits (`feat:`, `fix:`, `test:`, `docs:`, `ci:`).
5. Use pull requests into `main` once the personal CI and branch rules have been configured.

When implementing fixes in a separate development conversation, provide **the complete contents of every changed file**, with its exact repository-relative path before the code. Keep the same commenting style and explain how to verify the change. Never assume the file still matches a previous snapshot.

## 6. Local execution

The personal clone is independent, but it can conflict with another local HustleHub Compose stack on ports `4000` and `5173` or the fixed Compose project name `hustlehub`. Stop the older stack before starting this one.

### Containerised stack

```bash
cd ~/Documents/GitHub/HustleHub-Plus
cp .env.example .env
open -e .env
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps api client
```

The root `.env` must contain **your own** `MONGO_URI` and `JWT_SECRET`. For local browser access:

```dotenv
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=https://localhost:4000
```

Confirm HTTPS using the generated **public** certificate:

```bash
mkdir -p api/certs
docker compose cp api:/app/certs/localhost-cert.pem api/certs/compose-localhost-cert.pem
curl --fail --cacert api/certs/compose-localhost-cert.pem https://localhost:4000/health
curl --fail --silent --show-error -o /dev/null -w 'Frontend HTTP %{http_code}\n' http://localhost:5173/login
```

The local browser must trust that public certificate. Never disable certificate checking globally. Normal shutdown:

```bash
docker compose down
```

### Native development

Use `api/.env` and `client/.env` independently from the Compose root `.env`. Start with the committed `.env.example` files, then run separate terminals:

```bash
npm --prefix api start
```

```bash
npm --prefix client run dev
```

See [README setup](README.md#getting-started) and [Compose operations](docs/docker/compose.md).

## 7. Testing strategy

Run targeted unit tests during development, then the broader suites at meaningful milestones.

```bash
npm --prefix api test
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

Coverage and analysis inputs:

```bash
npm --prefix api run test:coverage
npm --prefix client run test:coverage
```

For end-to-end validation, use the **disposable Docker integration stack** wherever possible. The Postman and Playwright suites create accounts and transactions; don't repeatedly run them against a persistent personal demonstration database. Every full API-backed suite needs a fresh API process because the current rate limiters are in memory.

Tests must continue to cover:

- Authentication, protected profile access and logout-based session invalidation.
- Client/freelancer/admin role separation and cross-account ownership checks.
- Gig validation, publishing, editing, visibility and deletion.
- Booking creation, idempotent retry, key conflict and atomic transaction records.
- Financial aggregation, monthly totals and independent tax calculation.
- Controlled error codes, rate limits, security headers and invalid input.
- A real-browser registration → gig → booking → income journey.

The CI integration suite uses disposable MongoDB with a replica set, generated credentials and an isolated TLS certificate. See [CI integration guide](docs/ci/devsecops.md) and [browser tests](docs/testing/e2e-playwright.md).

## 8. Personal service ownership

The copied project contains configuration references to infrastructure used during its initial collaborative development. **Reconfigure the following before claiming fully independent CI or hosting.**

### SonarQube Cloud — first priority

Current configuration files:

- `sonar-project.properties` — still points at an earlier, externally managed Sonar organisation/project.
- `.github/workflows/ci.yml` — runs Sonar only for `dev` pushes and pull requests into `dev`.
- `scripts/ci/gate.cjs` — deliberately permits Sonar to be skipped when it is outside that configured branch scope.
- `scripts/ci/contract.test.cjs` — protects workflow and CI job invariants.

**A green personal `main` run currently does not prove Sonar passed.** Resolve this in one targeted change:

1. Create a SonarQube Cloud project and organisation under your own account; associate the personal GitHub repository and use `main` as the analysis branch.
2. Generate a new personal analysis token. Add it in the personal repository under **Settings → Secrets and variables → Actions** as `SONAR_TOKEN`. Never paste the token into source or documentation.
3. Update `sonar.organization` and `sonar.projectKey` in `sonar-project.properties`. Keep the source/test paths and LCOV report paths unless the code moves.
4. Change the Sonar job's branch condition and `CI_SONAR_REQUIRED` logic in `.github/workflows/ci.yml` to require analysis on personal `main` pushes and PRs targeting `main`.
5. Review the workflow/CI contract tests to match the new branch policy. Preserve the existing blocking failure behaviour and the refusal to run secret-bearing analysis on untrusted fork code.
6. Verify a **real** analysis with both LCOV reports and a passing quality gate, followed by a passing final `CI gate` on the personal repository. Only then describe Sonar as operational for `main`.

Do not reuse another person's Sonar token or revoke other people's access without permission.

### MongoDB Atlas

- Provision a database or cluster under your own account with least-privilege credentials.
- Use a separate personal database; Git cloning does not copy MongoDB records, users, gigs or transactions.
- Update ignored `.env` files, allow the correct outbound IP, and verify transactional replica-set support.
- Migrate only data you are authorised to move; avoid importing unnecessary test users and historical records.

### JWT and administrator access

- Generate a fresh strong `JWT_SECRET` in the ignored root `.env` and `api/.env` as applicable.
- Provision administrator credentials deliberately in your own database. Never allow public registration to choose `admin`.
- An administrator password was once exposed in historical Git commits. Rotate it wherever it might still work. A new README does not erase historical Git secrets.

### Grafana Cloud

- Optionally create a personally controlled Loki stack and a `logs:write` access policy/token.
- Set `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER` and `GRAFANA_LOKI_TOKEN` in ignored local environments only.
- Import `docs/monitoring/grafana-dashboard.json` if needed. Leave all three variables blank to log to stdout without cloud delivery.
- Keep CI logging separated from actual application telemetry.

### GitHub and Docker

- Git pushes transfer commits and tracked files, not Actions secrets, protections, run history or external cloud resources.
- Confirm required repository checks, branch rules and approved Actions in the personal repository.
- `compose.yaml` uses project name `hustlehub` and host ports `4000`/`5173`. Only change these with an accompanying check of the Compose contract tests and documentation.
- The generated self-signed localhost TLS certificate lives in a Docker volume. Trust only its public certificate locally; production hosting requires trusted TLS.

## 9. Security and release checks

Before sharing the repository broadly or deploying it:

- [ ] Audit old commits, committed exports, screenshots and documentation for embedded credentials or private information.
- [ ] Rotate the known historically exposed administrator credential everywhere it is still valid.
- [ ] Replace external Sonar ownership and prove the actual `main` quality gate.
- [ ] Use personally owned Atlas credentials and a new JWT signing secret.
- [ ] Confirm role/ownership, booking idempotency and tax invariants under the current code.
- [ ] Verify localhost development TLS and hosting-grade TLS separately.
- [ ] Review unpinned JWT algorithm verification, browser-facing CSP, session storage exposure and in-memory rate limits before public deployment.
- [ ] Confirm the difference between simulated transactions and real financial processing remains clear in UI and docs.
- [ ] Require relevant checks for merges into `main`.
- [ ] Update the source snapshot after release and record its exact commit.

## 10. Snapshot and handover workflow

A snapshot is a **shareable, redacted view of the current source**, not a replacement for the Git repository. To establish a new source of truth:

1. Merge intended changes into personal `main` and verify the working tree is clean.
2. Check `git rev-parse HEAD` against `git rev-parse origin/main`.
3. Run a personal-repository snapshot script that captures tracked text files, commit metadata and this playbook, while excluding local secrets, certificates and binary evidence.
4. Inspect the output for credentials before sharing it. Automated redaction is a precaution, not a guarantee.
5. In a new conversation, supply the **latest source snapshot** and this playbook. Treat the captured source as the code baseline and re-check changed files before making replacements.

**Git history preserves original collaboration and older documentation.** The portfolio-facing README and playbook describe current product development; neither rewrites authorship, earlier commits or external records.
