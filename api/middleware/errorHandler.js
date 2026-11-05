const eventLogger = require('../utils/logger');

const SAFE_ERROR_MESSAGES = {
  400: 'Malformed request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Route not found',
  413: 'Request body too large',
  429: 'Too many requests'
};

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

// Return a controlled 404 for any unknown endpoint.
const notFoundHandler = (req, res) => {
  return res.status(404).json({ error: 'Route not found' });
};

/**
 * Log failures using an allowlisted schema while preserving safe API responses.
 */
const errorHandler = (err, req, res, next) => {
  const proposedStatus = err.status || err.statusCode;
  const statusCode = SAFE_ERROR_MESSAGES[proposedStatus] ? proposedStatus : 500;

  // Never emit raw exception messages, stack traces, URLs or request payloads.
  eventLogger.logEvent('api.error', 'failure', {
    requestId: req.requestId,
    method: req.method,
    statusCode,
    error: err
  });

  if (res.headersSent) return next(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  return res.status(statusCode).json({
    error: SAFE_ERROR_MESSAGES[statusCode] || INTERNAL_ERROR_MESSAGE
  });
};

module.exports = { notFoundHandler, errorHandler };
