'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const SUITES = new Set(['functional', 'security', 'limits', 'browser', 'smoke']);
const CI_MONGO_URI = 'mongodb://mongo:27017/hustlehub_ci?replicaSet=rs0';

function validateSuite(suite) {
  if (!SUITES.has(suite)) throw new Error('Unknown integration suite.');
  return suite;
}

// Only the disposable replica set may receive generated administrator fixtures.
function validateFixture(env) {
  if (env.COMPOSE_CI_FIXTURE !== 'true' || env.MONGO_URI !== CI_MONGO_URI ||
      !/^[a-f0-9]{64}$/.test(env.JWT_SECRET || '') ||
      env.CI_ADMIN_EMAIL !== 'ci.admin@hustlehub.test' ||
      !/^Ci-[a-f0-9]{48}!$/.test(env.CI_ADMIN_PASSWORD || '')) {
    throw new Error('Refusing to seed a database outside the disposable CI fixture.');
  }
}

// Reports use generated case identifiers and never serialize responses or exception text.
function writeReport(directory, suite, cases) {
  validateSuite(suite);
  const safeCases = cases.map((item, index) => ({
    id: `case-${String(index + 1).padStart(4, '0')}`,
    status: ['passed', 'failed', 'skipped'].includes(item.status) ? item.status : 'failed',
    seconds: Number.isFinite(item.seconds) && item.seconds >= 0 ? item.seconds : 0
  }));
  if (!safeCases.length) safeCases.push({ id: 'case-0001', status: 'failed', seconds: 0 });
  const counts = {
    tests: safeCases.length,
    passedTests: safeCases.filter((item) => item.status === 'passed').length,
    failures: safeCases.filter((item) => item.status === 'failed').length,
    skipped: safeCases.filter((item) => item.status === 'skipped').length
  };
  const passed = counts.failures === 0 && counts.skipped === 0;
  const xmlCases = safeCases.map((item) => {
    const result = item.status === 'passed' ? '' : item.status === 'skipped'
      ? '<skipped message="A required test did not execute."/>'
      : '<failure message="Required check failed. Reproduce locally for detailed diagnostics."/>';
    return `    <testcase classname="${suite}" name="${item.id}" time="${item.seconds.toFixed(3)}">${result}</testcase>`;
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${counts.tests}" failures="${counts.failures}" skipped="${counts.skipped}">`,
    `  <testsuite name="${suite}" tests="${counts.tests}" failures="${counts.failures}" skipped="${counts.skipped}">`,
    ...xmlCases,
    '  </testsuite>',
    '</testsuites>',
    ''
  ].join('\n');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${suite}.xml`), xml);
  writeFileSync(path.join(directory, `${suite}.json`), `${JSON.stringify({
    schemaVersion: 1, suite, passed, ...counts
  }, null, 2)}\n`);
  return { passed, ...counts };
}

// Missing requests, skipped assertions and script failures all prevent a green run.
function evaluateNewman(summary, expectedNames, cases, runError) {
  const executions = summary?.run?.executions || [];
  const visited = new Set(executions.map((entry) => entry.item?.name));
  const missing = expectedNames.filter((name) => !visited.has(name));
  const failures = summary?.run?.failures || [];
  const assertions = summary?.run?.stats?.assertions;
  const passed = !runError && !summary?.error && failures.length === 0 &&
    missing.length === 0 && executions.length > 0 && cases.length > 0 &&
    Number.isInteger(assertions?.total) && assertions.total > 0 &&
    assertions.failed === 0 && !(assertions.pending > 0) &&
    assertions.total === cases.length &&
    Object.values(summary.run.stats).every((stat) => !(stat.failed > 0)) && cases.every((item) => item.status === 'passed');
  return { passed, missingCount: missing.length, requests: executions.length, assertions: cases.length };
}

// Preserve only fixed startup classifications from JSON application logs.
function safeStartupEvents(output) {
  const records = [];
  for (const line of output.split('\n')) {
    try {
      const item = JSON.parse(line);
      if (!['database.ready', 'app.start'].includes(item.event) ||
          !['success', 'failure'].includes(item.outcome)) continue;
      const record = { event: item.event, outcome: item.outcome };
      if (['configuration', 'connection', 'indexes', 'http', 'https'].includes(item.phase)) {
        record.phase = item.phase;
      }
      records.push(record);
    } catch {
      // Non-JSON output is intentionally omitted from diagnostic artifacts.
    }
  }
  return records.slice(-20);
}

module.exports = { CI_MONGO_URI, validateSuite, validateFixture, writeReport, evaluateNewman, safeStartupEvents };
