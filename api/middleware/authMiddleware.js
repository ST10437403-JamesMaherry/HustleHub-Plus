const {
  verifyToken
} = require('../utils/token');

/**
 * Protects routes that require an authenticated HustleHub+ user.
 *
 * The middleware expects a JWT in the Authorization header using:
 * Authorization: Bearer <token>
 */
const protect = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  // Protected routes require an Authorization header.
  if (!authorizationHeader) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  const parts = authorizationHeader.trim().split(/\s+/);

  // The expected format is exactly: Bearer <token>.
  if (
    parts.length !== 2 ||
    parts[0].toLowerCase() !== 'bearer' ||
    !parts[1]
  ) {
    return res.status(401).json({
      error: 'Invalid authentication token'
    });
  }

  const token = parts[1];

  try {
    // Verify the signature and expiry before trusting the token payload.
    const decodedToken = verifyToken(token);

    // Store only the verified claims required by downstream middleware.
    req.auth = {
      id: decodedToken.id,
      role: decodedToken.role
    };

    return next();
  } catch (error) {
    // A missing secret is a server configuration failure.
    if (error.message === 'JWT secret is not configured') {
      return res.status(500).json({
        error: 'Authentication service unavailable'
      });
    }

    // Invalid, malformed and expired tokens are rejected uniformly.
    return res.status(401).json({
      error: 'Invalid or expired authentication token'
    });
  }
};

/**
 * Restricts an authenticated route to one or more allowed roles.
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // Authentication must run before role authorisation.
    if (
      !req.auth ||
      !allowedRoles.includes(req.auth.role)
    ) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    return next();
  };
};

module.exports = {
  protect,
  authorizeRoles
};