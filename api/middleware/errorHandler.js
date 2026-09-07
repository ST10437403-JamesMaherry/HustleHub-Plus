// Any status that is not listed here is reported as an internal error. This
// map must be extended whenever a new client error response is introduced.
const SAFE_ERROR_MESSAGES = {
  400: 'Malformed request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Route not found',
  413: 'Request body too large'
};

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

/**
 * Returns a controlled 404 for any request that does not match a defined route.
 */
const notFoundHandler = (req, res) => {
  return res.status(404).json({
    error: 'Route not found'
  });
};

/**
 * Central error handler for the HustleHub+ API.
 *
 * Express identifies error-handling middleware by its four parameters, so
 * `next` must remain in the signature even where it is only used to delegate
 * a response that has already started.
 */
const errorHandler = (err, req, res, next) => {
  // Express and its dependencies use two different property names for the status an error suggests.
  const proposedStatus = err.status || err.statusCode;

  // Only recognised client error codes are allowed.
  const statusCode = SAFE_ERROR_MESSAGES[proposedStatus]
    ? proposedStatus : 500;

  // Record the failure on the server only. The stack is logged rather than the
  // error object, because a rejected request body is attached to parsing
  // errors and would otherwise write submitted credentials into the log.
  // Could possibly be used as a vulnerability by ddos to overwhelm the server log just observation...
  // Can be resolved by rate lmiting. Though its not a big issue for this project.
  console.error(`[error] ${req.method} ${req.originalUrl} -> ${statusCode}`);
  console.error(err.stack || err.message);

  // A response that has already started streaming cannot be replaced, so it is handed back to Express to close the connection.
  if (res.headersSent) {
    return next(err);
  }

  // A malformed JSON body is reported as a generic 400, because the error is not specific to any particular route or resource.
  // So it is named here without repeating any part of the submitted content.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Request body is not valid JSON'
    });
  }

  return res.status(statusCode).json({
    error: SAFE_ERROR_MESSAGES[statusCode] || INTERNAL_ERROR_MESSAGE
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};