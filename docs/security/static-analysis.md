# Static Analysis with SonarQube Cloud (P3-15)

HustleHub+ is analysed with SonarQube Cloud on the Free plan, using the default **Sonar way** quality profile and quality gate. The scan covers the API and the React client in one project.

| Setting | Value |
|---|---|
| Organization | `st10257942` (created manually, not bound to GitHub) |
| Project key | `hustlehub-plus_insy7314poe` (private) |
| Main branch | `dev` |
| Size | about 5.5k lines of code, within the Free plan's 50k limit for private projects |
| Quality gate | Sonar way (the Free plan does not allow a custom gate) |
| New code definition | Previous version |

The Free plan analyses only the main branch and pull requests that target it, which is why the main branch is named `dev`.

## Configuration

`sonar-project.properties` at the repository root:

- **Sources:** `api` and `client/src`. **Tests:** `api/test` and `client/src/test`. Test folders are excluded from the sources only so that they are analysed as tests, not counted twice.
- **Exclusions:** only `node_modules`, `coverage` and `dist`. No application code is excluded.
- **Coverage:** `api/coverage/lcov.info` and `client/coverage/lcov.info`.
- **Blocking gate:** `sonar.qualitygate.wait=true` makes the scanner wait for the gate and exit with a non-zero code when it does not pass.

Coverage reports:

| Package | Command | Notes |
|---|---|---|
| API | `npm run test:coverage` (in `api`) | Node test runner, writes `coverage/lcov.info`, test files excluded from coverage |
| Client | `npm run test:coverage` (in `client`) | Vitest with `@vitest/coverage-v8`, console reporter only, so the Part 2 JUnit evidence is not rewritten |

`.scannerwork/` and `coverage/` are git-ignored.

## Running a scan locally

PowerShell 7, from the repository root. The token is read into the current terminal session only:

```powershell
cd api; npm run test:coverage; cd ..\client; npm run test:coverage; cd ..; $env:SONAR_TOKEN = Read-Host 'Sonar token' -MaskInput; npx --yes @sonar/scan
```

`@sonar/scan` downloads its own Java runtime on first use. A successful run ends with `QUALITY GATE STATUS: PASSED`.

## Results

| Measure | First scan | After remediation |
|---|---|---|
| Quality gate | `NONE` (no baseline yet; the scanner exited with code 1) | **Passed**, all 6 conditions |
| Security rating | E | **A** |
| Vulnerabilities | 3 (2 Blocker, 1 High) | **0** |
| Bugs (reliability) | 6 | **0** |
| Open issues | 19 | **0** (14 fixed, 5 accepted with reasons) |
| Security hotspots | 0 | 0 |
| Overall coverage | 76.1% | 76.3% |
| New-code coverage | n/a | 92.9% (gate requires 80%) |

The first scan shows that the scan blocks: the scanner exits with code 1 whenever the gate does not pass.

## Findings and decisions

### Security (3, fixed)

| Rule | Location | Finding | Decision |
|---|---|---|---|
| S5147 | `api/controllers/authController.js` (register lookup) | NoSQL injection via request input | Fixed: query uses `String(email)` |
| S5147 | `api/controllers/authController.js` (login lookup) | NoSQL injection via request input | Fixed: query uses `String(email)` |
| S4684 | `api/controllers/gigController.js` (`createGig`) | Mass assignment from `...req.body` | Fixed: only `title`, `description`, `category`, `price` and `active` are copied; the owner comes from the JWT |

`validateLogin`, `validateRegistration` and `validateGig` already reject non-string values and rebuild `req.body` from allowlisted fields, so these paths were not exploitable through the routes. Sonar cannot follow validation across Express middleware, so the controllers now enforce the same guarantee locally. A first attempt with `{ $eq: email }` was not recognised as a sanitiser and was replaced with `String(email)`.

### Reliability (11, fixed)

| Rule | Location | Decision |
|---|---|---|
| S8786 slow regular expression | email pattern in `api/models/User.js`, `api/middleware/validateLogin.js`, `api/middleware/validateRegistration.js`, `client/src/components/auth/validation.js` | Replaced with `/^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/`, which runs in linear time and also rejects empty domain labels such as `user@example..com` |
| S8786 slow regular expression | `api/middleware/requestContext.js` (trailing-slash trim) | Replaced the end-anchored regex with a loop. This one was reachable: it ran on every POST path, and a long run of slashes caused quadratic backtracking |
| S9383 unhandled promise | `api/index.js`, `client/src/components/AppShell.jsx`, `client/src/pages/RegisterPage.jsx`, `client/src/pages/FreelancerDashboardPage.jsx` (2) | Marked with `void`; each function already handles its own errors |
| S6544 promise in a condition | `client/src/context/AuthContext.jsx` | Changed to an explicit `revocation === null` check |

### Accessibility (5, accepted)

| Rule | Location | Reason |
|---|---|---|
| S6845 `tabIndex` on a non-interactive element | `client/src/pages/AdminDashboardPage.jsx` (3 table containers) | The containers are scrollable regions with `role="region"` and an `aria-label`. WCAG 2.1.1 requires scrollable regions to be keyboard-focusable, which needs `tabIndex={0}` |
| S9379 `autoFocus` | `client/src/components/bookings/BookGigAction.jsx`, `client/src/pages/FreelancerGigsPage.jsx` | Deliberate focus management: the button that opened the confirmation step unmounts, so focus moves into the step. The delete confirmation focuses the safe "Keep" option |

Each accepted issue carries the reason as a comment in SonarQube Cloud.

### Tests

`api/test/staticAnalysisFixes.test.js` covers the fixes: unexpected gig fields are dropped and the owner comes from the JWT, both email lookups receive a plain string, a 50,000-character slash run is handled quickly, and the email pattern accepts normal addresses while rejecting empty labels. API tests: 89 passed. Client tests: 28 passed.

## Handed off, not changed here

- **Dependency vulnerabilities:** `npm audit` reports 5 in the client (4 moderate, 1 high) and 3 in the API. Sonar's dependency analysis is not part of the Free plan, so these go to the dependency owners.
- **JWT algorithm pinning:** `verifyToken` should pass `algorithms: ['HS256']` (found by P3-13; owner James). Sonar did not flag it.

## CI integration for P3-16

The central workflow belongs to James, so this issue does not edit `.github/workflows/ci.yml`. To add the scan:

1. The repository secret `SONAR_TOKEN` holds a SonarQube Cloud token belonging to Star's account. If that token is revoked, the scan step fails.
2. Check out with full history (`fetch-depth: 0`).
3. Install dependencies with `npm ci` in `api` and in `client`, then run `npm run test:coverage` in both, so both `lcov.info` files exist before the scan.
4. Run the scan from the repository root. `sonar-project.properties` supplies the organization, project key, paths and the blocking setting:

```yaml
- name: SonarQube Cloud scan
  uses: SonarSource/sonarqube-scan-action@4d1dc0c91ee400dcf8a6dddf2f705ac36542e304 # v8.4.0
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

Expected behaviour: the job fails whenever the Sonar way gate fails on new code (ratings below A, new-code coverage under 80%, duplication over 3%, or unreviewed security hotspots). Do not mark the step `continue-on-error`. On the Free plan, pushes to `dev` and pull requests into `dev` are analysed. Pull requests from forks do not receive the secret.

## Evidence

In `evidence/part3/static-analysis/`:

| File | Shows |
|---|---|
| `overview-before.png` | First scan: security rating E, 19 issues |
| `overview-after.png` | After remediation: gate passed, security rating A, 0 security issues, 5 issues (all accepted) |
| `issues-accepted.png` | The 5 accessibility issues, each with status Accepted and a comment |
| `scanner-gate-passed.png` | Scanner output ending in `QUALITY GATE STATUS: PASSED` |

## Sources

- [SonarQube Cloud subscription plans](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans)
- [Creating an organization manually](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-organization/creating-organization/creating-organization-manually)
- [JavaScript/TypeScript test coverage](https://docs.sonarsource.com/sonarqube-cloud/enriching/test-coverage/javascript-typescript-test-coverage/)
- [WCAG 2.1 Success Criterion 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
