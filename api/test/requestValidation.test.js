'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const validateRegistration = require('../middleware/validateRegistration');
const validateLogin = require('../middleware/validateLogin');
const {
  validateGigCreate,
  validateGigUpdate
} = require('../middleware/validateGig');
const { sanitizeFields } = require('../middleware/sanitizeInput');
const { createHttpContext } = require('./helpers/http');

function run(middleware, body) {
  const context = createHttpContext(body);
  middleware(context.req, context.res, context.next);
  return context;
}

test('registration normalises the allowed fields and discards unexpected properties', () => {
  const input = {
    fullName: '  Demo Freelancer  ',
    email: '  DEMO@EXAMPLE.COM  ',
    password: 'SecureTest123!',
    role: ' Freelancer ',
    isAdmin: true,
    passwordHash: 'untrusted'
  };
  const { req, res, nextCalls } = run(validateRegistration, input);

  assert.equal(nextCalls.length, 1);
  assert.equal(res.body, undefined);
  assert.deepEqual(req.body, {
    fullName: 'Demo Freelancer',
    email: 'demo@example.com',
    password: 'SecureTest123!',
    role: 'freelancer'
  });
});

test('registration blocks administrator self-registration and invalid roles', () => {
  for (const role of ['admin', 'owner', '', 5]) {
    const { res, nextCalls } = run(validateRegistration, {
      fullName: 'Demo Client',
      email: 'demo@example.com',
      password: 'SecureTest123!',
      role
    });
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalls.length, 0);
  }
});

test('registration rejects object-valued credentials and array request bodies', () => {
  const valid = {
    fullName: 'Demo Client',
    email: 'demo@example.com',
    password: 'SecureTest123!',
    role: 'client'
  };

  for (const body of [[], null, { ...valid, email: { $ne: null } }, { ...valid, password: [] }]) {
    const { res, nextCalls } = run(validateRegistration, body);
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalls.length, 0);
  }
});

test('registration enforces the bcrypt password limit in UTF-8 bytes', () => {
  const base = {
    fullName: 'Demo Client',
    email: 'demo@example.com',
    password: 'a'.repeat(72),
    role: 'client'
  };

  assert.equal(run(validateRegistration, base).nextCalls.length, 1);
  assert.equal(run(validateRegistration, { ...base, password: '€'.repeat(25) }).res.statusCode, 400);
  assert.equal(run(validateRegistration, { ...base, password: 'a'.repeat(73) }).res.statusCode, 400);
});

test('login normalises email without altering the submitted password', () => {
  const { req, nextCalls } = run(validateLogin, {
    email: '  USER@Example.Com ',
    password: 'KeepCase123!',
    role: 'admin'
  });

  assert.equal(nextCalls.length, 1);
  assert.deepEqual(req.body, {
    email: 'user@example.com',
    password: 'KeepCase123!'
  });
});

test('login rejects malformed NoSQL-operator inputs before authentication', () => {
  for (const body of [
    { email: { $ne: null }, password: 'SecureTest123!' },
    { email: 'user@example.com', password: { $gt: '' } },
    { email: ['user@example.com'], password: 'SecureTest123!' },
    { email: 'bad\u0000@example.com', password: 'SecureTest123!' }
  ]) {
    const { res, nextCalls } = run(validateLogin, body);
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalls.length, 0);
  }
});

test('gig creation retains validated price and fields', () => {
  const { req, nextCalls } = run(validateGigCreate, {
    title: 'Secure web design',
    description: 'A well-designed accessible business website.',
    category: 'Design',
    price: 1500.25,
    active: true
  });

  assert.equal(nextCalls.length, 1);
  assert.deepEqual(req.body, {
    title: 'Secure web design',
    description: 'A well-designed accessible business website.',
    category: 'Design',
    price: 1500.25,
    active: true
  });
});

test('gig validation blocks pricing abuse and mass-assignment fields', () => {
  const valid = {
    title: 'Secure web design',
    description: 'A well-designed accessible business website.',
    category: 'Design',
    price: 100
  };

  for (const body of [
    { ...valid, price: 0 },
    { ...valid, price: -20 },
    { ...valid, price: 1.001 },
    { ...valid, price: '100' },
    { ...valid, freelancer: 'other-account' },
    { ...valid, status: 'confirmed' }
  ]) {
    const { res, nextCalls } = run(validateGigCreate, body);
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalls.length, 0);
  }
});

test('gig updates accept an explicit inactive state but reject unsupported fields', () => {
  const accepted = run(validateGigUpdate, { active: false });
  assert.equal(accepted.nextCalls.length, 1);
  assert.deepEqual(accepted.req.body, { active: false });

  const rejected = run(validateGigUpdate, { active: false, freelancer: 'forged' });
  assert.equal(rejected.res.statusCode, 400);
  assert.equal(rejected.nextCalls.length, 0);
});

test('sanitisation removes markup and control characters from selected text', () => {
  const { req, nextCalls } = run(
    sanitizeFields('title', 'description'),
    {
      title: '  <strong>Safe</strong> title <!--removed--> ',
      description: '<script>alert(1)</script><p>Plain description</p>\u0007',
      price: 150
    }
  );

  assert.equal(nextCalls.length, 1);
  assert.deepEqual(req.body, {
    title: 'Safe title',
    description: 'Plain description',
    price: 150
  });
});

test('sanitisation leaves non-text fields untouched for later validation', () => {
  const malicious = { $ne: null };
  const { req, nextCalls } = run(sanitizeFields('title'), {
    title: malicious,
    price: 100
  });

  assert.equal(nextCalls.length, 1);
  assert.strictEqual(req.body.title, malicious);
  assert.equal(run(validateGigUpdate, req.body).res.statusCode, 400);
});
