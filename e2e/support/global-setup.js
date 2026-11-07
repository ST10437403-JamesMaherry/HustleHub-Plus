'use strict';

const { api } = require('./api');
const { settings } = require('./settings');

// Fail fast with a clear message instead of timing out inside a browser test.
module.exports = async function globalSetup() {
  let health;

  try {
    health = await api.health();
  } catch (error) {
    if (/CERT|SELF_SIGNED|ALTNAME/.test(error.code || '')) {
      throw new Error(
        `The API at ${settings.apiUrl} presented a certificate that does not match ${settings.caCertPath} ` +
        `(${error.code}). Use the certificate the API was started with, or regenerate both.`
      );
    }
    throw new Error(
      `The HTTPS API is not reachable at ${settings.apiUrl} (${error.code || error.message}). ` +
      'Start a fresh API process with "npm --prefix api start" before running the browser tests.'
    );
  }

  if (health.status !== 200 || health.data?.protocol !== 'HTTPS') {
    throw new Error(`Unexpected API health response from ${settings.apiUrl}: HTTP ${health.status}`);
  }
};
