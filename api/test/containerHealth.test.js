'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { checkHealth } = require('../docker/healthcheck');

// Run health probes against a disposable loopback server on an assigned port.
async function withHealthServer(handler, callback) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    return await callback(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('health probe accepts the existing API health response', async () => {
  await withHealthServer((req, res) => {
    assert.equal(req.url, '/health');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', app: 'HustleHubPlusAPI', protocol: 'HTTP' }));
  }, async (port) => {
    assert.equal(await checkHealth({ port, useHttps: false }), true);
  });
});

test('health probe rejects a non-success HTTP response', async () => {
  await withHealthServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK' }));
  }, async (port) => {
    assert.equal(await checkHealth({ port, useHttps: false }), false);
  });
});

test('health probe rejects a missing OK status', async () => {
  await withHealthServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'STARTING' }));
  }, async (port) => {
    assert.equal(await checkHealth({ port, useHttps: false }), false);
  });
});

test('health probe rejects malformed JSON', async () => {
  await withHealthServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('not-json');
  }, async (port) => {
    assert.equal(await checkHealth({ port, useHttps: false }), false);
  });
});

test('health probe rejects oversized responses', async () => {
  await withHealthServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', padding: 'x'.repeat(4096) }));
  }, async (port) => {
    assert.equal(await checkHealth({ port, useHttps: false }), false);
  });
});

test('health probe rejects invalid port and timeout settings', async () => {
  for (const port of [0, -1, 65536, NaN, 1.5]) {
    assert.equal(await checkHealth({ port }), false);
  }

  assert.equal(await checkHealth({ port: 4000, timeoutMs: 0 }), false);
});

test('health probe fails when no API listens on the port', async () => {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  assert.equal(await checkHealth({ port, useHttps: false, timeoutMs: 500 }), false);
});

test('health probe fails when the API does not respond', async () => {
  await withHealthServer(() => {}, async (port) => {
    assert.equal(await checkHealth({ port, useHttps: false, timeoutMs: 75 }), false);
  });
});

test('HTTPS mode rejects an unreadable custom certificate', async () => {
  assert.equal(await checkHealth({
    useHttps: true,
    caCertPath: '/nonexistent/healthcheck-ca.pem'
  }), false);
});
