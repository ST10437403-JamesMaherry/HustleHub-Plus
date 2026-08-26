const {
  createUser,
  findUserByEmail
} = require('../models/userStore');

const {
  hashPassword
} = require('../utils/password');

/**
 * Registers a new HustleHub+ user.
 */
const registerUser = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role
    } = req.body;

    // Prevent duplicate accounts from using the same email address.
    const existingUser = findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists'
      });
    }

    // Hash the password before passing the user to the storage layer.
    const passwordHash = await hashPassword(password);

    const user = createUser({
      fullName,
      email,
      passwordHash,
      role
    });

    // Return only information that is safe to expose.
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
    // Forward unexpected failures to the error-handling pipeline.
    return next(error);
  }
};

module.exports = {
  registerUser
};