import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';

const CI_MONGO_URI = 'mongodb://mongo:27017/hustlehub_ci?replicaSet=rs0';
const FRONTEND_ORIGIN = 'http://localhost:5173';
const CERT_PATH = process.env.COMPOSE_CI_CA_PATH || 'api/certs/compose-ci-localhost-cert.pem';

// Reject destructive integration tests unless the isolated Compose database is active.
function assertDisposableDatabase() {
  const code = `
    if (process.env.COMPOSE_CI_FIXTURE !== 'true' ||
        process.env.MONGO_URI !== ${JSON.stringify(CI_MONGO_URI)} ||
        typeof process.env.JWT_SECRET !== 'string' ||
        process.env.JWT_SECRET.length < 32) process.exit(2);
  `;
  execFileSync('docker', [
    'compose', '-p', 'hustlehub-ci', '-f', 'compose.yaml', '-f', 'compose.ci.yaml',
    'exec', '-T', 'api', 'node', '-e', code
  ], { stdio: 'ignore', timeout: 15000 });
}

// Use the generated certificate to verify HTTPS without disabling TLS checks.
function send({ secure = true, path, method = 'GET', body, token, requestKey, ca }) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (secure) headers.Origin = FRONTEND_ORIGIN;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestKey) headers['Idempotency-Key'] = requestKey;
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolveResult, reject) => {
    const transport = secure ? httpsRequest : httpRequest;
    const options = {
      hostname: '127.0.0.1',
      port: secure ? 4000 : 5173,
      path,
      method,
      headers,
      ...(secure ? { ca, servername: 'localhost' } : {})
    };
    const request = transport(options, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (part) => {
        text += part;
        if (text.length > 128 * 1024) request.destroy(new Error('Oversized smoke-test response'));
      });
      response.on('end', () => {
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        resolveResult({ status: response.statusCode, headers: response.headers, data, text });
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('Smoke-test request timed out')));
    request.once('error', reject);
    request.end(payload);
  });
}

async function run() {
  assertDisposableDatabase();
  const ca = readFileSync(resolve(CERT_PATH));
  const api = (path, options = {}) => send({ path, ca, ...options });

  const health = await api('/health');
  assert.equal(health.status, 200, 'API must return HTTP 200');
  assert.equal(health.data?.status, 'OK');
  assert.equal(health.data?.protocol, 'HTTPS');
  assert.equal(health.headers['access-control-allow-origin'], FRONTEND_ORIGIN);
  console.log('PASS: TLS-verified API health and browser CORS origin');

  for (const path of ['/', '/login', '/bookings', '/freelancer/dashboard', '/admin']) {
    const page = await send({ secure: false, path });
    assert.equal(page.status, 200, `SPA route ${path} must return HTTP 200`);
    assert.match(page.headers['content-type'] || '', /text\/html/);
    assert.match(page.text, /id="root"/);
  }
  const absentAsset = await send({ secure: false, path: '/assets/does-not-exist.js' });
  assert.equal(absentAsset.status, 404, 'Missing build assets must return 404');
  console.log('PASS: frontend static serving, SPA fallback, missing asset status');

  const unique = randomUUID().replaceAll('-', '');
  const password = `Smoke${randomUUID()}A1!`;
  const freelancerEmail = `freelancer-${unique}@example.test`;
  const clientEmail = `client-${unique}@example.test`;

  async function createAccount(fullName, email, role) {
    const registration = await api('/api/auth/register', {
      method: 'POST',
      body: { fullName, email, password, role }
    });
    assert.equal(registration.status, 201, `${role} registration failed`);

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    assert.equal(login.status, 200, `${role} login failed`);
    assert.equal(typeof login.data?.token, 'string');
    return login.data.token;
  }

  const freelancerToken = await createAccount('Smoke Freelancer', freelancerEmail, 'freelancer');
  const clientToken = await createAccount('Smoke Client', clientEmail, 'client');
  console.log('PASS: isolated freelancer/client registration and login');

  const createdGig = await api('/api/gigs', {
    method: 'POST',
    token: freelancerToken,
    body: {
      title: 'Compose smoke service',
      description: 'A disposable service used only by the isolated integration test.',
      category: 'Web Development',
      price: 123.45,
      active: true
    }
  });
  assert.equal(createdGig.status, 201, 'Gig creation failed');
  assert.ok(createdGig.data?.gig?.id, 'Gig creation must return an ID');
  console.log('PASS: authenticated freelancer gig creation');

  const requestKey = randomUUID();
  const firstBooking = await api('/api/bookings', {
    method: 'POST',
    token: clientToken,
    requestKey,
    body: { gigId: createdGig.data.gig.id }
  });
  assert.equal(firstBooking.status, 201, 'Booking creation failed');
  assert.equal(firstBooking.data?.booking?.amount, 123.45);
  assert.equal(firstBooking.data?.transaction?.amount, 123.45);
  assert.equal(firstBooking.data?.transaction?.booking, firstBooking.data?.booking?.id);
  assert.equal(firstBooking.data?.replayed, false);

  const replay = await api('/api/bookings', {
    method: 'POST',
    token: clientToken,
    requestKey,
    body: { gigId: createdGig.data.gig.id }
  });
  assert.equal(replay.status, 200, 'Booking replay failed');
  assert.equal(replay.data?.replayed, true);
  assert.equal(replay.data?.booking?.id, firstBooking.data.booking.id);
  assert.equal(replay.data?.transaction?.id, firstBooking.data.transaction.id);

  const clientBookings = await api('/api/bookings/mine', { token: clientToken });
  assert.equal(clientBookings.status, 200);
  assert.equal(clientBookings.data?.bookings?.length, 1, 'Replay must not duplicate bookings');

  const income = await api('/api/income/me', { token: freelancerToken });
  assert.equal(income.status, 200);
  assert.equal(income.data?.totalIncome, 123.45);
  assert.equal(income.data?.transactionCount, 1);
  console.log('PASS: atomic booking/transaction, idempotent replay and freelancer income');
  console.log('P3-11 disposable Compose integration smoke test: PASSED');
}

run().catch((error) => {
  console.error('P3-11 smoke test failed:', error.message);
  console.error('The test requires the isolated hustlehub-ci Compose project.');
  process.exitCode = 1;
});
