'use strict';

const { randomUUID } = require('node:crypto');
const eventLogger = require('../utils/logger');

// Identify only the endpoint outcomes needed for security and business monitoring.
function monitoredEvent(method, path) {
  if (method !== 'POST') return null;

  const cleanPath = path.replace(/\/+$/, '') || '/';
  if (cleanPath === '/api/auth/login') return 'auth.login';
  if (cleanPath === '/api/auth/logout') return 'auth.logout';
  if (cleanPath === '/api/bookings') return 'booking.create';
  return null;
}

function outcomeFor(event, statusCode) {
  if (event === 'booking.create' && statusCode === 200) return 'replayed';
  if (event === 'booking.create' && statusCode === 409) return 'conflict';
  return statusCode >= 200 && statusCode < 400 ? 'success' : 'failure';
}

// Correlate completed requests without trusting caller-provided request identifiers.
function requestContext(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const event = monitoredEvent(req.method, req.path);
  if (event) {
    res.once('finish', () => {
      eventLogger.logEvent(event, outcomeFor(event, res.statusCode), {
        requestId,
        method: req.method,
        statusCode: res.statusCode
      });
    });
  }

  return next();
}

module.exports = { requestContext, monitoredEvent, outcomeFor };
