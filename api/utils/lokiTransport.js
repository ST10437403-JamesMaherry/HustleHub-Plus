'use strict';

const winston = require('winston');
const LokiTransport = require('winston-loki');

const CONFIG_WARNING = 'Grafana Cloud logging disabled: GRAFANA_LOKI_URL, ' +
  'GRAFANA_LOKI_USER and GRAFANA_LOKI_TOKEN are incomplete or invalid.\n';
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
const WARNING_INTERVAL_MS = 60 * 1000;

// Accept only a bare HTTPS origin so credentials cannot leak through the URL.
function lokiHost(value) {
  try {
    const url = new URL(value);
    const bareOrigin = url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash;
    return bareOrigin ? url.origin : null;
  } catch {
    return null;
  }
}

function deliveryFailure(err) {
  if (Number.isInteger(err?.statusCode)) return ` (HTTP ${err.statusCode})`;
  return ERROR_CODE_PATTERN.test(err?.code) ? ` (${err.code})` : '';
}

// Grafana Cloud shipping is opt-in; stdout remains the primary log stream.
function createLokiTransport(env = process.env) {
  const url = env.GRAFANA_LOKI_URL;
  const user = env.GRAFANA_LOKI_USER;
  const token = env.GRAFANA_LOKI_TOKEN;
  if (!url && !user && !token) return null;

  const host = url ? lokiHost(url) : null;
  if (!host || !/^\d+$/.test(user || '') || !token) {
    process.stderr.write(CONFIG_WARNING);
    return null;
  }

  let lastWarningAt = 0;

  return new LokiTransport({
    host,
    basicAuth: `${user}:${token}`,
    json: true,
    // Ship exactly the same JSON line that is written to stdout.
    format: winston.format.json(),
    // Labels stay low-cardinality; request fields remain inside the JSON line.
    labels: { service: 'hustlehub-api', env: env.NODE_ENV || 'development' },
    batching: true,
    interval: 5,
    timeout: 5000,
    // Drop failed batches so a Loki outage cannot grow memory without bound.
    clearOnError: true,
    onConnectionError: (err) => {
      const now = Date.now();
      if (now - lastWarningAt < WARNING_INTERVAL_MS) return;
      lastWarningAt = now;
      process.stderr.write(`Grafana Cloud log delivery failed${deliveryFailure(err)}.\n`);
    }
  });
}

module.exports = { createLokiTransport };
