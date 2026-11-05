'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

const MAX_RESPONSE_BYTES = 2048;
const DEFAULT_TIMEOUT_MS = 3000;

// Probe the API loopback endpoint without depending on curl or npm packages.
function checkHealth({
  port = Number(process.env.PORT || 4000),
  useHttps = process.env.USE_HTTPS === 'true',
  caCertPath = process.env.HEALTHCHECK_CA_CERT_PATH,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return Promise.resolve(false);
  }

  const options = {
    hostname: '127.0.0.1',
    port,
    path: '/health',
    method: 'GET',
    headers: { Accept: 'application/json' }
  };

  if (useHttps) {
    // Verify an HTTPS certificate against localhost, not the loopback IP.
    options.servername = 'localhost';

    if (caCertPath) {
      try {
        options.ca = fs.readFileSync(caCertPath);
      } catch {
        return Promise.resolve(false);
      }
    }
  }

  return new Promise((resolve) => {
    const transport = useHttps ? https : http;
    let settled = false;

    const finish = (healthy) => {
      if (settled) return;
      settled = true;
      resolve(healthy);
    };

    const request = transport.get(options, (response) => {
      let body = '';
      response.setEncoding('utf8');

      response.on('data', (chunk) => {
        body += chunk;

        // Only the small health response is accepted by the probe.
        if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
          finish(false);
          response.destroy();
        }
      });

      response.on('end', () => {
        try {
          const result = JSON.parse(body);
          finish(response.statusCode === 200 && result?.status === 'OK');
        } catch {
          finish(false);
        }
      });

      response.on('error', () => finish(false));
      response.on('aborted', () => finish(false));
    });

    request.setTimeout(timeoutMs, () => request.destroy());
    request.on('error', () => finish(false));
  });
}

// Docker considers exit code zero healthy and exit code one unhealthy.
if (require.main === module) {
  checkHealth().then((healthy) => {
    process.exitCode = healthy ? 0 : 1;
  }).catch(() => {
    process.exitCode = 1;
  });
}

module.exports = { checkHealth };
