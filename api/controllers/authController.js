const {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
  findUserById
} = require('../models/userStore');

// Password operations are kept in a utility so the controller never handles
// bcrypt configuration or stores a plaintext password.
const {
  hashPassword,
  verifyPassword
} = require('../utils/password');

// JWT creation is isolated from the controller so signing configuration and
// token expiry remain in one place.
const {
  createToken
} = require('../utils/token');

// Reuse one controlled response for both sequential and concurrent duplicate
// registration attempts.
const DUPLICATE_EMAIL_RESPONSE = {
  error: 'An account with this email already exists'
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

    // Avoid an unnecessary bcrypt operation for an existing account.
    if (findUserByEmail(email)) {
      return res.status(409).json(DUPLICATE_EMAIL_RESPONSE);
    }

    // Hash the password before it reaches the storage layer. The plaintext
    // value is used only for this operation and is never stored or returned.
    const passwordHash = await hashPassword(password);

    // createUser performs the authoritative duplicate check after the await,
    // closing the concurrent check-then-create race.
    const user = createUser({
      fullName,
      email,
      passwordHash,
      role
    });

    // Return only public account fields. password and passwordHash are
    // deliberately excluded from the response.
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
    // A second registration may pass the early lookup while the first request
    // is awaiting bcrypt. The storage layer catches that race, and the
    // controller converts it into the same safe 409 response.
    if (error instanceof DuplicateEmailError) {
      return res.status(409).json(DUPLICATE_EMAIL_RESPONSE);
    }

    // Unexpected failures are delegated to the central error handler so no
    // stack trace or internal detail is sent to the client.
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

    // Email values have already been normalised by validateLogin, but the
    // store also normalises lookups as a defensive measure.
    const user = findUserByEmail(email);

    // Use the same message for an unknown account and an incorrect password
    // to avoid revealing whether a particular email address is registered.
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const passwordMatches = await verifyPassword(
      password,
      user.passwordHash
    );

    // Keep the authentication failure generic to prevent account enumeration.
    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // A token is issued only after the stored bcrypt hash has been verified.
    const token = createToken(user);

    // Return the token with safe user information. The password hash remains
    // inside the server-side store.
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
    // Forward configuration or unexpected authentication failures to the
    // application's controlled error pipeline.
    return next(error);
  }
};

/**
 * Returns the safe account details for the user identified by a verified JWT.
 */
const getCurrentUser = (req, res) => {
  // authMiddleware verifies the token before setting req.auth.id.
  const user = findUserById(req.auth.id);

  // A valid token must still refer to an account that exists in the store.
  if (!user) {
    return res.status(401).json({
      error: 'Authenticated user not found'
    });
  }

  // Never expose the stored bcrypt password hash through the protected route.
  return res.status(200).json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    }
  });
};

// Export only the handlers used by the authentication routes.
module.exports = {
  registerUser,
  loginUser,
  getCurrentUser
};