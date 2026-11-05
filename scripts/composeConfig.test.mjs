import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compose = read('compose.yaml');
const overlay = read('compose.ci.yaml');
const example = read('.env.example');
const certInit = read('docker/cert-init.sh');
const mongoInit = read('docker/mongo-init.sh');
const smoke = read('scripts/compose-smoke.mjs');

test('builds the existing API and client images from their own contexts', () => {
  assert.match(compose, /context: \.\/api/);
  assert.match(compose, /context: \.\/client/);
  assert.match(compose, /dockerfile: Dockerfile/g);
});

test('publishes both application ports only on localhost', () => {
  assert.match(compose, /127\.0\.0\.1:4000:4000/);
  assert.match(compose, /127\.0\.0\.1:5173:8080/);
  assert.doesNotMatch(compose, /\n\s+- "0\.0\.0\.0:/);
});

test('keeps the browser API origin public and HTTPS by default', () => {
  assert.match(compose, /VITE_API_URL: \$\{VITE_API_URL:-https:\/\/localhost:4000\}/);
  assert.match(example, /VITE_API_URL=https:\/\/localhost:4000/);
  assert.doesNotMatch(compose, /VITE_API_URL:.*http:\/\/api:/);
});

test('configures exact CORS origin to match the browser host port', () => {
  assert.match(compose, /CLIENT_ORIGIN: \$\{CLIENT_ORIGIN:-http:\/\/localhost:5173\}/);
  assert.match(example, /CLIENT_ORIGIN=http:\/\/localhost:5173/);
});

test('does not hardcode live MongoDB credentials or JWT secrets', () => {
  assert.match(compose, /MONGO_URI: \$\{MONGO_URI:-\}/);
  assert.match(compose, /JWT_SECRET: \$\{JWT_SECRET:-\}/);
  assert.match(example, /^MONGO_URI=$/m);
  assert.match(example, /^JWT_SECRET=$/m);
  assert.doesNotMatch(compose, /mongodb\+srv:\/\//);
});

test('uses HTTPS inside the API container with trusted health probes', () => {
  assert.match(compose, /USE_HTTPS: "true"/);
  assert.match(compose, /SSL_KEY_PATH: \/app\/certs\/localhost-key\.pem/);
  assert.match(compose, /HEALTHCHECK_CA_CERT_PATH: \/app\/certs\/localhost-cert\.pem/);
  assert.match(compose, /tls_certs:\/app\/certs:ro/);
});

test('initialises local certificates separately from both application images', () => {
  assert.match(compose, /tls-init:/);
  assert.match(compose, /cert-init\.sh:/);
  assert.match(compose, /service_completed_successfully/);
  assert.match(certInit, /openssl req -x509/);
  assert.match(certInit, /subjectAltName=DNS:localhost,IP:127\.0\.0\.1/);
});

test('restricts the private TLS key to the API runtime user', () => {
  assert.match(certInit, /chown 1000:1000/);
  assert.match(certInit, /chmod 600 "\$key"/);
  assert.match(certInit, /chmod 644 "\$cert"/);
});

test('starts the frontend only after API container health succeeds', () => {
  assert.match(compose, /client:[\s\S]*depends_on:[\s\S]*api:[\s\S]*condition: service_healthy/);
});

test('the CI overlay contains a MongoDB replica-set service with no host port published', () => {
  assert.match(overlay, /mongo:/);
  assert.match(overlay, /image: mongo:8\.0/);
  assert.match(overlay, /--replSet.*rs0/);
  assert.doesNotMatch(overlay, /\n\s+ports:/);
});

test('the replica-set initializer waits for a writable primary', () => {
  assert.match(mongoInit, /rs\.initiate/);
  assert.match(mongoInit, /host: "mongo:27017"/);
  assert.match(mongoInit, /isWritablePrimary/);
  assert.match(overlay, /mongo-init:[\s\S]*condition: service_healthy/);
});

test('CI always overrides the Atlas URI with an isolated database', () => {
  assert.match(overlay, /MONGO_URI: mongodb:\/\/mongo:27017\/hustlehub_ci\?replicaSet=rs0/);
  assert.match(overlay, /COMPOSE_CI_FIXTURE: "true"/);
  assert.match(overlay, /mongo-init:[\s\S]*condition: service_completed_successfully/);
});

test('CI uses a generated signing secret rather than a committed credential', () => {
  assert.match(overlay, /JWT_SECRET: \$\{CI_JWT_SECRET:-\}/);
  assert.doesNotMatch(overlay, /JWT_SECRET: (?!\$\{)/);
});

test('CI disables outbound Grafana delivery', () => {
  for (const key of ['GRAFANA_LOKI_URL', 'GRAFANA_LOKI_USER', 'GRAFANA_LOKI_TOKEN']) {
    assert.match(overlay, new RegExp(`${key}: ""`));
  }
});

test('the integration smoke script refuses non-disposable databases', () => {
  assert.match(smoke, /COMPOSE_CI_FIXTURE/);
  assert.match(smoke, /process\.env\.MONGO_URI/);
  assert.match(smoke, /hustlehub-ci/);
  assert.match(smoke, /process\.env\.JWT_SECRET\.length < 32/);
});

test('the integration workflow validates booking replay and income', () => {
  assert.match(smoke, /randomUUID\(\)/);
  assert.match(smoke, /\/api\/bookings/);
  assert.match(smoke, /replayed, true/);
  assert.match(smoke, /\/api\/income\/me/);
  assert.match(smoke, /\/api\/auth\/register/);
});

test('the smoke test verifies HTTPS using an explicit CA certificate', () => {
  assert.match(smoke, /server[name]*: 'localhost'/);
  assert.match(smoke, /readFileSync\(resolve\(CERT_PATH\)\)/);
  assert.doesNotMatch(smoke, /rejectUnauthorized:\s*false/);
});
