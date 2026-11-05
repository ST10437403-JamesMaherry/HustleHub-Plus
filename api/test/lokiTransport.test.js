'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const LokiTransport = require('winston-loki');
const { createLokiTransport } = require('../utils/lokiTransport');
const eventLogger = require('../utils/logger');

const TOKEN = 'glc_fake-token-should-never-appear';
const VALID_ENV = {
  GRAFANA_LOKI_URL: 'https://logs-prod-000.grafana.net',
  GRAFANA_LOKI_USER: '123456',
  GRAFANA_LOKI_TOKEN: TOKEN
};

function stderrWrites(t) {
  const writes = [];
  t.mock.method(process.stderr, 'write', (chunk) => {
    writes.push(String(chunk));
    return true;
  });
  return writes;
}

test('unconfigured Grafana logging keeps stdout-only mode silently', (t) => {
  const writes = stderrWrites(t);
  assert.equal(createLokiTransport({}), null);
  assert.equal(createLokiTransport({ GRAFANA_LOKI_URL: '', GRAFANA_LOKI_TOKEN: '' }), null);
  assert.deepEqual(writes, []);
});

test('incomplete or unsafe Grafana settings disable shipping without exposing the token', (t) => {
  const writes = stderrWrites(t);
  const invalid = [
    { GRAFANA_LOKI_TOKEN: TOKEN },
    { ...VALID_ENV, GRAFANA_LOKI_USER: undefined },
    { ...VALID_ENV, GRAFANA_LOKI_URL: 'http://logs-prod-000.grafana.net' },
    { ...VALID_ENV, GRAFANA_LOKI_URL: 'https://logs-prod-000.grafana.net/loki/api/v1/push' },
    { ...VALID_ENV, GRAFANA_LOKI_URL: `https://123456:${TOKEN}@logs-prod-000.grafana.net` },
    { ...VALID_ENV, GRAFANA_LOKI_URL: 'https://logs-prod-000.grafana.net?token=x' },
    { ...VALID_ENV, GRAFANA_LOKI_URL: 'not a url' },
    { ...VALID_ENV, GRAFANA_LOKI_USER: 'admin' }
  ];

  for (const env of invalid) {
    assert.doesNotThrow(() => assert.equal(createLokiTransport(env), null));
  }

  assert.equal(writes.length, invalid.length);
  assert.ok(writes.every((line) => line === writes[0]));
  assert.ok(!writes.join('').includes(TOKEN));
  assert.ok(!writes.join('').includes('123456'));
});

test('valid Grafana settings use low-cardinality labels and bounded delivery', async (t) => {
  const transport = createLokiTransport({ ...VALID_ENV, NODE_ENV: 'production' });
  t.after(() => transport.close());

  assert.ok(transport instanceof LokiTransport);
  assert.deepEqual(transport.labels, { service: 'hustlehub-api', env: 'production' });
  assert.ok(!transport.useWinstonMetaAsLabels);
  assert.equal(transport.useCustomFormat, true);
  assert.equal(transport.batcher.url.href, 'https://logs-prod-000.grafana.net/loki/api/v1/push');
  assert.equal(transport.batcher.options.json, true);
  assert.equal(transport.batcher.options.clearOnError, true);
  assert.equal(transport.batcher.options.timeout, 5000);
  assert.equal(transport.batcher.interval, 5000);
});

test('unreachable Grafana endpoint does not interrupt structured events', async (t) => {
  const writes = stderrWrites(t);
  const transport = createLokiTransport({ ...VALID_ENV, GRAFANA_LOKI_URL: 'https://127.0.0.1:1' });
  t.mock.method(eventLogger.winstonLogger.transports[0], 'log', (info, callback) => callback());
  eventLogger.winstonLogger.add(transport);
  t.after(() => eventLogger.winstonLogger.remove(transport));

  assert.doesNotThrow(() => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal(eventLogger.logEvent('booking.create', 'success', { statusCode: 201 }), true);
    }
  });
  await new Promise(setImmediate);

  const [stream] = transport.batcher.batch.streams;
  assert.deepEqual(stream.labels, { level: 'info', service: 'hustlehub-api', env: 'development' });
  assert.equal(JSON.parse(stream.entries[0].line).event, 'booking.create');

  await transport.close();
  await transport.batcher.sendBatchToLoki({ labels: stream.labels, entries: [{ ts: Date.now(), line: '{}' }] })
    .catch(() => {});

  assert.deepEqual(transport.batcher.batch.streams, []);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /^Grafana Cloud log delivery failed( \([A-Z0-9_]+\))?\.\n$/);
  assert.ok(!writes[0].includes(TOKEN));
});
