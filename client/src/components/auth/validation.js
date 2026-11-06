// Mirrors api/middleware/validateRegistration.js and validateLogin.js.
// These checks only give faster feedback; the API remains authoritative.

export const PUBLIC_ROLES = ['client', 'freelancer'];

export const FULL_NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;

const FULL_NAME_MIN_LENGTH = 2;
const PASSWORD_MIN_BYTES = 8;
const PASSWORD_MAX_BYTES = 72;

const EMAIL_PATTERN = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;
const FULL_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’-]*$/u;

const encoder = new TextEncoder();

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
}

// bcrypt limits are measured in UTF-8 bytes, not characters.
function passwordBytes(value) {
  return encoder.encode(value).length;
}

export function isPossiblePassword(value) {
  const bytes = passwordBytes(value);
  return bytes >= PASSWORD_MIN_BYTES && bytes <= PASSWORD_MAX_BYTES;
}

function emailError(email) {
  if (!email) return 'Enter your email address.';
  if (
    email.length > EMAIL_MAX_LENGTH ||
    hasControlCharacters(email) ||
    !EMAIL_PATTERN.test(email)
  ) {
    return 'Enter a valid email address, such as name@example.com.';
  }
  return undefined;
}

function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

export function normaliseRegistration(values) {
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    role: values.role
  };
}

export function validateRegistration(values) {
  const { fullName, email, password, role } = normaliseRegistration(values);
  // Key order matches the on-screen field order so focus lands on the first visible error.
  const errors = { role: undefined, fullName: undefined, email: emailError(email) };

  if (!fullName) {
    errors.fullName = 'Enter your full name.';
  } else if (fullName.length < FULL_NAME_MIN_LENGTH || fullName.length > FULL_NAME_MAX_LENGTH) {
    errors.fullName = 'Full name must be between 2 and 80 characters.';
  } else if (hasControlCharacters(fullName) || !FULL_NAME_PATTERN.test(fullName)) {
    errors.fullName = 'Use letters, spaces, apostrophes, full stops or hyphens only.';
  }

  if (!password) {
    errors.password = 'Create a password.';
  } else if (!isPossiblePassword(password)) {
    errors.password = 'Password must be between 8 and 72 characters.';
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirm your password.';
  } else if (values.confirmPassword !== password) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (!PUBLIC_ROLES.includes(role)) {
    errors.role = 'Choose how you will use HustleHub+.';
  }

  return compact(errors);
}

export function validateLogin(values) {
  return compact({
    email: emailError(values.email.trim().toLowerCase()),
    password: values.password ? undefined : 'Enter your password.'
  });
}