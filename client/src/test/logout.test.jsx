import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, renderApp, signInAs } from './helpers';

describe('server-side sign-out', () => {
  it('revokes the token on the API and removes the local session', async () => {
    const user = userEvent.setup();
    const fetchMock = signInAs('client', {
      'GET /api/gigs': { body: { gigs: [] } },
      'POST /api/auth/logout': { body: { message: 'Signed out successfully' } }
    });
    renderApp('/gigs');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in.' })).toBeInTheDocument();
    await waitFor(() => expect(callsTo(fetchMock, 'POST /api/auth/logout')).toHaveLength(1));
    const [logout] = callsTo(fetchMock, 'POST /api/auth/logout');
    expect(logout.init.headers.Authorization).toBe('Bearer test-token');
    expect(logout.init.method).toBe('POST');
    expect(window.sessionStorage.getItem('hustlehub.token')).toBeNull();
  });

  it('clears local state and warns if the API cannot confirm revocation', async () => {
    const user = userEvent.setup();
    const fetchMock = signInAs('freelancer', {
      'GET /api/gigs': { body: { gigs: [] } },
      'POST /api/auth/logout': { status: 503, body: { error: 'Internal failure' } }
    });
    renderApp('/gigs');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in.' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('hustlehub.token')).toBeNull();
    expect(await screen.findByText(/Server sign-out could not be confirmed/)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST /api/auth/logout')).toHaveLength(1);
  });

  it('clears a revoked session when a protected request returns 401', async () => {
    const fetchMock = signInAs('client', {
      'GET /api/bookings/mine': {
        status: 401,
        body: { error: 'Invalid or expired authentication token' }
      }
    });
    renderApp('/bookings');

    expect(await screen.findByRole('heading', { name: 'Sign in.' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('hustlehub.token')).toBeNull();
    expect(callsTo(fetchMock, 'POST /api/auth/logout')).toHaveLength(0);
  });
});
