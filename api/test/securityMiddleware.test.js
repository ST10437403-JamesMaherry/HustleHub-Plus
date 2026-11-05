'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const validateBooking = require('../middleware/validateBooking');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { notFoundHandler, errorHandler } = require('../middleware/errorHandler');
const { createToken } = require('../utils/token');
const User = require('../models/User');
const { createHttpContext } = require('./helpers/http');

const VALID_GIG_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f191e810c19729de860ea';

function run(middleware, body = {}, overrides = {}) {
  const context = createHttpContext(body, overrides);
  middleware(context.req, context.res, context.next);
  return context;
}

async function runProtected(body = {}, overrides = {}) {
  const context = createHttpContext(body, overrides);
  await protect(context.req, context.res, context.next);
  return context;
}

async function withJwtSettings(settings, callback) {
  const previousSecret = process.env.JWT_SECRET;
  const previousExpiry = process.env.JWT_EXPIRES_IN;

  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.JWT_EXPIRES_IN = settings.expiresIn || '1h';

  try {
    return await callback();
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;

    if (previousExpiry === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = previousExpiry;
  }
}

test('booking validation accepts only a properly formatted gig ID', () => {
  const { req, nextCalls } = run(validateBooking, { gigId: ` ${VALID_GIG_ID} ` });

  assert.equal(nextCalls.length, 1);
  assert.deepEqual(req.body, { gigId: VALID_GIG_ID });
});

test('booking validation rejects client-supplied prices and ownership overrides', () => {
  for (const extra of [
    { amount: 1 },
    { price: 1 },
    { freelancer: VALID_USER_ID },
    { client: VALID_USER_ID },
    { status: 'confirmed' }
  ]) {
    const { res, nextCalls } = run(validateBooking, { gigId: VALID_GIG_ID, ...extra });
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalls.length, 0);
  }
});

test('booking validation rejects non-string, malformed and operator-based IDs', () => {
  for (const gigId of ['', 'not-an-id', { $ne: null }, [], 123]) {
    const { res, nextCalls } = run(validateBooking, { gigId });
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalls.length, 0);
  }
});

test('role authorisation blocks missing, incorrect or elevated roles', () => {
  for (const auth of [undefined, { id: VALID_USER_ID, role: 'client' }, { id: VALID_USER_ID, role: 'admin' }]) {
    const { res, nextCalls } = run(authorizeRoles('freelancer'), {}, { auth });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Access denied' });
    assert.equal(nextCalls.length, 0);
  }

  const accepted = run(authorizeRoles('freelancer'), {}, { auth: { id: VALID_USER_ID, role: 'freelancer' } });
  assert.equal(accepted.nextCalls.length, 1);
});

test('JWT guard rejects missing and incorrectly formatted Authorization headers', async () => {
  for (const authorization of [undefined, 'Token abc', 'Bearer', 'Bearer first second', 'Basic abc']) {
    const headers = authorization ? { authorization } : {};
    const { res, nextCalls } = await runProtected({}, { headers });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalls.length, 0);
  }
});

test('JWT guard checks the account and uses only current database claims', async (t) => {
  t.mock.method(User, 'findById', async (id) => ({
    id,
    role: 'freelancer',
    sessionVersion: 0
  }));

  await withJwtSettings({}, async () => {
    const token = createToken({ id: VALID_USER_ID, role: 'freelancer', sessionVersion: 0 });
    const { req, res, nextCalls } = await runProtected({}, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(res.body, undefined);
    assert.equal(nextCalls.length, 1);
    assert.deepEqual(req.auth, {
      id: VALID_USER_ID,
      role: 'freelancer',
      sessionVersion: 0
    });
    assert.equal(req.user.role, 'freelancer');
  });
});

test('JWT guard rejects corrupted and expired tokens', async () => {
  await withJwtSettings({}, async () => {
    const valid = createToken({ id: VALID_USER_ID, role: 'client', sessionVersion: 0 });
    const parts = valid.split('.');
    const signature = parts[2];
    const corrupted = `${parts[0]}.${parts[1]}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const bad = await runProtected({}, { headers: { authorization: `Bearer ${corrupted}` } });
    assert.equal(bad.res.statusCode, 401);
    assert.equal(bad.nextCalls.length, 0);
  });

  await withJwtSettings({ expiresIn: '-1s' }, async () => {
    const expired = createToken({ id: VALID_USER_ID, role: 'client', sessionVersion: 0 });
    const bad = await runProtected({}, { headers: { authorization: `Bearer ${expired}` } });
    assert.equal(bad.res.statusCode, 401);
    assert.equal(bad.nextCalls.length, 0);
  });
});

test('unknown routes return a controlled 404', () => {
  const { req, res } = createHttpContext({}, { method: 'GET', originalUrl: '/does-not-exist' });
  notFoundHandler(req, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Route not found' });
});

test('API errors never disclose underlying exception details to clients', (t) => {
  t.mock.method(console, 'error', () => {});
  const { req, res, next } = createHttpContext();
  errorHandler(new Error('Private database connection details must not be returned'), req, res, next);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});

test('malformed JSON returns a controlled client error', (t) => {
  t.mock.method(console, 'error', () => {});
  const { req, res, next } = createHttpContext();
  const error = new SyntaxError('Unexpected private request body');
  error.type = 'entity.parse.failed';
  error.status = 400;

  errorHandler(error, req, res, next);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Request body is not valid JSON' });
});
