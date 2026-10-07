const LABELS = { loading: 'Loading', error: 'Error', empty: 'Nothing here yet' };

// Shared loading / empty / error panel for gig lists.
export default function GigsStatus({ tone, title, children, onRetry }) {
  return (
    <div
      className="gigs-status"
      role={tone === 'error' ? 'alert' : 'status'}
      aria-busy={tone === 'loading'}
    >
      <p className="eyebrow">{LABELS[tone]}</p>
      <h2>{title}</h2>
      {children && <p className="gigs-status-copy">{children}</p>}
      {onRetry && (
        <button type="button" className="button-secondary" onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}