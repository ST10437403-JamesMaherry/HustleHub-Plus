'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Gig = require('../models/Gig');
const User = require('../models/User');
const { createGig } = require('../controllers/gigController');
const { registerUser, loginUser } = require('../controllers/authController');
const { monitoredEvent } = require('../middleware/requestContext');
const validateRegistration = require('../middleware/validateRegistration');
const { createHttpContext } = require('./helpers/http');

const OWNER_ID = '507f191e810c19729de860ea';

test('gig creation stores only marketplace fields and the authenticated owner', async (t) => {
  let created;
  t.mock.method(Gig, 'create', async (doc) => {
    created = doc;
    return { ...doc, id: 'g1' };
  });

  const context = createHttpContext(
    { title: 'Logo', description: 'A logo design', category: 'Design', price: 50, freelancer: 'attacker', isFeatured: true },
    { auth: { id: OWNER_ID } }
  );
  await createGig(context.req, context.res, context.next);

  assert.equal(context.res.statusCode, 201);
  assert.equal(created.freelancer, OWNER_ID);
  assert.deepEqual(Object.keys(created).sort(), ['active', 'category', 'description', 'freelancer', 'price', 'title']);
});

test('login and registration look up email as a plain string', async (t) => {
  const filters = [];
  t.mock.method(User, 'findOne', (filter) => {
    filters.push(filter);
    const result = Promise.resolve({ id: 'existing' });
    result.select = async () => null;
    return result;
  });

  const login = createHttpContext({ email: 'user@example.com', password: 'Password123!' });
  await loginUser(login.req, login.res, login.next);
  const register = createHttpContext({ fullName: 'User', email: 'user@example.com', password: 'Password123!', role: 'client' });
  await registerUser(register.req, register.res, register.next);

  assert.equal(login.res.statusCode, 401);
  assert.equal(register.res.statusCode, 409);
  assert.deepEqual(filters, [{ email: 'user@example.com' }, { email: 'user@example.com' }]);
});

test('monitored paths ignore trailing slashes without slow backtracking', () => {
  assert.equal(monitoredEvent('POST', '/api/auth/login///'), 'auth.login');
  assert.equal(monitoredEvent('POST', '/'), null);

  const started = process.hrtime.bigint();
  assert.equal(monitoredEvent('POST', `${'/'.repeat(50000)}x`), null);
  assert.ok(process.hrtime.bigint() - started < 250_000_000n);
});

test('email pattern accepts normal addresses and rejects empty domain labels', () => {
  const check = (email) => {
    const context = createHttpContext({ fullName: 'Valid Name', email, password: 'Password123!', role: 'client' });
    validateRegistration(context.req, context.res, context.next);
    return context.res.statusCode;
  };

  assert.equal(check('first.last@mail.example.co.za'), 200);
  assert.equal(check('user@example..com'), 400);
  assert.equal(check('user@.example.com'), 400);
  assert.equal(check('user@example.c'), 400);
});
