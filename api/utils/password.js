const bcrypt = require('bcrypt');

// Use a secure default if no valid work factor is supplied.
const DEFAULT_SALT_ROUNDS = 12;

/**
 * Returns the configured bcrypt work factor.
 *
 * A minimum value is enforced so that an invalid environment
 * configuration does not silently weaken password hashing.
 */
const getSaltRounds = () => {
  const configuredRounds = Number(
    process.env.BCRYPT_SALT_ROUNDS
  );

  if (
    Number.isInteger(configuredRounds) &&
    configuredRounds >= 10
  ) {
    return configuredRounds;
  }

  return DEFAULT_SALT_ROUNDS;
};

/**
 * Hashes a plaintext password before it is stored.
 */
const hashPassword = async (password) => {
  return bcrypt.hash(
    password,
    getSaltRounds()
  );
};

/**
 * Safely compares a plaintext password with a stored bcrypt hash.
 */
const verifyPassword = async (
  password,
  passwordHash
) => {
  return bcrypt.compare(
    password,
    passwordHash
  );
};

module.exports = {
  hashPassword,
  verifyPassword
};