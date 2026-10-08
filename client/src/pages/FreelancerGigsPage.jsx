import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import FormMessage from '../components/auth/FormMessage';
import GigCard from '../components/gigs/GigCard';
import GigForm from '../components/gigs/GigForm';
import GigsStatus from '../components/gigs/GigsStatus';
import { toSafeGig, toSafeGigs } from '../components/gigs/gigFormat';
import { describeGigError } from '../components/gigs/gigValidation';
import '../components/auth/auth.css';
import '../components/gigs/gigs.css';

const UNEXPECTED = 'The API returned an unexpected response.';

function gigPath(id) {
  return `/api/gigs/${encodeURIComponent(id)}`;
}

export default function FreelancerGigsPage() {
  const { request } = useAuth();
  const [listing, setListing] = useState({ status: 'loading', gigs: [], error: '' });
  const [attempt, setAttempt] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });

  // /mine returns active and hidden gigs, scoped to the JWT's user by the API.
  useEffect(() => {
    const controller = new AbortController();

    request('/api/gigs/mine', { signal: controller.signal }).then((data) => {
      const gigs = toSafeGigs(data);
      if (!gigs) throw new Error(UNEXPECTED);
      if (!controller.signal.aborted) setListing({ status: 'ready', gigs, error: '' });
    }).catch((error) => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setListing({ status: 'error', gigs: [], error: error.message });
    });

    return () => controller.abort();
  }, [request, attempt]);

  const editingGig = listing.gigs.find((gig) => gig.id === editingId) ?? null;

  function retry() {
    setListing({ status: 'loading', gigs: [], error: '' });
    setAttempt((value) => value + 1);
  }

  // A 404 means the gig was deleted elsewhere or is not owned by this account.
  function handleMissingGig() {
    setEditingId(null);
    setNotice({ tone: 'error', text: 'That gig no longer exists, so your list has been refreshed.' });
    setAttempt((value) => value + 1);
  }

  async function handleSave(payload) {
    const target = editingGig;
    setNotice({ tone: 'success', text: '' });

    try {
      const data = target
        ? await request(gigPath(target.id), { method: 'PUT', body: payload })
        : await request('/api/gigs', { method: 'POST', body: payload });
      const gig = toSafeGig(data?.gig);
      if (!gig) throw new Error(UNEXPECTED);

      if (target) {
        setListing((current) => ({
          ...current,
          gigs: current.gigs.map((item) => (item.id === gig.id ? gig : item))
        }));
        setEditingId(null);
        setNotice({ tone: 'success', text: `Saved changes to "${gig.title}".` });
      } else {
        setListing((current) => ({ status: 'ready', gigs: [gig, ...current.gigs], error: '' }));
        setFormKey((value) => value + 1);
        setNotice({ tone: 'success', text: `Published "${gig.title}".` });
      }
    } catch (error) {
      if (target && error?.status === 404) {
        handleMissingGig();
        return;
      }
      throw error;
    }
  }

  async function handleDelete(gig) {
    setBusyId(gig.id);
    setNotice({ tone: 'success', text: '' });

    try {
      await request(gigPath(gig.id), { method: 'DELETE' });
      setListing((current) => ({ ...current, gigs: current.gigs.filter((item) => item.id !== gig.id) }));
      if (editingId === gig.id) setEditingId(null);
      setNotice({ tone: 'success', text: `Deleted "${gig.title}".` });
    } catch (error) {
      if (error?.status === 404) {
        handleMissingGig();
      } else {
        const message = describeGigError(error);
        if (message) setNotice({ tone: 'error', text: message });
      }
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  function startEdit(gig) {
    setConfirmingId(null);
    setNotice({ tone: 'success', text: '' });
    setEditingId(gig.id);
  }

  return (
    <section className="page">
      <header className="page-heading">
        <p className="eyebrow">Freelancer</p>
        <h1>Your gigs.</h1>
        <p className="page-description">
          Publish services, keep them up to date, and hide or remove the ones you no longer offer.
        </p>
      </header>

      <div className="manage-layout">
        <GigForm
          key={editingGig ? `edit-${editingGig.id}` : `new-${formKey}`}
          gig={editingGig}
          onSubmit={handleSave}
          onCancel={() => setEditingId(null)}
        />

        <section className="manage-list" aria-labelledby="manage-list-title">
          <div className="manage-list-header">
            <h2 id="manage-list-title">Listed services</h2>
            {listing.status === 'ready' && (
              <p className="gigs-count">{listing.gigs.length} total</p>
            )}
          </div>

          {notice.text && (
            <div className="manage-notice">
              <FormMessage tone={notice.tone}>{notice.text}</FormMessage>
            </div>
          )}

          {listing.status === 'loading' && <GigsStatus tone="loading" title="Loading your gigs." />}

          {listing.status === 'error' && (
            <GigsStatus tone="error" title="Your gigs could not be loaded." onRetry={retry}>
              {listing.error}
            </GigsStatus>
          )}

          {listing.status === 'ready' && listing.gigs.length === 0 && (
            <GigsStatus tone="empty" title="You have not listed any gigs.">
              Use the form to publish your first service.
            </GigsStatus>
          )}

          {listing.status === 'ready' && listing.gigs.length > 0 && (
            <ul className="gig-grid">
              {listing.gigs.map((gig) => (
                <li key={gig.id}>
                  <GigCard gig={gig}>
                    {confirmingId === gig.id ? (
                      <div className="gig-confirm" role="group" aria-label={`Confirm deleting ${gig.title}`}>
                        <p>Delete this gig permanently?</p>
                        <div className="gig-confirm-actions">
                          <button type="button" onClick={() => handleDelete(gig)} disabled={busyId === gig.id}>
                            {busyId === gig.id ? 'Deleting...' : 'Delete'}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => setConfirmingId(null)}
                            disabled={busyId === gig.id}
                            autoFocus
                          >
                            Keep
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => startEdit(gig)}
                          disabled={editingId === gig.id}
                          aria-label={`Edit ${gig.title}`}
                        >
                          {editingId === gig.id ? 'Editing' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => setConfirmingId(gig.id)}
                          aria-label={`Delete ${gig.title}`}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </GigCard>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}