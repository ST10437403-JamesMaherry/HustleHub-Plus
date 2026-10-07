export default function PagePlaceholder({ eyebrow = 'HustleHub+', title, description, children }) {
  return (
    <section className="page">
      <header className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </header>
      <div className="placeholder-panel">
        <span className="eyebrow">Page scaffold</span>
        <p>This route is ready. Its feature interface will be added in the next frontend issues.</p>
        {children}
      </div>
    </section>
  );
}
