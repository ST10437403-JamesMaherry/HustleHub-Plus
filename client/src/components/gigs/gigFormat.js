// Formatting and shape checks for gig data returned by /api/gigs.

const priceFormatter = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const dateFormatter = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatPrice(value) {
  return priceFormatter.format(value);
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

// Malformed records are dropped rather than rendered with partial or unexpected data.
export function toSafeGig(gig) {
  if (
    !gig || typeof gig.id !== 'string' || typeof gig.title !== 'string' ||
    typeof gig.description !== 'string' || typeof gig.category !== 'string' ||
    typeof gig.price !== 'number' || !Number.isFinite(gig.price)
  ) {
    return null;
  }

  return {
    id: gig.id,
    title: gig.title,
    description: gig.description,
    category: gig.category,
    price: gig.price,
    active: gig.active !== false,
    createdAt: typeof gig.createdAt === 'string' ? gig.createdAt : null,
    // Shown only if the API populates the freelancer with a display name.
    freelancerName: typeof gig.freelancer?.fullName === 'string' ? gig.freelancer.fullName : null
  };
}

export function toSafeGigs(data) {
  return Array.isArray(data?.gigs) ? data.gigs.map(toSafeGig).filter(Boolean) : null;
}