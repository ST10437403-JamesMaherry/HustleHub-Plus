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
 * Include the user ID, role and server-side session version. No sensitive
 * account information is stored inside the signed token.
 */
const createToken = (user) => {
  const tokenExpiry = process.env.JWT_EXPIRES_IN || '1h';

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      // Existing user records without a session version begin at version zero.
      sessionVersion: user.sessionVersion ?? 0
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
