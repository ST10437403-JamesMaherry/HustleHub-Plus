const allowedRoles = ['client', 'freelancer'];

/**
 * Performs the minimum validation required before registration
 * data reaches the authentication controller.
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

  // Only normal HustleHub+ user roles may be created publicly.
  if (!allowedRoles.includes(role.trim().toLowerCase())) {
    return res.status(400).json({
      error: 'Role must be client or freelancer'
    });
  }

  // Replace the request values with their normalised equivalents.
  req.body = {
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    password,
    role: role.trim().toLowerCase()
  };

  return next();
};

module.exports = validateRegistration;

/** to be done next
 * email-format validation
*password policy
*name length limits
*malicious input handling
*more comprehensive type/length rules
 */