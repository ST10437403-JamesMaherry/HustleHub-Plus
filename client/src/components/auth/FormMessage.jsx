// Errors interrupt (role="alert"); confirmations are announced politely.
export default function FormMessage({ tone = 'error', children }) {
  if (!children) return null;

  return (
    <div className={`form-message form-message-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="form-message-tag">{tone === 'error' ? 'Error' : 'Done'}</span>
      <p>{children}</p>
    </div>
  );
}