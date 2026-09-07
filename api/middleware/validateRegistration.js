const allowedRoles = ['client', 'freelancer'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

// Permit international names, spaces, apostrophes, full stops, and hyphens.
// Markup characters and other unexpected symbols are rejected.
const FULL_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’\-]*$/u;

const FULL_NAME_MIN_LENGTH = 2;
const FULL_NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_BYTES = 8;
const PASSWORD_MAX_BYTES = 72;

/**
 * Validates and normalises registration data before it reaches the controller.
 */
const validateRegistration = (req, res, next) => {
  const body = req.body;

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return res.status(400).json({
      error: 'All registration fields are required'
    });
  }

  const {
    fullName,
    email,
    password,
    role
  } = body;

  if (
    fullName === undefined ||
    email === undefined ||
    password === undefined ||
    role === undefined
  ) {
    return res.status(400).json({
      error: 'All registration fields are required'
    });
  }

  if (
    typeof fullName !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof role !== 'string'
  ) {
    return res.status(400).json({
      error: 'Registration fields must contain valid text values'
    });
  }

  const normalisedFullName = fullName.trim();
  const normalisedEmail = email.trim().toLowerCase();
  const normalisedRole = role.trim().toLowerCase();

  if (
    !normalisedFullName ||
    !normalisedEmail ||
    !password ||
    !normalisedRole
  ) {
    return res.status(400).json({
      error: 'All registration fields are required'
    });
  }

  if (
    CONTROL_CHARACTER_PATTERN.test(normalisedFullName) ||
    CONTROL_CHARACTER_PATTERN.test(normalisedEmail)
  ) {
    return res.status(400).json({
      error: 'Registration fields must not contain control characters'
    });
  }

  if (!allowedRoles.includes(normalisedRole)) {
    return res.status(400).json({
      error: 'Role must be client or freelancer'
    });
  }

  if (
    normalisedFullName.length < FULL_NAME_MIN_LENGTH ||
    normalisedFullName.length > FULL_NAME_MAX_LENGTH
  ) {
    return res.status(400).json({
      error: 'Full name must be between 2 and 80 characters'
    });
  }

  if (!FULL_NAME_PATTERN.test(normalisedFullName)) {
    return res.status(400).json({
      error: 'Full name contains invalid characters'
    });
  }

  if (
    normalisedEmail.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(normalisedEmail)
  ) {
    return res.status(400).json({
      error: 'A valid email address is required'
    });
  }

  const passwordBytes = Buffer.byteLength(password, 'utf8');

  if (
    passwordBytes < PASSWORD_MIN_BYTES ||
    passwordBytes > PASSWORD_MAX_BYTES
  ) {
    return res.status(400).json({
      error: 'Password must be between 8 and 72 characters'
    });
  }

  // Rebuild the body so unexpected properties cannot reach the controller.
  req.body = {
    fullName: normalisedFullName,
    email: normalisedEmail,
    password,
    role: normalisedRole
  };

  return next();
};

module.exports = validateRegistration;
