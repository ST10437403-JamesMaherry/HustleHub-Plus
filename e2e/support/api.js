'use strict';

// Minimal HTTPS client for fixtures and cross-checks. It verifies the API
// certificate against the local CA file instead of disabling TLS checks.
const https = require('node:https');
const crypto = require('node:crypto');
const { settings, readCertificate } = require('./settings');

const ca = readCertificate(settings.caCertPath);

function request(method, path, { body, token, headers = {} } = {}) {
  const url = new URL(path, settings.apiUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      ca,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      timeout: 15_000
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`Timed out calling ${method} ${url.pathname}`)));
    req.on('error', reject);
    req.end(payload);
  });
}

async function expectStatus(promise, status, action) {
  const response = await promise;

  if (response.status !== status) {
    const detail = response.data?.error ? `: ${response.data.error}` : '';
    throw new Error(`${action} returned HTTP ${response.status}${detail}`);
  }

  return response.data;
}

// Unique, clearly labelled test identities that never collide with assessment users.
function newRunId() {
  return `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

// Names may contain letters only, so the run ID is spelled with letters (0 -> a, 1 -> b...).
const lettersOnly = (value) => value.replace(/[0-9]/g, (digit) => 'abcdefghij'[digit]);

function testAccount(role, runId) {
  return {
    role,
    fullName: `Playwright ${role === 'client' ? 'Client' : 'Freelancer'} ${lettersOnly(runId)}`,
    email: `e2e.${role}.${runId}@hustlehub.test`,
    // Generated per run, never written to disk or reports.
    password: `E2e-${crypto.randomBytes(9).toString('base64url')}!`
  };
}

const api = {
  health: () => request('GET', '/health'),
  register: (account) => expectStatus(
    request('POST', '/api/auth/register', {
      body: { fullName: account.fullName, email: account.email, password: account.password, role: account.role }
    }),
    201,
    `Registering ${account.role}`
  ),
  login: async (account) => {
    const data = await expectStatus(
      request('POST', '/api/auth/login', { body: { email: account.email, password: account.password } }),
      200,
      `Signing in ${account.role}`
    );
    return data.token;
  },
  me: (token) => request('GET', '/api/auth/me', { token }),
  income: (token) => expectStatus(request('GET', '/api/income/me', { token }), 200, 'Reading income'),
  freelancerBookings: (token) => expectStatus(
    request('GET', '/api/bookings/freelancer', { token }), 200, 'Reading freelancer bookings'
  ),
  clientBookings: (token) => expectStatus(request('GET', '/api/bookings/mine', { token }), 200, 'Reading client bookings'),
  deleteGig: (token, id) => request('DELETE', `/api/gigs/${encodeURIComponent(id)}`, { token })
};

module.exports = { api, request, newRunId, testAccount };
