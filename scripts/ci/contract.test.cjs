'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateSuite, validateFixture, writeReport, evaluateNewman, safeStartupEvents, CI_MONGO_URI } = require('./report.cjs');
const { evaluateJobs } = require('./gate.cjs');
const { normaliseCoverage } = require('./normalise-coverage.cjs');
const BrowserReporter = require('./playwright-reporter.cjs');
const root = path.resolve(__dirname, '../..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const workflow = read('.github/workflows/ci.yml');
const fixture = () => ({
  COMPOSE_CI_FIXTURE: 'true', MONGO_URI: CI_MONGO_URI, JWT_SECRET: 'a'.repeat(64),
  CI_ADMIN_EMAIL: 'ci.admin@hustlehub.test', CI_ADMIN_PASSWORD: `Ci-${'b'.repeat(48)}!`
});
const jobs = () => Object.fromEntries(
  ['configuration', 'backend', 'frontend', 'dependencies', 'integration', 'sonar']
    .map((name) => [name, { result: 'success' }])
);
const summary = () => ({ run: {
  executions: [{ item: { name: 'A' } }, { item: { name: 'B' } }],
  failures: [], stats: { assertions: { total: 2, failed: 0 } }
} });
const cases = [{ status: 'passed' }, { status: 'passed' }];

function inReportDirectory(callback) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hustlehub-report-test-'));
  try { return callback(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('accepts only the five known integration suites', () => {
  for (const name of ['smoke', 'functional', 'security', 'limits', 'browser']) assert.equal(validateSuite(name), name);
  for (const name of ['', '../secrets', 'production', undefined]) assert.throws(() => validateSuite(name));
});

test('seeding requires the exact disposable replica set and generated credentials', () => {
  assert.doesNotThrow(() => validateFixture(fixture()));
  for (const change of [
    { MONGO_URI: 'mongodb+srv://not-the-test-cluster.example/app' },
    { COMPOSE_CI_FIXTURE: 'false' }, { JWT_SECRET: 'short' },
    { CI_ADMIN_EMAIL: 'real.admin@example.com' }, { CI_ADMIN_PASSWORD: 'short' }
  ]) assert.throws(() => validateFixture({ ...fixture(), ...change }));
});

test('reports drop passwords, payloads, error messages and arbitrary test labels', () => {
  inReportDirectory((dir) => {
    writeReport(dir, 'functional', [{
      status: 'failed', seconds: 1, name: 'secret-label', password: 'SECRET_PASSWORD',
      error: new Error('SECRET_ERROR'), response: { token: 'SECRET_TOKEN' }
    }]);
    const output = readFileSync(path.join(dir, 'functional.xml'), 'utf8') +
      readFileSync(path.join(dir, 'functional.json'), 'utf8');
    assert.doesNotMatch(output, /SECRET_|secret-label/);
    assert.match(output, /failures="1"/);
  });
});

test('empty, malformed and skipped result sets cannot become passing evidence', () => {
  inReportDirectory((dir) => {
    for (const records of [[], [{ status: 'unknown' }], [{ status: 'skipped' }]]) {
      assert.equal(writeReport(dir, 'functional', records).passed, false);
    }
  });
});

test('a complete Newman run with passing assertions succeeds', () => {
  assert.equal(evaluateNewman(summary(), ['A', 'B'], cases).passed, true);
});

test('Newman request or script failures cannot be hidden by a successful callback', () => {
  const value = summary(); value.run.failures.push({ error: 'private details' });
  assert.equal(evaluateNewman(value, ['A', 'B'], cases).passed, false);
  assert.equal(evaluateNewman(summary(), ['A', 'B'], cases, new Error('transport')).passed, false);
});

test('a Newman collection stopped early fails its completeness check', () => {
  assert.equal(evaluateNewman(summary(), ['A', 'B', 'C'], cases).passed, false);
  assert.equal(evaluateNewman(summary(), ['A', 'B'], []).passed, false);
  assert.equal(evaluateNewman(summary(), ['A', 'B'], [{ status: 'skipped' }]).passed, false);
});

test('Playwright runner errors and skipped cases fail the custom reporter', () => {
  inReportDirectory((dir) => {
    const previous = process.env.CI_REPORT_DIR;
    process.env.CI_REPORT_DIR = dir;
    try {
      const reporter = new BrowserReporter();
      reporter.onBegin({}, { allTests: () => [1] });
      reporter.onTestEnd({}, { status: 'skipped', duration: 0 });
      assert.equal(reporter.onEnd({ status: 'passed' }).status, 'failed');
      const empty = new BrowserReporter();
      empty.onError(new Error('SECRET_PAYLOAD'));
      assert.equal(empty.onEnd({ status: 'passed' }).status, 'failed');
      assert.doesNotMatch(readFileSync(path.join(dir, 'browser.xml'), 'utf8'), /SECRET_PAYLOAD/);
    } finally {
      if (previous === undefined) delete process.env.CI_REPORT_DIR;
      else process.env.CI_REPORT_DIR = previous;
    }
  });
});

test('all required GitHub jobs must succeed', () => {
  assert.equal(evaluateJobs(jobs(), true), true);
  for (const result of ['failure', 'skipped', 'cancelled', undefined]) {
    const value = jobs(); value.integration.result = result;
    assert.equal(evaluateJobs(value, true), false);
  }
});

test('missing Sonar is never accepted where the dev gate requires it', () => {
  const value = jobs(); value.sonar.result = 'skipped';
  assert.equal(evaluateJobs(value, true), false);
  assert.equal(evaluateJobs(value, false), true);
  value.sonar.result = 'failure';
  assert.equal(evaluateJobs(value, false), false);
});

test('the manual negative-control test actually exits nonzero', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'negative-control.cjs')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /CI propagates a deliberately failing assertion/);
});

test('workflow actions are pinned and repository token permissions remain read-only', () => {
  const uses = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  assert.ok(uses.every((value) => /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/.test(value)));
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target:|continue-on-error:\s*true|contents:\s*write/);
});

test('pipeline runs each integration suite on a separate matrix runner', () => {
  assert.match(workflow, /suite: \[smoke, functional, security, limits, browser\]/);
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /--audit-level=high/);
  assert.doesNotMatch(workflow, /audit[^\n]*\|\|\s*true/);
});

test('Compose runner verifies isolation and removes its own project on failure', () => {
  const runner = read('scripts/ci/integration.mjs');
  assert.match(runner, /'--env-file', emptyEnv/);
  assert.match(runner, /MONGO_URI, CI_MONGO_URI/);
  assert.match(runner, /finally \{/);
  assert.match(runner, /'down', '--volumes', '--remove-orphans'/);
  assert.match(runner, /'--wait-timeout', '240'/);
  assert.match(runner, /assert\.equal\(existing, ''/);
});

test('CI reports exclude browser diagnostics and all submission-evidence directories', () => {
  const browser = read('scripts/ci/playwright.config.cjs');
  assert.match(browser, /trace: 'off', screenshot: 'off', video: 'off'/);
  assert.match(browser, /webServer: undefined/);
  assert.doesNotMatch(workflow, /path:\s*(?:evidence\/|e2e\/playwright-report|api\/certs|\.env)/);
  assert.match(read('ci-output/.gitignore'), /^\*$/m);
  assert.match(read('ci-output/.gitignore'), /^!\.gitignore$/m);
});

test('administrator provisioning is not exposed as an application route or copied into the image', () => {
  const seed = read('scripts/ci/seed-admin.cjs');
  assert.match(seed, /COMPOSE_CI_FIXTURE !== 'true'/);
  assert.match(seed, /mongoose\.connection\.name !== 'hustlehub_ci'/);
  assert.match(seed, /User\.create/);
  assert.doesNotMatch(seed, /\/api\/auth\/register/);
  assert.doesNotMatch(read('api/Dockerfile'), /seed-admin|scripts\/ci/);
});

test('startup diagnostics contain classifications rather than raw exception text', () => {
  const output = [
    'A private plaintext diagnostic',
    JSON.stringify({ event: 'app.start', outcome: 'failure', message: 'SECRET_VALUE', token: 'SECRET_TOKEN' }),
    JSON.stringify({ event: 'database.ready', outcome: 'failure', phase: 'connection', error: 'SECRET_URI' }),
    JSON.stringify({ event: 'SECRET_EVENT', outcome: 'failure' })
  ].join('\n');
  assert.deepEqual(safeStartupEvents(output), [
    { event: 'app.start', outcome: 'failure' },
    { event: 'database.ready', outcome: 'failure', phase: 'connection' }
  ]);
});

test('backend LCOV paths are made repository-relative for Sonar', () => {
  inReportDirectory((dir) => {
    mkdirSync(path.join(dir, 'api/coverage'), { recursive: true });
    mkdirSync(path.join(dir, 'api/services'), { recursive: true });
    writeFileSync(path.join(dir, 'api/services/test.js'), '');
    const file = path.join(dir, 'api/coverage/lcov.info');
    writeFileSync(file, 'SF:services/test.js\nDA:1,1\nend_of_record\n');
    assert.equal(normaliseCoverage('api', dir), 1);
    assert.match(readFileSync(file, 'utf8'), /^SF:api\/services\/test.js/m);
  });
});

test('coverage normalization preserves already repository-relative client paths', () => {
  inReportDirectory((dir) => {
    mkdirSync(path.join(dir, 'client/coverage'), { recursive: true });
    mkdirSync(path.join(dir, 'client/src'), { recursive: true });
    writeFileSync(path.join(dir, 'client/src/App.jsx'), '');
    const file = path.join(dir, 'client/coverage/lcov.info');
    writeFileSync(file, 'SF:client/src/App.jsx\nend_of_record\n');
    assert.equal(normaliseCoverage('client', dir), 1);
    assert.equal(readFileSync(file, 'utf8'), 'SF:client/src/App.jsx\nend_of_record\n');
  });
});

test('empty coverage and paths outside the package fail closed', () => {
  inReportDirectory((dir) => {
    mkdirSync(path.join(dir, 'api/coverage'), { recursive: true });
    const file = path.join(dir, 'api/coverage/lcov.info');
    writeFileSync(file, '');
    assert.throws(() => normaliseCoverage('api', dir));
    writeFileSync(file, 'SF:../../secrets.js\nend_of_record\n');
    assert.throws(() => normaliseCoverage('api', dir));
  });
});
