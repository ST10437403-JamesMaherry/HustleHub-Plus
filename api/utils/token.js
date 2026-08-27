const jwt = require('jsonwebtoken');

/**
 * Creates a signed JWT for an authenticated user.
 *
 * Only the user's ID and role are included in the payload
 * so that sensitive information is not placed inside the token.
 */
const createToken = (user) => {
  const jwtSecret = process.env.JWT_SECRET;
  const tokenExpiry = process.env.JWT_EXPIRES_IN || '1h';

  // Refuse to create authentication tokens without a configured secret.
  if (!jwtSecret) {
    throw new Error('JWT secret is not configured');
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    jwtSecret,
    {
      expiresIn: tokenExpiry
    }
  );
};

module.exports = {
  createToken
};