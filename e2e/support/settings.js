'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function localOrigin(value, protocols, name) {
  const url = new URL(value);

  // The suite creates accounts and bookings, so it must never target a remote system.
  if (!protocols.includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be a local origin without a path, for example ${protocols[0]}//localhost`);
  }

  return url.origin;
}

const settings = Object.freeze({
  webUrl: localOrigin(process.env.E2E_BASE_URL || 'http://localhost:5173', ['http:', 'https:'], 'E2E_BASE_URL'),
  apiUrl: localOrigin(process.env.E2E_API_URL || 'https://localhost:4000', ['https:'], 'E2E_API_URL'),
  caCertPath: path.resolve(__dirname, '..', process.env.E2E_CA_CERT || '../api/certs/localhost-cert.pem')
});

function readCertificate(certPath) {
  try {
    return fs.readFileSync(certPath);
  } catch {
    throw new Error(
      `Local API certificate not found at ${certPath}. Generate it as described in the root README, ` +
      'or set E2E_CA_CERT to its path.'
    );
  }
}

// Base64 SHA-256 of the certificate's SubjectPublicKeyInfo, as Chromium expects.
function certificateSpkiHash(certPath) {
  const certificate = new crypto.X509Certificate(readCertificate(certPath));
  const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(spki).digest('base64');
}

module.exports = { settings, readCertificate, certificateSpkiHash };
