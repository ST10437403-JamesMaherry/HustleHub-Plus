const SAFE_ERROR_MESSAGES = {
  400: 'Malformed request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Route not found',
  413: 'Request body too large',
  429: 'Too many requests'
};

const INTERNAL_ERROR_MESSAGE =
  'Internal server error';

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
const errorHandler = (
  err,
  req,
  res,
  next
) => {
  const proposedStatus =
    err.status || err.statusCode;

  // Only recognised client error codes are exposed directly.
  const statusCode =
    SAFE_ERROR_MESSAGES[proposedStatus]
      ? proposedStatus
      : 500;

  // Keep diagnostic information on the server rather than in responses.
  console.error(
    `[error] ${req.method} ${req.originalUrl} -> ${statusCode}`
  );
  console.error(
    err.stack || err.message
  );

  if (res.headersSent) {
    return next(err);
  }

  // Malformed JSON receives a controlled response without echoing input.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Request body is not valid JSON'
    });
  }

  return res.status(statusCode).json({
    error:
      SAFE_ERROR_MESSAGES[statusCode] ||
      INTERNAL_ERROR_MESSAGE
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};