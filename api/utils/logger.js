'use strict';

const winston = require('winston');
const { createLokiTransport } = require('./lokiTransport');

const EVENTS = new Set([
  'auth.login',
  'auth.logout',
  'booking.create',
  'transaction.commit',
  'api.error',
  'database.ready',
  'app.start'
]);

const OUTCOMES = new Set(['success', 'failure', 'replayed', 'conflict']);
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const PHASES = new Set(['configuration', 'connection', 'indexes', 'http', 'https']);
const ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'SyntaxError',
  'ValidationError',
  'MongoError',
  'MongoServerError',
  'MongooseError',
  'MongoNetworkError',
  'MongoServerSelectionError'
]);

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Emit one JSON object per line for container log collection.
const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'hustlehub-api' },
  transports: [
    new winston.transports.Console({ stderrLevels: ['error'] }),
    createLokiTransport()
  ].filter(Boolean),
  exitOnError: false
});

// Avoid propagating transport errors into API request handling.
winstonLogger.on('error', () => {});

function severityFor(event, outcome, statusCode) {
  if (statusCode >= 500 ||
      (event === 'api.error' && statusCode === undefined) ||
      ((event === 'database.ready' || event === 'app.start') && outcome === 'failure')) {
    return 'error';
  }

  return outcome === 'success' || outcome === 'replayed' ? 'info' : 'warn';
}

// Logs are built from a fixed schema instead of arbitrary request data.
function logEvent(event, outcome, details = {}) {
  try {
    if (!EVENTS.has(event) || !OUTCOMES.has(outcome)) return false;

    const statusCode = Number.isInteger(details.statusCode) &&
      details.statusCode >= 100 && details.statusCode <= 599
      ? details.statusCode
      : undefined;

    const entry = {
      level: severityFor(event, outcome, statusCode),
      message: event,
      event,
      outcome
    };

    if (typeof details.requestId === 'string' && REQUEST_ID_PATTERN.test(details.requestId)) {
      entry.requestId = details.requestId;
    }

    if (statusCode !== undefined) entry.statusCode = statusCode;

    if (METHODS.has(details.method)) entry.method = details.method;
    if (PHASES.has(details.phase)) entry.phase = details.phase;

    if (details.error) {
      entry.errorType = ERROR_TYPES.has(details.error.name)
        ? details.error.name
        : 'OtherError';
    }

    winstonLogger.log(entry);
    return true;
  } catch {
    // A logging failure must never interrupt authentication or financial operations.
    return false;
  }
}

module.exports = { logEvent, winstonLogger };
