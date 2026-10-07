import { useAuth } from '../context/useAuth';

export default function SessionGate() {
  const { status, error, logout, retrySession } = useAuth();

  return (
    <section className="page compact-page" aria-busy={status === 'restoring'}>
      <p className="eyebrow">Account access</p>
      <h1>{status === 'restoring' ? 'Checking your session.' : 'Session unavailable.'}</h1>
      <p role="status" className="page-description">
        {status === 'restoring' ? 'Confirming your account with the API.' : error}
      </p>
      {status === 'unavailable' && (
        <div className="actions">
          <button type="button" onClick={retrySession}>Try again</button>
          <button type="button" className="button-secondary" onClick={logout}>Discard saved session</button>
        </div>
      )}
    </section>
  );
}
