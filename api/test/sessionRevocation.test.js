'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { createToken, verifyToken } = require('../utils/token');
const { protect } = require('../middleware/authMiddleware');
const { logoutUser, getCurrentUser } = require('../controllers/authController');
const { createHttpContext } = require('./helpers/http');

const USER_ID = '507f191e810c19729de860ea';
const INVALID_RESPONSE = { error: 'Invalid or expired authentication token' };

async function withJwtSecret(callback) {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomBytes(32).toString('hex');

  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}

async function authorize(token) {
  const context = createHttpContext({}, {
    headers: { authorization: `Bearer ${token}` }
  });
  await protect(context.req, context.res, context.next);
  return context;
}

async function signOut(auth) {
  const context = createHttpContext({}, { auth });
  await logoutUser(context.req, context.res, context.next);
  return context;
}

test('new tokens include session version but never user credentials', async () => {
  await withJwtSecret(async () => {
    const token = createToken({
      id: USER_ID, role: 'freelancer', sessionVersion: 7,
      email: 'private@example.com', passwordHash: 'private-hash'
    });
    const payload = verifyToken(token);
    assert.equal(payload.id, USER_ID);
    assert.equal(payload.role, 'freelancer');
    assert.equal(payload.sessionVersion, 7);
    assert.equal(payload.email, undefined);
    assert.equal(payload.passwordHash, undefined);
  });
});

test('tokens use version zero for existing users without stored session state', async (t) => {
  t.mock.method(User, 'findById', async (id) => ({ id, role: 'client' }));

  await withJwtSecret(async () => {
    const token = createToken({ id: USER_ID, role: 'client' });
    assert.equal(verifyToken(token).sessionVersion, 0);
    const result = await authorize(token);
    assert.equal(result.nextCalls.length, 1);
    assert.equal(result.req.auth.sessionVersion, 0);
  });
});

test('legacy signed JWTs lacking the session version are rejected', async (t) => {
  const lookup = t.mock.method(User, 'findById', async () => {
    throw new Error('Legacy token must not query the database');
  });

  await withJwtSecret(async () => {
    const legacy = jwt.sign({ id: USER_ID, role: 'client' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const result = await authorize(legacy);
    assert.equal(result.res.statusCode, 401);
    assert.deepEqual(result.res.body, INVALID_RESPONSE);
    assert.equal(lookup.mock.callCount(), 0);
  });
});

test('deleted accounts and changed roles reject otherwise valid JWTs', async (t) => {
  let current = null;
  t.mock.method(User, 'findById', async () => current);

  await withJwtSecret(async () => {
    const token = createToken({ id: USER_ID, role: 'freelancer', sessionVersion: 1 });
    const missing = await authorize(token);
    assert.equal(missing.res.statusCode, 401);
    assert.equal(missing.nextCalls.length, 0);

    current = { id: USER_ID, role: 'client', sessionVersion: 1 };
    const changed = await authorize(token);
    assert.equal(changed.res.statusCode, 401);
    assert.deepEqual(changed.res.body, INVALID_RESPONSE);
  });
});

test('invalid session-version values are rejected before database access', async (t) => {
  const lookup = t.mock.method(User, 'findById', async () => {
    throw new Error('Invalid version must not query the database');
  });

  await withJwtSecret(async () => {
    for (const sessionVersion of [-1, 1.5, '1', null]) {
      const token = jwt.sign({ id: USER_ID, role: 'client', sessionVersion }, process.env.JWT_SECRET);
      const result = await authorize(token);
      assert.equal(result.res.statusCode, 401);
      assert.equal(result.nextCalls.length, 0);
    }
    assert.equal(lookup.mock.callCount(), 0);
  });
});

test('atomic logout invalidates old tokens across sessions and permits new login', async (t) => {
  let version = 2;
  const user = { id: USER_ID, role: 'freelancer' };
  t.mock.method(User, 'findById', async (id) => ({ ...user, id, sessionVersion: version }));
  const update = t.mock.method(User, 'updateOne', async (filter, changes) => {
    assert.equal(filter._id, USER_ID);
    assert.deepEqual(filter.$or, [{ sessionVersion: 2 }]);
    assert.deepEqual(changes, { $inc: { sessionVersion: 1 } });
    version += 1;
    return { modifiedCount: 1 };
  });

  await withJwtSecret(async () => {
    const firstToken = createToken({ ...user, sessionVersion: version });
    const secondToken = jwt.sign({
      id: USER_ID, role: 'freelancer', sessionVersion: version, session: 'second browser'
    }, process.env.JWT_SECRET, { expiresIn: '1h' });

    for (const token of [firstToken, secondToken]) {
      const before = await authorize(token);
      assert.equal(before.nextCalls.length, 1);
      assert.equal(before.res.body, undefined);
    }

    const signedOut = await signOut({ id: USER_ID, role: 'freelancer', sessionVersion: 2 });
    assert.equal(signedOut.res.statusCode, 200);
    assert.deepEqual(signedOut.res.body, { message: 'Signed out successfully' });
    assert.equal(version, 3);
    assert.equal(update.mock.callCount(), 1);

    for (const token of [firstToken, secondToken]) {
      const after = await authorize(token);
      assert.equal(after.res.statusCode, 401);
      assert.deepEqual(after.res.body, INVALID_RESPONSE);
    }

    const freshToken = createToken({ ...user, sessionVersion: version });
    const afterLogin = await authorize(freshToken);
    assert.equal(afterLogin.nextCalls.length, 1);
    assert.equal(afterLogin.req.auth.sessionVersion, 3);
  });
});

test('logout safely handles accounts that predate the session-version field', async (t) => {
  const update = t.mock.method(User, 'updateOne', async (filter, changes) => {
    assert.deepEqual(filter, {
      _id: USER_ID,
      $or: [
        { sessionVersion: 0 },
        { sessionVersion: { $exists: false } }
      ]
    });
    assert.deepEqual(changes, { $inc: { sessionVersion: 1 } });
    return { modifiedCount: 1 };
  });

  const result = await signOut({ id: USER_ID, role: 'client', sessionVersion: 0 });
  assert.equal(result.res.statusCode, 200);
  assert.equal(update.mock.callCount(), 1);
});

test('a stale concurrent logout cannot report successful invalidation', async (t) => {
  t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 0 }));

  const result = await signOut({ id: USER_ID, role: 'client', sessionVersion: 8 });
  assert.equal(result.res.statusCode, 401);
  assert.deepEqual(result.res.body, INVALID_RESPONSE);
});

test('database failures are passed to the central error handler', async (t) => {
  const dbError = new Error('Private database connection details');
  t.mock.method(User, 'findById', async () => { throw dbError; });
  t.mock.method(User, 'updateOne', async () => { throw dbError; });

  await withJwtSecret(async () => {
    const token = createToken({ id: USER_ID, role: 'client', sessionVersion: 0 });
    const guarded = await authorize(token);
    assert.equal(guarded.nextCalls.length, 1);
    assert.equal(guarded.nextCalls[0], dbError);
    assert.equal(guarded.res.body, undefined);
  });

  const signedOut = await signOut({ id: USER_ID, role: 'client', sessionVersion: 0 });
  assert.equal(signedOut.nextCalls[0], dbError);
  assert.equal(signedOut.res.body, undefined);
});

test('authenticated profile returns safe account fields without session state', () => {
  const context = createHttpContext({}, {
    user: {
      id: USER_ID,
      fullName: 'Example User',
      email: 'example@example.com',
      role: 'freelancer',
      sessionVersion: 5,
      passwordHash: 'sensitive-hash'
    }
  });

  getCurrentUser(context.req, context.res, context.next);
  assert.equal(context.res.statusCode, 200);
  assert.deepEqual(context.res.body, {
    user: {
      id: USER_ID,
      fullName: 'Example User',
      email: 'example@example.com',
      role: 'freelancer'
    }
  });
});
