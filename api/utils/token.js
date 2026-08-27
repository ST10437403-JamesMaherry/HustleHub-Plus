const jwt = require('jsonwebtoken');

/**
 * Returns the JWT secret used for signing and verifying tokens.
 */
const getJwtSecret = () => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT secret is not configured');
  }

  return jwtSecret;
};

/**
 * Creates a signed JWT for an authenticated user.
 *
 * Only the user's ID and role are included so that sensitive
 * information is not placed inside the token payload.
 */
const createToken = (user) => {
  const tokenExpiry = process.env.JWT_EXPIRES_IN || '1h';

  return jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    getJwtSecret(),
    {
      expiresIn: tokenExpiry
    }
  );
};

/**
 * Verifies a JWT signature and expiry before its payload is trusted.
 */
const verifyToken = (token) => {
  return jwt.verify(
    token,
    getJwtSecret()
  );
};

module.exports = {
  createToken,
  verifyToken
};