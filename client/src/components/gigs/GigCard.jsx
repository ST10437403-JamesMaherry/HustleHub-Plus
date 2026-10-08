import { formatDate, formatPrice } from './gigFormat';

// Gig text is user-supplied, so it is only ever rendered as JSX text, never as HTML.
// children is an action slot (e.g. booking in #32, edit/delete in #31).
export default function GigCard({ gig, children }) {
  const titleId = `gig-${gig.id}-title`;
  const listed = formatDate(gig.createdAt);

  return (
    <article className="gig-card" aria-labelledby={titleId}>
      {!gig.active && <p className="gig-flag">Hidden from marketplace</p>}
      <p className="eyebrow gig-category">{gig.category}</p>
      <h2 id={titleId} className="gig-title">{gig.title}</h2>
      <p className="gig-description">{gig.description}</p>

      <dl className="gig-meta">
        <div>
          <dt>Price</dt>
          <dd className="gig-price">{formatPrice(gig.price)}</dd>
        </div>
        {gig.freelancerName && (
          <div>
            <dt>Freelancer</dt>
            <dd>{gig.freelancerName}</dd>
          </div>
        )}
        {listed && (
          <div>
            <dt>Listed</dt>
            <dd>{listed}</dd>
          </div>
        )}
      </dl>

      {children && <div className="gig-actions">{children}</div>}
    </article>
  );
}