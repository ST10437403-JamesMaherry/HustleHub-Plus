'use strict';

// Same suite, but the JUnit report and screenshots are written to evidence/part3/e2e.
// Setting the flag here keeps the npm script identical on Windows, macOS and Linux.
process.env.E2E_EVIDENCE = '1';

module.exports = require('./playwright.config');
