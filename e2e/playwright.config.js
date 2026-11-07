// @ts-check
'use strict';

const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');
const { settings, certificateSpkiHash } = require('./support/settings');

// Trust exactly the local API certificate, by public-key pin, for this test
// browser only. Production code and other certificates keep normal TLS checks.
const spki = certificateSpkiHash(settings.caCertPath);

const evidence = process.env.E2E_EVIDENCE === '1';
const evidenceDir = path.resolve(__dirname, '../evidence/part3/e2e');

module.exports = defineConfig({
  testDir: './tests',
  // Journeys share one API process and its in-memory rate limits.
  fullyParallel: false,
  workers: 1,
  // A retry would spend more of the registration, login and booking quotas.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: require.resolve('./support/global-setup.js'),
  reporter: [
    ['list'],
    ['junit', { outputFile: evidence ? path.join(evidenceDir, 'playwright-junit.xml') : 'test-results/junit.xml' }],
    // The HTML report records typed values, including generated test passwords,
    // so it always stays in the git-ignored local folder and is never evidence.
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: settings.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Optional: reuse a preinstalled Chrome/Chromium (for example a CI image).
          executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
          args: [`--ignore-certificate-errors-spki-list=${spki}`]
        }
      }
    }
  ],
  // Start Vite unless a frontend is already listening (for example the Compose client).
  webServer: process.env.E2E_SKIP_WEBSERVER === '1' ? undefined : {
    command: 'npm --prefix ../client run dev',
    url: settings.webUrl,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_API_URL: settings.apiUrl }
  }
});
