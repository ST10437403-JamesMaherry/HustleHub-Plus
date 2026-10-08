// Mirrors api/middleware/validateGig.js. The API remains authoritative for
// validation and ownership; these checks only give faster feedback.

export const GIG_LIMITS = {
  title: { min: 3, max: 100 },
  description: { min: 10, max: 1000 },
  category: { min: 2, max: 50 }
};

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

export function gigToForm(gig) {
  return {
    title: gig?.title ?? '',
    category: gig?.category ?? '',
    price: gig ? String(gig.price) : '',
    description: gig?.description ?? '',
    active: gig ? gig.active : true
  };
}

function lengthError(value, label, { min, max }) {
  if (!value) return `Enter a ${label.toLowerCase()}.`;
  if (value.length < min || value.length > max) {
    return `${label} must be between ${min} and ${max} characters.`;
  }
  return undefined;
}

// Key order matches the on-screen field order so focus lands on the first visible error.
export function validateGigForm(values) {
  const price = values.price.trim();
  const errors = {
    title: lengthError(values.title.trim(), 'Title', GIG_LIMITS.title),
    category: lengthError(values.category.trim(), 'Category', GIG_LIMITS.category),
    price: undefined,
    description: lengthError(values.description.trim(), 'Description', GIG_LIMITS.description)
  };

  if (!price) {
    errors.price = 'Enter a price.';
  } else if (!PRICE_PATTERN.test(price) || Number(price) <= 0) {
    errors.price = 'Use a positive amount with up to two decimals, such as 450 or 1250.50.';
  }

  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

// Only fields in the API's allow-list are sent; ownership comes from the JWT.
export function toGigPayload(values, editing) {
  const payload = {
    title: values.title.trim(),
    category: values.category.trim(),
    price: Number(values.price.trim()),
    description: values.description.trim()
  };

  if (editing) payload.active = values.active;
  return payload;
}

export function describeGigError(error) {
  if (error?.name === 'AbortError') return null;
  if (error?.status === 403) return 'Only freelancer accounts can manage gigs.';
  if (error?.status === 401) return 'Your session ended. Please sign in again.';
  return error?.message || 'The request could not be completed.';
}