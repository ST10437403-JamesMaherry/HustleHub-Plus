import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import reporting from './report.cjs';

const { CI_MONGO_URI, validateSuite, writeReport, safeStartupEvents } = reporting;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const suite = validateSuite(process.argv[2]);
const directory = path.join(root, 'ci-output', `integration-${suite}`);
const privateDir = mkdtempSync(path.join(tmpdir(), 'hustlehub-ci-'));
const emptyEnv = path.join(privateDir, 'empty.env');
const cert = path.join(privateDir, 'localhost-cert.pem');
writeFileSync(emptyEnv, '', { mode: 0o600 });
rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true });

const jwtSecret = randomBytes(32).toString('hex');
const adminPassword = `Ci-${randomBytes(24).toString('hex')}!`;
if (process.env.GITHUB_ACTIONS === 'true') {
  console.log(`::add-mask::${jwtSecret}`);
  console.log(`::add-mask::${adminPassword}`);
}

// Explicit test values and an empty env file prevent a local Atlas configuration from entering CI.
const env = {
  ...process.env,
  CI: 'true', CI_JWT_SECRET: jwtSecret, JWT_SECRET: jwtSecret,
  MONGO_URI: CI_MONGO_URI, COMPOSE_CI_FIXTURE: 'true',
  CI_ADMIN_EMAIL: 'ci.admin@hustlehub.test', CI_ADMIN_PASSWORD: adminPassword,
  CLIENT_ORIGIN: 'http://localhost:5173', VITE_API_URL: 'https://localhost:4000',
  JWT_EXPIRES_IN: '1h', GRAFANA_LOKI_URL: '', GRAFANA_LOKI_USER: '', GRAFANA_LOKI_TOKEN: '',
  COMPOSE_ENV_FILES: emptyEnv, COMPOSE_DISABLE_ENV_FILE: 'true',
  COMPOSE_CI_CA_PATH: cert, CI_CA_CERT: cert, CI_REPORT_DIR: directory,
  E2E_BASE_URL: 'http://localhost:5173', E2E_API_URL: 'https://localhost:4000',
  E2E_CA_CERT: cert, E2E_SKIP_WEBSERVER: '1', E2E_EVIDENCE: '0',
  CI_BROWSER_OUTPUT: path.join(privateDir, 'browser-output')
};
const compose = ['compose', '--env-file', emptyEnv, '-p', 'hustlehub-ci', '-f', 'compose.yaml', '-f', 'compose.ci.yaml'];
let ownsStack = false;
let failed = false;
let phase = 'preflight';

function command(executable, args, { capture = false, input, cwd = root, timeout = 900000 } = {}) {
  const result = spawnSync(executable, args, {
    cwd, env, encoding: 'utf8', timeout,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'], input
  });
  if (result.error || result.status !== 0) {
    // Never serialize spawn errors: they may include environment values or input buffers.
    throw new Error(`Command failed during ${phase}.`);
  }
  return (result.stdout || '').trim();
}

function dc(args, options) {
  return command('docker', [...compose, ...args], options);
}

function verifyCompose() {
  const config = JSON.parse(dc(['config', '--format', 'json'], { capture: true }));
  const api = config.services?.api;
  assert.equal(api?.environment?.MONGO_URI, CI_MONGO_URI);
  assert.equal(api.environment.COMPOSE_CI_FIXTURE, 'true');
  assert.equal(api.environment.JWT_SECRET, jwtSecret);
  assert.equal(api.environment.USE_HTTPS, 'true');
  assert.equal(api.environment.CLIENT_ORIGIN, 'http://localhost:5173');
  for (const name of ['GRAFANA_LOKI_URL', 'GRAFANA_LOKI_USER', 'GRAFANA_LOKI_TOKEN']) {
    assert.equal(api.environment[name], '');
  }
  assert.ok(config.services.mongo);
  assert.equal((config.services.mongo.ports || []).length, 0);
  assert.equal(config.services.client.build.args.VITE_API_URL, 'https://localhost:4000');
  for (const name of ['api', 'client']) {
    assert.ok(config.services[name].ports.length > 0);
    assert.ok(config.services[name].ports.every((port) => port.host_ip === '127.0.0.1'));
  }
}

function inspectServices() {
  const records = [];
  for (const service of ['api', 'client', 'mongo']) {
    const id = dc(['ps', '-q', service], { capture: true });
    assert.match(id, /^[a-f0-9]+$/);
    const state = JSON.parse(command('docker', ['inspect', '--format', '{{json .State}}', id], { capture: true }));
    assert.equal(state.Status, 'running');
    assert.equal(state.Health?.Status, 'healthy');
    const record = { service, status: 'running', health: 'healthy' };
    if (service !== 'mongo') {
      const uid = dc(['exec', '-T', service, 'id', '-u'], { capture: true });
      assert.match(uid, /^[0-9]+$/);
      assert.notEqual(Number(uid), 0);
      record.uid = Number(uid);
    }
    records.push(record);
  }
  writeFileSync(path.join(directory, 'containers.json'), `${JSON.stringify(records, null, 2)}\n`);
  console.log('Verified healthy API, frontend and MongoDB; both application containers run without root.');
}

try {
  command('docker', ['info'], { capture: true, timeout: 30000 });
  verifyCompose();
  const existing = dc(['ps', '-a', '-q'], { capture: true });
  assert.equal(existing, '', 'The disposable project is already running.');
  // Reuse is refused; every suite receives a fresh database and API rate-limit state.
  ownsStack = true;
  dc(['down', '--volumes', '--remove-orphans']);
  phase = 'build';
  dc(['build', '--pull']);
  phase = 'startup';
  dc(['up', '-d', '--wait', '--wait-timeout', '240'], { timeout: 360000 });
  inspectServices();
  dc(['ps']);
  dc(['exec', '-T', 'api', 'node', 'docker/healthcheck.js']);
  dc(['cp', 'api:/app/certs/localhost-cert.pem', cert]);
  assert.ok(existsSync(cert));

  if (['functional', 'security', 'limits'].includes(suite)) {
    phase = 'administrator-fixture';
    dc(['exec', '-T', '-e', 'CI_ADMIN_EMAIL', '-e', 'CI_ADMIN_PASSWORD', 'api', 'node'], {
      input: readFileSync(path.join(root, 'scripts/ci/seed-admin.cjs'), 'utf8'), timeout: 45000
    });
  }

  phase = suite;
  if (suite === 'smoke') {
    command(process.execPath, ['scripts/compose-smoke.mjs'], { timeout: 120000 });
    writeReport(directory, 'smoke', [{ status: 'passed' }]);
  } else if (suite === 'browser') {
    command(process.execPath, [
      path.join(root, 'e2e/node_modules/@playwright/test/cli.js'),
      'test', '--config', path.join(root, 'scripts/ci/playwright.config.cjs')
    ], { cwd: path.join(root, 'e2e'), timeout: 600000 });
  } else {
    command(process.execPath, ['scripts/ci/postman.cjs', suite], { timeout: 360000 });
  }
} catch {
  failed = true;
  console.error(`CI integration failed during ${phase}. No raw request, credential or database diagnostic was exported.`);
  if (!existsSync(path.join(directory, `${suite}.xml`))) {
    writeReport(directory, suite, [{ status: 'failed' }]);
  }
} finally {
  if (ownsStack) {
    try {
      const logs = dc(['logs', '--no-color', '--no-log-prefix', '--tail', '40', 'api'], { capture: true, timeout: 15000 });
      const events = safeStartupEvents(logs);
      writeFileSync(path.join(directory, 'startup-events.json'), `${JSON.stringify(events, null, 2)}\n`);
      if (failed) console.error(JSON.stringify(events));
    } catch {
      console.error('Startup classifications could not be collected; inspect the container startup step.');
    }

    phase = 'cleanup';
    try {
      dc(['down', '--volumes', '--remove-orphans'], { timeout: 90000 });
    } catch {
      failed = true;
      console.error('Disposable stack cleanup failed; inspect the hustlehub-ci project locally.');
    }
  }
  writeFileSync(path.join(directory, 'result.json'), `${JSON.stringify({ suite, passed: !failed }, null, 2)}\n`);
  rmSync(privateDir, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
