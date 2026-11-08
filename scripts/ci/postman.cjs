'use strict';

const { spawnSync } = require('node:child_process');
const { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { validateSuite, validateFixture, evaluateNewman, writeReport } = require('./report.cjs');

const root = path.resolve(__dirname, '../..');
const COLLECTIONS = Object.freeze({
  functional: { file: 'postman_collection.json', folder: null },
  security: { file: 'part3_security_collection.json', folder: 'Security Matrix' },
  limits: { file: 'part3_security_collection.json', folder: 'Rate Limits' }
});

// Keep an exact inventory so a partially executed collection cannot pass CI.
function leafNames(items) {
  return items.flatMap((item) => item.item ? leafNames(item.item) : item.request ? [item.name] : []);
}

function selectSuite(suite) {
  validateSuite(suite);
  const definition = COLLECTIONS[suite];
  if (!definition) throw new Error('Unknown Postman CLI suite.');
  const file = path.join(root, 'postman', definition.file);
  const collection = JSON.parse(readFileSync(file, 'utf8'));
  const items = definition.folder
    ? collection.item.filter((item) => item.name === definition.folder)
    : collection.item;
  if (definition.folder && items.length !== 1) throw new Error('Collection folder must be unambiguous.');
  const expected = leafNames(items);
  if (!expected.length || expected.some((name) => typeof name !== 'string') ||
      new Set(expected).size !== expected.length) {
    throw new Error('Invalid collection request inventory.');
  }
  return { file, folder: definition.folder, expected };
}

// The official JSON reporter can emit Newman's summary schema for compatibility.
function examineSummary(summary, expected, exitStatus) {
  const executions = summary?.run?.executions;
  if (!Array.isArray(executions)) return {
    passed: false, cases: [{ status: 'failed' }], requests: 0, assertions: 0, missingCount: expected.length
  };
  const cases = [];
  for (const execution of executions) {
    if (!Array.isArray(execution.assertions)) {
      return {
        passed: false, cases: [{ status: 'failed' }], requests: executions.length,
        assertions: 0, missingCount: expected.length
      };
    }
    for (const assertion of execution.assertions) {
      cases.push({ status: assertion.skipped ? 'skipped' : assertion.error ? 'failed' : 'passed' });
    }
  }
  const verdict = evaluateNewman(summary, expected, cases, exitStatus === 0 ? null : new Error('CLI run failed'));
  return { ...verdict, cases };
}

function commandArguments({ collection, folder, environment, certificate, report }) {
  const args = [
    'collection', 'run', collection, '-e', environment,
    '--ssl-extra-ca-certs', certificate,
    '--report-events=false', '--ignore-redirects', '--no-insecure-file-read',
    '--timeout', '300000', '--timeout-request', '15000', '--timeout-script', '10000',
    '--bail', '--silent', '-r', 'json',
    '--reporter-json-structure', 'newman',
    '--reporter-json-omitAllHeadersAndBody',
    '--reporter-json-export', report
  ];
  if (folder) args.push('-i', folder);
  return args;
}

function disposableEnvironment(env) {
  return {
    id: 'hustlehub-ci',
    name: 'HustleHub disposable CI environment',
    values: Object.entries({
      baseUrl: 'https://localhost:4000',
      clientOrigin: 'http://localhost:5173',
      adminEmail: env.CI_ADMIN_EMAIL,
      adminPassword: env.CI_ADMIN_PASSWORD,
      jwtSecret: env.JWT_SECRET
    }).map(([key, value]) => ({ key, value, enabled: true, type: 'default' })),
    _postman_variable_scope: 'environment'
  };
}

function runSuite(suite, options = {}) {
  const configuration = selectSuite(suite);
  validateFixture(process.env);
  const certificate = process.env.CI_CA_CERT;
  const output = process.env.CI_REPORT_DIR;
  if (!certificate || !existsSync(certificate) || !output) {
    throw new Error('Trusted certificate and report directory are required.');
  }

  // Temporary source reports and credentials are never copied into CI artifacts.
  const privateDirectory = mkdtempSync(path.join(tmpdir(), 'hustlehub-postman-'));
  // Restrict raw reports and environment values to the current user.
  chmodSync(privateDirectory, 0o700);
  let verdict = { passed: false, cases: [{ status: 'failed' }], requests: 0, assertions: 0, missingCount: configuration.expected.length };
  try {
    const environment = path.join(privateDirectory, 'environment.json');
    const rawReport = path.join(privateDirectory, 'run.json');
    writeFileSync(environment, JSON.stringify(disposableEnvironment(process.env)), { mode: 0o600 });
    const childEnv = { ...process.env, HOME: privateDirectory, XDG_CONFIG_HOME: privateDirectory };
    delete childEnv.POSTMAN_API_KEY;
    delete childEnv.POSTMAN_ACCESS_TOKEN;

    const binary = options.binary || path.join(
      root, 'api', 'node_modules', '.bin', process.platform === 'win32' ? 'postman.cmd' : 'postman'
    );
    const result = spawnSync(binary, commandArguments({
      collection: configuration.file,
      folder: configuration.folder,
      environment,
      certificate,
      report: rawReport
    }), {
      cwd: root, env: childEnv, encoding: 'utf8', timeout: 330000,
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024
    });

    // Do not print CLI output; collection scripts may accidentally log tokens.
    if (!result.error && existsSync(rawReport)) {
      try {
        verdict = examineSummary(JSON.parse(readFileSync(rawReport, 'utf8')), configuration.expected, result.status);
      } catch {
        verdict = { passed: false, cases: [{ status: 'failed' }], requests: 0, assertions: 0, missingCount: configuration.expected.length };
      }
    }
    const cases = [...verdict.cases, { status: verdict.passed ? 'passed' : 'failed' }];
    writeReport(output, suite, cases);
    console.log(`${suite}: ${verdict.requests} executed requests, ${verdict.assertions} assertions, ${verdict.missingCount} missing request definitions.`);
    if (!verdict.passed) console.error('Postman CLI collection execution did not meet the required test contract.');
  } finally {
    rmSync(privateDirectory, { recursive: true, force: true });
  }
  return verdict.passed;
}

if (require.main === module) {
  let passed = false;
  try {
    passed = runSuite(process.argv[2]);
  } catch {
    console.error('Postman CLI runner could not complete. Check dependency installation, disposable fixtures and TLS trust.');
    if (process.env.CI_REPORT_DIR && COLLECTIONS[process.argv[2]]) {
      writeReport(process.env.CI_REPORT_DIR, process.argv[2], [{ status: 'failed' }]);
    }
  }
  process.exitCode = passed ? 0 : 1;
}

module.exports = { leafNames, selectSuite, examineSummary, commandArguments, disposableEnvironment, runSuite };
