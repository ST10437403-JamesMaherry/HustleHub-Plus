'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const validateBooking = require('../middleware/validateBooking');
const { createBooking } = require('../controllers/bookingController');
const { createHttpContext } = require('./helpers/http');
const eventLogger = require('../utils/logger');

const CLIENT_A = '507f191e810c19729de860ea';
const CLIENT_B = '507f191e810c19729de860eb';
const GIG_A = '507f1f77bcf86cd799439011';
const GIG_B = '507f1f77bcf86cd799439012';
const KEY_A = '123e4567-e89b-42d3-a456-426614174000';
const KEY_B = '123e4567-e89b-42d3-a456-426614174001';

function validate(body, header) {
  const context = createHttpContext(body, {
    headers: header === undefined ? {} : { 'idempotency-key': header }
  });
  validateBooking(context.req, context.res, context.next);
  return context;
}

function request(gigId, key, clientId = CLIENT_A) {
  return createHttpContext({ gigId }, {
    auth: { id: clientId, role: 'client' },
    bookingRequestKey: key
  });
}

async function book(gigId, key, clientId = CLIENT_A) {
  const context = request(gigId, key, clientId);
  await createBooking(context.req, context.res, context.next);
  return context;
}

// Model doubles commit staged records together and enforce the compound uniqueness rule.
function createStore(t) {
  const bookings = [];
  const transactions = [];
  const settings = { gigActive: true, failTransaction: false };
  let sessionEnds = 0;
  let number = 0;

  t.mock.method(Booking, 'findOne', async (filter) => {
    return bookings.find((row) => row.client === filter.client && row.requestKey === filter.requestKey) || null;
  });
  t.mock.method(Transaction, 'findOne', async (filter) => {
    return transactions.find((row) => row.booking === filter.booking) || null;
  });
  t.mock.method(Gig, 'findOne', (filter) => ({
    session: async () => settings.gigActive ? {
      _id: filter._id,
      freelancer: '507f191e810c19729de860ec',
      price: 450.25
    } : null
  }));
  t.mock.method(Booking, 'create', async ([record], { session }) => {
    number += 1;
    const id = String(number).padStart(24, '0');
    const booking = { ...record, _id: id, id, createdAt: new Date(), updatedAt: new Date() };
    session.pending.booking = booking;
    return [booking];
  });
  t.mock.method(Transaction, 'create', async ([record], { session }) => {
    if (settings.failTransaction) {
      throw new Error('Simulated transaction insert failed');
    }
    const id = String(number + 1000).padStart(24, '0');
    const transaction = { ...record, _id: id, id, createdAt: new Date() };
    session.pending.transaction = transaction;
    return [transaction];
  });
  t.mock.method(mongoose, 'startSession', async () => ({
    pending: {},
    async withTransaction(callback) {
      await callback();

      // Yield before commit so two requests can race for the same index entry.
      await new Promise((resolve) => setImmediate(resolve));

      if (this.pending.booking && this.pending.transaction) {
        const { client, requestKey } = this.pending.booking;
        if (bookings.some((row) => row.client === client && row.requestKey === requestKey)) {
          const error = new Error('E11000 duplicate key');
          error.code = 11000;
          throw error;
        }
        bookings.push(this.pending.booking);
        transactions.push(this.pending.transaction);
      }
    },
    async endSession() {
      sessionEnds += 1;
    }
  }));

  return { bookings, transactions, settings, get sessionEnds() { return sessionEnds; } };
}

test('booking model defines a unique per-client request index for new records only', () => {
  const index = Booking.schema.indexes().find(([fields]) =>
    fields.client === 1 && fields.requestKey === 1
  );

  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    requestKey: { $type: 'string' }
  });
});

test('database startup creates booking indexes before reporting readiness', async (t) => {
  const connectDB = require('../config/db');
  const before = process.env.MONGO_URI;
  const events = [];

  t.mock.method(mongoose, 'connect', async () => { events.push('connect'); });
  t.mock.method(Booking, 'createIndexes', async () => { events.push('indexes'); });
  t.mock.method(eventLogger, 'logEvent', (event, outcome) => {
    if (event === 'database.ready' && outcome === 'success') events.push('ready');
  });
  process.env.MONGO_URI = 'mongodb://localhost:27017/hustlehub_test';

  try {
    await connectDB();
    assert.deepEqual(events, ['connect', 'indexes', 'ready']);
  } finally {
    if (before === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = before;
  }
});

test('booking input requires an exact UUID v4 request key', () => {
  for (const header of [
    undefined,
    'short',
    '123e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-42d3-7456-426614174000',
    ' 123e4567-e89b-42d3-a456-426614174000 ',
    [KEY_A]
  ]) {
    const result = validate({ gigId: GIG_A }, header);
    assert.equal(result.res.statusCode, 400);
    assert.equal(result.nextCalls.length, 0);
  }

  const valid = validate({ gigId: GIG_A.toUpperCase() }, KEY_A.toUpperCase());
  assert.equal(valid.nextCalls.length, 1);
  assert.equal(valid.req.bookingRequestKey, KEY_A);
  assert.deepEqual(valid.req.body, { gigId: GIG_A });
});

test('new booking commits one booking and one matching simulated transaction', async (t) => {
  const logged = [];
  t.mock.method(eventLogger, 'logEvent', (event, outcome) => {
    logged.push({ event, outcome });
  });
  const store = createStore(t);
  const result = await book(GIG_A, KEY_A);

  assert.equal(result.res.statusCode, 201);
  assert.equal(result.res.body.replayed, false);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.transactions.length, 1);
  assert.equal(store.sessionEnds, 1);
  assert.equal(store.bookings[0].requestKey, KEY_A);
  assert.equal(store.bookings[0].amount, 450.25);
  assert.equal(store.transactions[0].booking, store.bookings[0]._id);
  assert.equal(result.res.body.booking.amount, store.transactions[0].amount);
  assert.deepEqual(logged, [{ event: 'transaction.commit', outcome: 'success' }]);
});

test('same key and gig returns the original record even after gig removal', async (t) => {
  const logged = [];
  t.mock.method(eventLogger, 'logEvent', (event, outcome) => {
    logged.push({ event, outcome });
  });
  const store = createStore(t);
  const first = await book(GIG_A, KEY_A);
  store.settings.gigActive = false;
  const second = await book(GIG_A, KEY_A);

  assert.equal(first.res.statusCode, 201);
  assert.equal(second.res.statusCode, 200);
  assert.equal(second.res.body.replayed, true);
  assert.equal(second.res.body.booking.id, first.res.body.booking.id);
  assert.equal(second.res.body.transaction.id, first.res.body.transaction.id);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.transactions.length, 1);
  assert.equal(store.sessionEnds, 1);
  assert.deepEqual(logged, [{ event: 'transaction.commit', outcome: 'success' }]);
});

test('reusing a key for a different gig returns 409 without writing', async (t) => {
  const store = createStore(t);
  await book(GIG_A, KEY_A);
  const conflict = await book(GIG_B, KEY_A);

  assert.equal(conflict.res.statusCode, 409);
  assert.match(conflict.res.body.error, /Idempotency-Key/);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.transactions.length, 1);
});

test('same gig can be purchased again with a different key', async (t) => {
  const store = createStore(t);
  const first = await book(GIG_A, KEY_A);
  const second = await book(GIG_A, KEY_B);

  assert.equal(first.res.statusCode, 201);
  assert.equal(second.res.statusCode, 201);
  assert.notEqual(first.res.body.booking.id, second.res.body.booking.id);
  assert.equal(store.bookings.length, 2);
  assert.equal(store.transactions.length, 2);
});

test('the same request key is independently scoped to each client', async (t) => {
  const store = createStore(t);
  const first = await book(GIG_A, KEY_A, CLIENT_A);
  const second = await book(GIG_A, KEY_A, CLIENT_B);

  assert.equal(first.res.statusCode, 201);
  assert.equal(second.res.statusCode, 201);
  assert.equal(store.bookings.length, 2);
});

test('concurrent matching submissions create a single financial record pair', async (t) => {
  const store = createStore(t);
  const results = await Promise.all([book(GIG_A, KEY_A), book(GIG_A, KEY_A)]);

  assert.deepEqual(results.map((row) => row.res.statusCode).sort(), [200, 201]);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.transactions.length, 1);
  assert.equal(results[0].res.body.booking.id, results[1].res.body.booking.id);
  assert.equal(store.sessionEnds, 2);
});

test('concurrent conflicting submissions accept only one requested gig', async (t) => {
  const store = createStore(t);
  const results = await Promise.all([book(GIG_A, KEY_A), book(GIG_B, KEY_A)]);

  assert.deepEqual(results.map((row) => row.res.statusCode).sort(), [201, 409]);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.transactions.length, 1);
});

test('transaction insertion failures roll back the pending booking', async (t) => {
  const store = createStore(t);
  store.settings.failTransaction = true;
  const failed = await book(GIG_A, KEY_A);

  assert.equal(failed.res.body, undefined);
  assert.equal(failed.nextCalls.length, 1);
  assert.match(failed.nextCalls[0].message, /insert failed/);
  assert.equal(store.bookings.length, 0);
  assert.equal(store.transactions.length, 0);
  assert.equal(store.sessionEnds, 1);

  store.settings.failTransaction = false;
  const retried = await book(GIG_A, KEY_A);
  assert.equal(retried.res.statusCode, 201);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.transactions.length, 1);
});

test('a replay missing its transaction fails closed', async (t) => {
  const store = createStore(t);
  await book(GIG_A, KEY_A);
  store.transactions.length = 0;
  const replay = await book(GIG_A, KEY_A);

  assert.equal(replay.res.body, undefined);
  assert.equal(replay.nextCalls.length, 1);
  assert.match(replay.nextCalls[0].message, /missing its transaction/);
  assert.equal(store.bookings.length, 1);
});

test('unavailable gigs return 404 without creating financial records', async (t) => {
  const store = createStore(t);
  store.settings.gigActive = false;
  const result = await book(GIG_A, KEY_A);

  assert.equal(result.res.statusCode, 404);
  assert.equal(store.bookings.length, 0);
  assert.equal(store.transactions.length, 0);
  assert.equal(store.sessionEnds, 1);
});
