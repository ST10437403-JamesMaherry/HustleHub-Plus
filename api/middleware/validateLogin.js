// Login validation uses the same credential boundaries as registration.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_BYTES = 8;
const PASSWORD_MAX_BYTES = 72;

/**
 * Validates and normalises login input before authentication is attempted.
 */
const validateLogin = (req, res, next) => {
  const body = req.body;

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  const {
    email,
    password
  } = body;

  if (email === undefined || password === undefined) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  if (
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({
      error: 'Email and password must be valid text values'
    });
  }

  const normalisedEmail = email.trim().toLowerCase();

  if (!normalisedEmail || !password) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  if (
    CONTROL_CHARACTER_PATTERN.test(normalisedEmail) ||
    normalisedEmail.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(normalisedEmail)
  ) {
    return res.status(400).json({
      error: 'A valid email address is required'
    });
  }

  // bcrypt ignores bytes after the first 72. Enforcing the same limit during
  // login prevents a longer password from matching only by its 72-byte prefix.
  const passwordBytes = Buffer.byteLength(password, 'utf8');

  if (
    passwordBytes < PASSWORD_MIN_BYTES ||
    passwordBytes > PASSWORD_MAX_BYTES
  ) {
    return res.status(400).json({
      error: 'Password must be between 8 and 72 characters'
    });
  }

  req.body = {
    email: normalisedEmail,
    password
  };

  return next();
};

module.exports = validateLogin;
