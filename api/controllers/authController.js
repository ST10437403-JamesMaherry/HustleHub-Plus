const {
  createUser,
  findUserByEmail
} = require('../models/userStore');

const {
  hashPassword,
  verifyPassword
} = require('../utils/password');

const {
  createToken
} = require('../utils/token');

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

    // Hash the password before it reaches the storage layer.
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
    // Forward unexpected failures to the application error pipeline.
    return next(error);
  }
};

/**
 * Authenticates an existing HustleHub+ user.
 *
 * A successful login verifies the submitted password against
 * the stored bcrypt hash and returns a signed JWT.
 */
const loginUser = async (req, res, next) => {
  try {
    const {
      email,
      password
    } = req.body;

    // Find the account using the normalised email address.
    const user = findUserByEmail(email);

    // Return a generic failure when the account does not exist.
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Compare the submitted password with the stored bcrypt hash.
    const passwordMatches = await verifyPassword(
      password,
      user.passwordHash
    );

    // Return the same failure message when the password is incorrect.
    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Create a signed JWT only after successful authentication.
    const token = createToken(user);

    // Return the token and safe user information.
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    // Forward unexpected failures to the application error pipeline.
    return next(error);
  }
};

module.exports = {
  registerUser,
  loginUser
};