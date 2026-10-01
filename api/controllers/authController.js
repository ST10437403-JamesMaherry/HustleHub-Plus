const mongoose = require('mongoose');

const User = require('../models/User');

// Password operations remain isolated so authentication controllers do not
// manage bcrypt configuration directly.
const {
  hashPassword,
  verifyPassword
} = require('../utils/password');

// JWT creation remains isolated so token configuration stays in one place.
const {
  createToken
} = require('../utils/token');

const DUPLICATE_EMAIL_RESPONSE = {
  error: 'An account with this email already exists'
};

// Return only fields that are safe to expose outside the API.
const toSafeUser = (user) => {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role
  };
};

/**
 * Registers a validated client or freelancer.
 *
 * Validation middleware runs before this controller, so req.body contains
 * only normalised fullName, email, password, and role values.
 */
const registerUser = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role
    } = req.body;

    // Avoid an unnecessary bcrypt operation when the account already exists.
    const existingUser = await User.findOne({
      email
    });

    if (existingUser) {
      return res.status(409).json(DUPLICATE_EMAIL_RESPONSE);
    }

    // Store only the bcrypt hash. The plaintext password is never persisted.
    const passwordHash = await hashPassword(password);

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role
    });

    return res.status(201).json({
      message: 'User registered successfully',
      user: toSafeUser(user)
    });
  } catch (error) {
    // The unique database index remains the authoritative duplicate check for
    // concurrent registrations that pass the earlier lookup together.
    if (error?.code === 11000) {
      return res.status(409).json(DUPLICATE_EMAIL_RESPONSE);
    }

    return next(error);
  }
};

/**
 * Authenticates a validated user and returns a signed JWT.
 */
const loginUser = async (req, res, next) => {
  try {
    const {
      email,
      password
    } = req.body;

    // passwordHash is excluded by default and selected only for authentication.
    const user = await User.findOne({
      email
    }).select('+passwordHash');

    // Keep authentication failures generic to reduce account enumeration.
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const passwordMatches = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: toSafeUser(user)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns the safe account details for the user identified by a verified JWT.
 */
const getCurrentUser = async (req, res, next) => {
  try {
    // Reject a signed token containing an identifier that cannot represent a
    // MongoDB user record.
    if (!mongoose.isValidObjectId(req.auth.id)) {
      return res.status(401).json({
        error: 'Authenticated user not found'
      });
    }

    const user = await User.findById(req.auth.id);

    // A valid JWT must still reference an account that currently exists.
    if (!user) {
      return res.status(401).json({
        error: 'Authenticated user not found'
      });
    }

    return res.status(200).json({
      user: toSafeUser(user)
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser
};