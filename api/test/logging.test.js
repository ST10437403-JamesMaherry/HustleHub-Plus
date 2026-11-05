'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const eventLogger = require('../utils/logger');
const { requestContext, monitoredEvent, outcomeFor } = require('../middleware/requestContext');
const { errorHandler } = require('../middleware/errorHandler');
const { createHttpContext } = require('./helpers/http');

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

function loggedEntries(t) {
  const records = [];
  t.mock.method(eventLogger.winstonLogger, 'log', (entry) => {
    records.push(entry);
  });
  return records;
}

function completeRequest(method, path, statusCode, headers = {}) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = {};
  res.setHeader = (key, value) => { res.headers[key] = value; };
  const req = { method, path, headers };
  let nextCalls = 0;
  requestContext(req, res, () => { nextCalls += 1; });
  res.emit('finish');
  return { req, res, nextCalls };
}

test('structured events emit only allowlisted fields', (t) => {
  const records = loggedEntries(t);
  const secret = 'fake-secret-password-should-never-appear';
  const emitted = eventLogger.logEvent('auth.login', 'failure', {
    requestId: REQUEST_ID,
    method: 'POST',
    statusCode: 401,
    password: secret,
    token: secret,
    headers: { authorization: secret },
    email: secret,
    uri: secret,
    requestBody: secret,
    error: new Error(secret)
  });

  assert.equal(emitted, true);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    level: 'warn',
    message: 'auth.login',
    event: 'auth.login',
    outcome: 'failure',
    requestId: REQUEST_ID,
    statusCode: 401,
    method: 'POST',
    errorType: 'Error'
  });
  assert.ok(!JSON.stringify(records[0]).includes(secret));
});

test('malformed and caller-provided identifiers are discarded', (t) => {
  const records = loggedEntries(t);
  eventLogger.logEvent('booking.create', 'failure', {
    requestId: 'my-injected-request-id\nAuthorization: Bearer TOKEN',
    statusCode: 999,
    method: 'DELETE THIS',
    phase: '/secrets',
    error: { name: 'secret-api-key' }
  });

  assert.deepEqual(records[0], {
    level: 'warn',
    message: 'booking.create',
    event: 'booking.create',
    outcome: 'failure',
    errorType: 'OtherError'
  });
});

test('severity distinguishes business activity, conflicts and unexpected failures', (t) => {
  const records = loggedEntries(t);
  eventLogger.logEvent('transaction.commit', 'success', { statusCode: 201 });
  eventLogger.logEvent('booking.create', 'replayed', { statusCode: 200 });
  eventLogger.logEvent('booking.create', 'conflict', { statusCode: 409 });
  eventLogger.logEvent('api.error', 'failure', { statusCode: 400 });
  eventLogger.logEvent('api.error', 'failure', { statusCode: 500 });
  eventLogger.logEvent('database.ready', 'failure', { phase: 'indexes' });

  assert.deepEqual(records.map((row) => row.level), [
    'info', 'info', 'warn', 'warn', 'error', 'error'
  ]);
  assert.equal(records[5].phase, 'indexes');
});

test('unknown event types and outcomes cannot create unstructured log records', (t) => {
  const records = loggedEntries(t);
  assert.equal(eventLogger.logEvent('custom.payload', 'success', { body: 'secret' }), false);
  assert.equal(eventLogger.logEvent('auth.login', 'unknown', {}), false);
  assert.deepEqual(records, []);
});

test('logging transport exceptions do not interrupt request operations', (t) => {
  t.mock.method(eventLogger.winstonLogger, 'log', () => {
    throw new Error('transport unavailable');
  });
  assert.doesNotThrow(() => {
    assert.equal(eventLogger.logEvent('booking.create', 'success', { statusCode: 201 }), false);
  });
});

test('login attempts and booking outcomes are classified by completed response', (t) => {
  const records = [];
  t.mock.method(eventLogger, 'logEvent', (...args) => { records.push(args); });

  completeRequest('POST', '/api/auth/login', 200);
  completeRequest('POST', '/api/auth/login', 401);
  completeRequest('POST', '/api/auth/login', 429);
  completeRequest('POST', '/api/auth/logout', 200);
  completeRequest('POST', '/api/bookings', 201);
  completeRequest('POST', '/api/bookings', 200);
  completeRequest('POST', '/api/bookings', 409);
  completeRequest('POST', '/api/bookings', 400);

  assert.deepEqual(records.map(([event, outcome]) => [event, outcome]), [
    ['auth.login', 'success'],
    ['auth.login', 'failure'],
    ['auth.login', 'failure'],
    ['auth.logout', 'success'],
    ['booking.create', 'success'],
    ['booking.create', 'replayed'],
    ['booking.create', 'conflict'],
    ['booking.create', 'failure']
  ]);
  assert.ok(records.every(([, , fields]) => fields.method === 'POST'));
  assert.ok(records.every(([, , fields]) => /^[a-f\d-]{36}$/i.test(fields.requestId)));
});

test('request IDs are server-generated and exposed to the browser safely', (t) => {
  const records = [];
  t.mock.method(eventLogger, 'logEvent', (...args) => { records.push(args); });

  const supplied = '11111111-1111-4111-8111-111111111111';
  const completed = completeRequest('POST', '/api/bookings', 201, {
    'x-request-id': supplied,
    authorization: 'Bearer should-never-be-logged'
  });

  assert.equal(completed.nextCalls, 1);
  assert.notEqual(completed.req.requestId, supplied);
  assert.equal(completed.res.headers['X-Request-ID'], completed.req.requestId);
  assert.equal(records[0][2].requestId, completed.req.requestId);
  assert.ok(!JSON.stringify(records).includes('should-never-be-logged'));
});

test('health checks and other endpoints do not generate audit noise', (t) => {
  const records = [];
  t.mock.method(eventLogger, 'logEvent', (...args) => { records.push(args); });
  completeRequest('GET', '/health', 200);
  completeRequest('GET', '/api/bookings', 200);
  completeRequest('POST', '/api/auth/register', 201);

  assert.equal(records.length, 0);
  assert.equal(monitoredEvent('GET', '/api/auth/login'), null);
  assert.equal(outcomeFor('booking.create', 200), 'replayed');
});

test('unexpected API errors preserve a safe response and redact exception details', (t) => {
  const entries = loggedEntries(t);
  const { req, res, next } = createHttpContext({}, {
    method: 'POST',
    requestId: REQUEST_ID,
    originalUrl: '/api/bookings?token=should-not-appear'
  });
  const error = new Error('mongodb://fake-user:fake-password@fake-host/private');
  error.stack = 'Authorization: Bearer private-token';

  errorHandler(error, req, res, next);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, 'api.error');
  assert.equal(entries[0].requestId, REQUEST_ID);
  assert.equal(entries[0].errorType, 'Error');
  assert.ok(!JSON.stringify(entries).includes('private-token'));
  assert.ok(!JSON.stringify(entries).includes('fake-password'));
});
