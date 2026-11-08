'use strict';

const path = require('node:path');
const { writeReport } = require('./report.cjs');

class SafeBrowserReporter {
  constructor() {
    this.cases = [];
    this.expected = 0;
    this.runnerError = false;
  }

  onBegin(config, suite) {
    this.expected = suite.allTests().length;
    console.log(`Browser suite discovered ${this.expected} tests.`);
  }

  // Do not publish typed values, API payloads, errors, traces or attachments.
  onStdOut() {}
  onStdErr() {}
  onError() { this.runnerError = true; }

  onTestEnd(test, result) {
    const status = result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed';
    this.cases.push({ status, seconds: result.duration / 1000 });
    const file = path.basename(test.location?.file || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const line = Number.isSafeInteger(test.location?.line) ? test.location.line : 0;
    console.log(`Browser case ${this.cases.length}: ${status} (${file}:${line}).`);
  }

  onEnd(result) {
    const complete = result.status === 'passed' && !this.runnerError && this.expected > 0 &&
      this.cases.length === this.expected && this.cases.every((item) => item.status === 'passed');
    this.cases.push({ status: complete ? 'passed' : 'failed' });
    writeReport(process.env.CI_REPORT_DIR, 'browser', this.cases);
    return { status: complete ? 'passed' : 'failed' };
  }
}

module.exports = SafeBrowserReporter;
