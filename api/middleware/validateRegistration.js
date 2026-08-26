const allowedRoles = ['client', 'freelancer'];

// Confirms the structure of an email address rather than attempting to prove
// that the address is deliverable.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
 
// Control characters are never valid in a name or an email address.
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
 
// Name limits match the user schema planned for Part 2 so that both validation
// layers agree once MongoDB is introduced.
const FULL_NAME_MIN_LENGTH = 2;
const FULL_NAME_MAX_LENGTH = 80;
 
// Maximum email address length
const EMAIL_MAX_LENGTH = 254;
 
// bcrypt reads only the first 72 bytes of a password and silently discards the
// remainder, so the upper limit is measured in bytes rather than characters.
const PASSWORD_MIN_BYTES = 8;
const PASSWORD_MAX_BYTES = 72;

/**
 * Validates and normalises registration data before it reaches the
 * authentication controller.
 */
const validateRegistration = (req, res, next) => {
  const {
    fullName,
    email,
    password,
    role
  } = req.body;

  // All registration fields are required.
  if (!fullName || !email || !password || !role) {
    return res.status(400).json({
      error: 'All registration fields are required'
    });
  }

  // Registration fields must contain text values.
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

  // Normalise the submitted values first so that every rule below is applied
  // to the same values that will later be stored.
  const normalisedFullName = fullName.trim();
  const normalisedEmail = email.trim().toLowerCase();
  const normalisedRole = role.trim().toLowerCase();

  // Reject control characters, which corrupt log output and serve no
  // legitimate purpose in a name or an email address.
  if (
    CONTROL_CHARACTER_PATTERN.test(normalisedFullName) ||
    CONTROL_CHARACTER_PATTERN.test(normalisedEmail)
  ) {
    return res.status(400).json({
      error: 'Registration fields must not contain control characters'
    });
  }

  // Only normal HustleHub+ user roles may be created publicly.
  if (!allowedRoles.includes(role.trim().toLowerCase())) {
    return res.status(400).json({
      error: 'Role must be client or freelancer'
    });
  }

  // The full name must remain a reasonable length once whitespace is removed.
  if (
    normalisedFullName.length < FULL_NAME_MIN_LENGTH ||
    normalisedFullName.length > FULL_NAME_MAX_LENGTH
  ) {
    return res.status(400).json({
      error: 'Full name must be between 2 and 80 characters'
    });
  }

  // Length is checked before the pattern so that the pattern is only ever
  // applied to a bounded input.
  if (
    normalisedEmail.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(normalisedEmail)
  ) {
    return res.status(400).json({
      error: 'A valid email address is required'
    });
  }
 
  // The password is measured but never trimmed, so that the value stored at
  // registration is byte-identical to the value supplied at login.
  const passwordBytes = Buffer.byteLength(password, 'utf8');
 
  if (
    passwordBytes < PASSWORD_MIN_BYTES ||
    passwordBytes > PASSWORD_MAX_BYTES
  ) {
    return res.status(400).json({
      error: 'Password must be between 8 and 72 characters'
    });
  }

  // Replace the request values with their normalised equivalents so that the
  // controller can only ever see validated data.
  req.body = {
    fullName: normalisedFullName,
    email: normalisedEmail,
    password,
    role: normalisedRole
  };
 
  return next();
};
 
module.exports = validateRegistration;
