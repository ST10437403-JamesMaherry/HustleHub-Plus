import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/useAuth';
import GigCard from '../components/gigs/GigCard';
import GigsStatus from '../components/gigs/GigsStatus';
import BookGigAction from '../components/bookings/BookGigAction';
import { toSafeGigs } from '../components/gigs/gigFormat';
import '../components/gigs/gigs.css';
import '../components/bookings/bookings.css';

export default function GigsPage() {
  const { user } = useAuth();
  const [listing, setListing] = useState({ status: 'loading', gigs: [], error: '' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  // The marketplace is public, so no token is sent.
  useEffect(() => {
    const controller = new AbortController();

    apiRequest('/api/gigs', { signal: controller.signal }).then((data) => {
      const gigs = toSafeGigs(data);
      if (!gigs) throw new Error('The marketplace returned an unexpected response.');
      if (!controller.signal.aborted) setListing({ status: 'ready', gigs, error: '' });
    }).catch((error) => {
      if (!controller.signal.aborted) setListing({ status: 'error', gigs: [], error: error.message });
    });

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setListing({ status: 'loading', gigs: [], error: '' });
    setAttempt((value) => value + 1);
  }

  const term = query.trim().toLowerCase();
  const visibleGigs = useMemo(() => {
    if (!term) return listing.gigs;
    return listing.gigs.filter((gig) => (
      [gig.title, gig.category, gig.description].some((value) => value.toLowerCase().includes(term))
    ));
  }, [listing.gigs, term]);

  return (
    <section className="page">
      <header className="page-heading">
        <p className="eyebrow">Marketplace</p>
        <h1>Good work starts here.</h1>
        <p className="page-description">
          Browse freelance services and find the right person for your next project.
        </p>
        {!user && (
          <p className="gigs-hint">
            <Link to="/login" state={{ from: '/gigs' }}>Sign in</Link> as a client to book a service.
          </p>
        )}
      </header>

      {listing.status === 'loading' && <GigsStatus tone="loading" title="Loading services." />}

      {listing.status === 'error' && (
        <GigsStatus tone="error" title="Services could not be loaded." onRetry={retry}>
          {listing.error}
        </GigsStatus>
      )}

      {listing.status === 'ready' && listing.gigs.length === 0 && (
        <GigsStatus tone="empty" title="No services listed yet.">
          New services appear here as soon as freelancers publish them.
        </GigsStatus>
      )}

      {listing.status === 'ready' && listing.gigs.length > 0 && (
        <>
          <div className="gigs-toolbar">
            <div className="form-field gigs-search">
              <label htmlFor="gig-search">Search services</label>
              <input
                id="gig-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={100}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="gigs-count" aria-live="polite">
              {visibleGigs.length} of {listing.gigs.length} services
            </p>
          </div>

          {visibleGigs.length > 0 ? (
            <ul className="gig-grid">
              {visibleGigs.map((gig) => (
                <li key={gig.id}>
                  <GigCard gig={gig}>
                    {/* Booking controls are only offered to clients; the API enforces the same rule. */}
                    {user?.role === 'client' && <BookGigAction gig={gig} />}
                  </GigCard>
                </li>
              ))}
            </ul>
          ) : (
            <GigsStatus tone="empty" title="No matching services.">
              Try a different title, category or keyword.
            </GigsStatus>
          )}
        </>
      )}
    </section>
  );
}