export const INVALID_CREDENTIALS = 'Email or password is incorrect.';

// Translates ApiError responses into form-level or field-level messages.
// api.js already replaces 5xx and oversized messages with safe text.
export function describeAuthError(error, action) {
  if (error?.name === 'AbortError') return null;

  if (error?.status === 429) {
    const seconds = Number(error.retryAfter);
    const wait = Number.isFinite(seconds) && seconds > 0
      ? `Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.`
      : 'Wait a few minutes before trying again.';
    return { form: `Too many attempts. ${wait}` };
  }

  // Unknown email and wrong password stay indistinguishable.
  if (action === 'login' && error?.status === 401) {
    return { form: INVALID_CREDENTIALS };
  }

  if (action === 'register' && error?.status === 409) {
    return { fields: { email: 'An account with this email already exists. Sign in instead.' } };
  }

  return { form: error?.message || 'The request could not be completed.' };
}

// RadioNodeList is returned for grouped inputs such as the role selector.
export function focusField(form, name) {
  const field = form?.elements.namedItem(name);
  const target = field instanceof RadioNodeList ? field[0] : field;
  target?.focus();
}