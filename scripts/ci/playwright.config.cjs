'use strict';

const path = require('node:path');
const base = require('../../e2e/playwright.config.js');

// Reuse the real browser tests and certificate pin while keeping private diagnostics out of artifacts.
module.exports = {
  ...base,
  testDir: path.resolve(__dirname, '../../e2e/tests'),
  globalSetup: require.resolve('../../e2e/support/global-setup.js'),
  outputDir: process.env.CI_BROWSER_OUTPUT,
  reporter: [[require.resolve('./playwright-reporter.cjs')]],
  forbidOnly: true,
  retries: 0,
  webServer: undefined,
  use: { ...base.use, trace: 'off', screenshot: 'off', video: 'off' }
};
