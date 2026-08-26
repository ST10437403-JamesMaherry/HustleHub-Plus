const bcrypt = require('bcrypt');

const {
  createUser,
  findUserByEmail
} = require('../models/userStore');

// Number of bcrypt hashing rounds used when protecting passwords.
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Registers a new HustleHub+ user.
 *
 * Registration performs the following security-sensitive steps:
 * 1. Reads the expected registration fields.
 * 2. Checks whether the email address is already registered.
 * 3. Hashes the password before it reaches the user store.
 * 4. Stores only the password hash.
 * 5. Returns only non-sensitive user information.
 */
const registerUser = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role
    } = req.body;

    // Check whether another account already uses this email address.
    const existingUser = findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists'
      });
    }

    // Hash the plaintext password before storing the user.
    const passwordHash = await bcrypt.hash(
      password,
      BCRYPT_SALT_ROUNDS
    );

    const user = createUser({
      fullName,
      email,
      passwordHash,
      role
    });

    // Return only fields that are safe to expose to the client.
    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    // Pass unexpected failures to the application's error-handling pipeline.
    return next(error);
  }
};

module.exports = {
  registerUser
};