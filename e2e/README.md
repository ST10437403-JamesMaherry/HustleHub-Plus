# HustleHub+ browser tests

Real-browser Playwright tests for the React frontend, the HTTPS API and MongoDB together. Full documentation: [`docs/testing/e2e-playwright.md`](../docs/testing/e2e-playwright.md).

```bash
npm --prefix e2e ci
npm --prefix e2e run install:browser
# with a freshly started API (npm --prefix api start):
npm --prefix e2e test
```

| Path | Contents |
|---|---|
| `playwright.config.js` | Chromium project, certificate pin, Vite web server, reporters. |
| `playwright.evidence.config.js` | Writes reports and screenshots to `evidence/part3/e2e/`. |
| `support/` | Settings, the CA-verifying API client, isolated test accounts, UI helpers and the SARS oracle. |
| `tests/` | `marketplace-journey.spec.js` and `access-control.spec.js`. |
