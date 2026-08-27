/**
 * Validates and normalises login input before it reaches
 * the authentication controller.
 */
const validateLogin = (req, res, next) => {
  const {
    email,
    password
  } = req.body;

  // Both credentials are required for login.
  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  // Credentials must use the expected text data types.
  if (
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({
      error: 'Email and password must be valid text values'
    });
  }

  // Normalise the email before user lookup.
  req.body = {
    email: email.trim().toLowerCase(),
    password
  };

  return next();
};

module.exports = validateLogin;