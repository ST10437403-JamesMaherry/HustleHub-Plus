import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api';

export default function ApiStatus() {
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState({ status: 'checking', error: '' });

  useEffect(() => {
    const controller = new AbortController();

    apiRequest('/health', { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      if (data?.status !== 'OK') throw new Error('The API did not return a healthy response.');
      setConnection({ status: 'online', error: '' });
    }).catch((error) => {
      if (!controller.signal.aborted) setConnection({ status: 'offline', error: error.message });
    });

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setConnection({ status: 'checking', error: '' });
    setAttempt((value) => value + 1);
  }

  return (
    <section className="api-status" aria-label="API connection">
      <div role="status">
        <span className="eyebrow">API connection</span>
        <p>{connection.status === 'online' ? 'Connected to HustleHub+.' : connection.status === 'checking' ? 'Checking connection...' : 'Connection unavailable.'}</p>
        {connection.error && <p className="muted">{connection.error}</p>}
      </div>
      {connection.status === 'offline' && (
        <button type="button" className="button-secondary" onClick={retry}>Check again</button>
      )}
    </section>
  );
}
