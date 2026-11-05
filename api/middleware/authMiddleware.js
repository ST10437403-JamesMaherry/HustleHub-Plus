const mongoose = require('mongoose');

const User = require('../models/User');
const { verifyToken } = require('../utils/token');

const INVALID_TOKEN_RESPONSE = {
  error: 'Invalid or expired authentication token'
};

/**
 * Verifies a signed token against the current account and session version.
 */
const protect = async (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (typeof authorizationHeader !== 'string') {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  const parts = authorizationHeader.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  let decodedToken;

  try {
    // Verify the signature and expiry before using any token claim.
    decodedToken = verifyToken(parts[1]);
  } catch (error) {
    if (error.message === 'JWT secret is not configured') {
      return res.status(500).json({ error: 'Authentication service unavailable' });
    }

    return res.status(401).json(INVALID_TOKEN_RESPONSE);
  }

  // Tokens without a session version cannot bypass server-side revocation.
  if (
    !decodedToken ||
    typeof decodedToken.id !== 'string' ||
    !mongoose.isValidObjectId(decodedToken.id) ||
    !Number.isSafeInteger(decodedToken.sessionVersion) ||
    decodedToken.sessionVersion < 0 ||
    typeof decodedToken.role !== 'string'
  ) {
    return res.status(401).json(INVALID_TOKEN_RESPONSE);
  }

  try {
    // A database lookup ensures deleted accounts and changed roles are rejected.
    const user = await User.findById(decodedToken.id);

    if (
      !user ||
      decodedToken.sessionVersion !== (user.sessionVersion ?? 0) ||
      decodedToken.role !== user.role
    ) {
      return res.status(401).json(INVALID_TOKEN_RESPONSE);
    }

    req.auth = {
      id: user.id,
      role: user.role,
      sessionVersion: decodedToken.sessionVersion
    };
    req.user = user;

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Restricts an authenticated route to one or more allowed roles.
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return next();
  };
};

module.exports = {
  protect,
  authorizeRoles
};
