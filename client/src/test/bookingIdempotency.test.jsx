import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../services/api';
import { callsTo, renderApp, signInAs } from './helpers';

const GIGS = [
  { id: 'g1', title: 'Web design', category: 'Design', price: 450.25, active: true, description: 'A five page website.' },
  { id: 'g2', title: 'Tutoring', category: 'Education', price: 200, active: true, description: 'One tutoring session.' }
];

const REQUEST_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findGigCard(title) {
  return (await screen.findByRole('heading', { name: title })).closest('article');
}

async function confirmInCard(user, card) {
  await user.click(within(card).getByRole('button', { name: 'Book this gig' }));
  await user.click(within(card).getByRole('button', { name: 'Confirm booking' }));
}

describe('booking replay protection', () => {
  it('sends one UUID v4 request key in a header without changing the booking body', async () => {
    const user = userEvent.setup();
    const fetchMock = signInAs('client', {
      'GET /api/gigs': { body: { gigs: GIGS } },
      'POST /api/bookings': {
        status: 201,
        body: {
          booking: { id: 'a'.repeat(24), gig: 'g1', amount: 450.25, status: 'confirmed' },
          transaction: { id: 'b'.repeat(24) },
          replayed: false
        }
      }
    });
    renderApp('/gigs');

    const card = await findGigCard('Web design');
    await confirmInCard(user, card);
    expect(await within(card).findByText('Booking confirmed.')).toBeInTheDocument();

    const calls = callsTo(fetchMock, 'POST /api/bookings');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ gigId: 'g1' });
    expect(calls[0].init.headers.Authorization).toBe('Bearer test-token');
    expect(calls[0].init.headers['Idempotency-Key']).toMatch(REQUEST_KEY_PATTERN);
  });

  it('reuses the same request key when a user explicitly retries a rejected attempt', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const fetchMock = signInAs('client', {
      'GET /api/gigs': { body: { gigs: GIGS } },
      'POST /api/bookings': () => {
        attempt += 1;
        return attempt === 1
          ? { status: 429, body: { error: 'Too many booking attempts' } }
          : {
            status: 201,
            body: {
              booking: { id: 'a'.repeat(24), gig: 'g1', amount: 450.25, status: 'confirmed' },
              transaction: { id: 'b'.repeat(24) }
            }
          };
      }
    });
    renderApp('/gigs');

    const card = await findGigCard('Web design');
    await confirmInCard(user, card);
    expect(await within(card).findByRole('alert')).toHaveTextContent('Too many');

    await user.click(within(card).getByRole('button', { name: 'Confirm booking' }));
    expect(await within(card).findByText('Booking confirmed.')).toBeInTheDocument();

    const calls = callsTo(fetchMock, 'POST /api/bookings');
    expect(calls).toHaveLength(2);
    expect(calls[0].init.headers['Idempotency-Key']).toBe(calls[1].init.headers['Idempotency-Key']);
  });

  it('does not automatically retry when a network failure leaves the booking outcome unknown', async () => {
    const user = userEvent.setup();
    const fetchMock = signInAs('client', {
      'GET /api/gigs': { body: { gigs: GIGS } },
      'POST /api/bookings': () => { throw new Error('Network interrupted'); }
    });
    renderApp('/gigs');

    const card = await findGigCard('Web design');
    await confirmInCard(user, card);

    expect(await within(card).findByText('Booking status unconfirmed.')).toBeInTheDocument();
    expect(within(card).getByText('Check My bookings')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST /api/bookings')).toHaveLength(1);
    expect(within(card).queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument();
  });

  it('creates distinct keys for independent bookings', async () => {
    const user = userEvent.setup();
    let number = 0;
    const fetchMock = signInAs('client', {
      'GET /api/gigs': { body: { gigs: GIGS } },
      'POST /api/bookings': (init) => {
        number += 1;
        return {
          status: 201,
          body: {
            booking: {
              id: String(number).repeat(24),
              gig: JSON.parse(init.body).gigId,
              amount: 200,
              status: 'confirmed'
            },
            transaction: { id: String(number + 2).repeat(24) }
          }
        };
      }
    });
    renderApp('/gigs');

    const first = await findGigCard('Web design');
    await confirmInCard(user, first);
    expect(await within(first).findByText('Booking confirmed.')).toBeInTheDocument();

    const second = await findGigCard('Tutoring');
    await confirmInCard(user, second);
    expect(await within(second).findByText('Booking confirmed.')).toBeInTheDocument();

    const calls = callsTo(fetchMock, 'POST /api/bookings');
    expect(calls).toHaveLength(2);
    expect(calls[0].init.headers['Idempotency-Key']).not.toBe(calls[1].init.headers['Idempotency-Key']);
  });

  it('rejects malformed request keys before sending a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/api/bookings', {
      method: 'POST',
      body: { gigId: 'g1' },
      token: 'test-token',
      idempotencyKey: 'bad-key'
    })).rejects.toThrow('Invalid booking request identifier');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
