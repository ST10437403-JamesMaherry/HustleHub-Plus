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
      email: String(email)
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
    // String() keeps the lookup a literal match even if a non-string ever reaches it.
    const user = await User.findOne({
      email: String(email)
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
 * Returns the safe account selected by the authentication middleware.
 */
const getCurrentUser = (req, res) => {
  return res.status(200).json({
    user: toSafeUser(req.user)
  });
};

/**
 * Atomically invalidates all tokens previously issued to the account.
 */
const logoutUser = async (req, res, next) => {
  try {
    const version = req.auth.sessionVersion;
    const expectedVersions = [{ sessionVersion: version }];

    // Earlier user records may not yet contain the version field.
    if (version === 0) {
      expectedVersions.push({ sessionVersion: { $exists: false } });
    }

    const result = await User.updateOne(
      { _id: req.auth.id, $or: expectedVersions },
      { $inc: { sessionVersion: 1 } }
    );

    // A concurrent logout or account change must not report successful revocation.
    if (result.modifiedCount !== 1) {
      return res.status(401).json({
        error: 'Invalid or expired authentication token'
      });
    }

    return res.status(200).json({
      message: 'Signed out successfully'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser
};
