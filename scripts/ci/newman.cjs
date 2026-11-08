'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { validateSuite, validateFixture, evaluateNewman, writeReport } = require('./report.cjs');
const root = path.resolve(__dirname, '../..');

function leafNames(items) {
  return items.flatMap((item) => item.item ? leafNames(item.item) : item.request ? [item.name] : []);
}

async function run() {
  const suite = validateSuite(process.argv[2]);
  if (!['functional', 'security', 'limits'].includes(suite)) throw new Error('Not a Newman suite.');
  validateFixture(process.env);
  const cert = process.env.CI_CA_CERT;
  if (!cert || !existsSync(cert)) throw new Error('Verified local certificate is required.');
  const file = suite === 'functional' ? 'postman_collection.json' : 'part3_security_collection.json';
  const collection = JSON.parse(readFileSync(path.join(root, 'postman', file), 'utf8'));
  const folder = suite === 'functional' ? undefined : suite === 'security' ? 'Security Matrix' : 'Rate Limits';
  const selected = folder ? collection.item.filter((item) => item.name === folder) : collection.item;
  const expected = leafNames(selected);
  if (!expected.length || new Set(expected).size !== expected.length) throw new Error('Invalid collection inventory.');
  const newman = createRequire(path.join(root, 'api/package.json'))('newman');
  const cases = [];
  let currentName = 'unknown request';
  const environment = {
    name: 'Disposable CI environment',
    values: Object.entries({
      baseUrl: 'https://localhost:4000', clientOrigin: 'http://localhost:5173',
      adminEmail: process.env.CI_ADMIN_EMAIL, adminPassword: process.env.CI_ADMIN_PASSWORD,
      jwtSecret: process.env.JWT_SECRET
    }).map(([key, value]) => ({ key, value, enabled: true }))
  };

  // Keep credentials in memory and suppress reporters that can serialize response bodies.
  await new Promise((resolve) => {
    const emitter = newman.run({
      collection, environment, folder, reporters: [],
      sslExtraCaCerts: cert, insecure: false, ignoreRedirects: true,
      workingDir: root, insecureFileRead: false,
      timeout: 300000, timeoutRequest: 15000, timeoutScript: 10000,
      bail: true
    }, (error, summary) => {
      const verdict = evaluateNewman(summary, expected, cases, error);
      cases.push({ status: verdict.passed ? 'passed' : 'failed' });
      writeReport(process.env.CI_REPORT_DIR, suite, cases);
      console.log(`${suite}: ${verdict.requests} requests, ${verdict.assertions} assertion events, ${verdict.missingCount} unvisited request definitions.`);
      if (!verdict.passed) {
        console.error('Newman failed or stopped early. Detailed payloads are intentionally not exported.');
        process.exitCode = 1;
      }
      resolve();
    });
    emitter.on('beforeItem', (error, event) => {
      currentName = expected.includes(event.item?.name) ? event.item.name : 'unknown request';
    });
    emitter.on('assertion', (error, event) => {
      cases.push({ status: event.skipped ? 'skipped' : (error || event.error) ? 'failed' : 'passed' });
      if (error || event.error) console.error(`Failed assertion event ${cases.length}: ${currentName}.`);
    });
  });
}

run().catch(() => {
  console.error('Newman runner could not complete. Check dependencies, fixture setup and the certificate.');
  if (process.env.CI_REPORT_DIR && ['functional', 'security', 'limits'].includes(process.argv[2])) {
    writeReport(process.env.CI_REPORT_DIR, process.argv[2], [{ status: 'failed' }]);
  }
  process.exitCode = 1;
});
