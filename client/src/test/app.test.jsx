import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, renderApp, signInAs, stubApi } from './helpers';

const GIGS = [
  {
    id: 'g1', title: 'Logo design', category: 'Design', price: 450,
    description: 'A clean logo with two revisions.', active: true, freelancer: { fullName: 'Thandi M' }
  },
  {
    id: 'g2', title: 'Maths tutoring', category: 'Tutoring', price: 200,
    description: 'One hour of Grade 12 maths help.', active: true
  }
];

describe('login', () => {
  it('shows a generic error for bad credentials and never echoes the password', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'POST /api/auth/login': { status: 401, body: { error: 'No such user' } }
    });
    renderApp('/login');

    const email = await screen.findByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.type(email, 'nobody@example.com');
    await user.type(password, 'Wrong-pass-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // The same wording is used for unknown email and wrong password.
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(password).toHaveValue('');
    expect(document.body).not.toHaveTextContent('Wrong-pass-123');
    expect(window.sessionStorage.length).toBe(0);
    expect(callsTo(fetchMock, 'POST /api/auth/login')).toHaveLength(1);
  });
});

describe('registration', () => {
  it('offers only client and freelancer, and sends no admin role or password confirmation', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'POST /api/auth/register': { status: 201, body: { user: { email: 'sam@example.com' } } }
    });
    renderApp('/register');

    const roles = (await screen.findAllByRole('radio')).map((radio) => radio.value);
    expect(roles).toEqual(['client', 'freelancer']);

    await user.click(screen.getByRole('radio', { name: /freelancer/i }));
    await user.type(screen.getByLabelText('Full name'), 'Sam Jones');
    await user.type(screen.getByLabelText('Email'), 'Sam@Example.com');
    await user.type(screen.getByLabelText('Password'), 'Str0ng-pass!');
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng-pass!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // A successful registration lands on the sign-in form with the email prefilled.
    expect(await screen.findByText('Account created. Sign in to continue.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('sam@example.com');
    expect(callsTo(fetchMock, 'POST /api/auth/register')[0].body).toEqual({
      fullName: 'Sam Jones', email: 'sam@example.com', password: 'Str0ng-pass!', role: 'freelancer'
    });
  });
});

describe('marketplace', () => {
  it('lists gigs from the API and narrows them with the search box', async () => {
    const user = userEvent.setup();
    stubApi({ 'GET /api/gigs': { body: { gigs: GIGS } } });
    renderApp('/gigs');

    expect(await screen.findByRole('heading', { name: 'Logo design' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Maths tutoring' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 services')).toBeInTheDocument();
    // Anonymous visitors get no booking buttons.
    expect(screen.queryByRole('button', { name: /book this gig/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search services'), 'tutor');

    expect(screen.getByText('1 of 2 services')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Logo design' })).not.toBeInTheDocument();
  });
});

describe('freelancer gig form', () => {
  it('blocks an invalid gig, then publishes a valid one with the expected payload', async () => {
    const user = userEvent.setup();
    const fetchMock = signInAs('freelancer', {
      'GET /api/gigs/mine': { body: { gigs: [] } },
      'POST /api/gigs': (init) => ({
        status: 201,
        body: { gig: { ...JSON.parse(init.body), id: 'g9', active: true } }
      })
    });
    renderApp('/freelancer/gigs');

    await screen.findByText('You have not listed any gigs.');
    await user.click(screen.getByRole('button', { name: 'Publish gig' }));

    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(screen.getByText('Enter a price.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST /api/gigs')).toHaveLength(0);

    await user.type(screen.getByLabelText('Title'), 'Website build');
    await user.type(screen.getByLabelText('Category'), 'Development');
    await user.type(screen.getByLabelText('Price (ZAR)'), '1250.50');
    await user.type(screen.getByLabelText('Description'), 'A responsive five page website.');
    await user.click(screen.getByRole('button', { name: 'Publish gig' }));

    expect(await screen.findByText('Published "Website build".')).toBeInTheDocument();
    const [post] = callsTo(fetchMock, 'POST /api/gigs');
    expect(post.body).toEqual({
      title: 'Website build', category: 'Development', price: 1250.5,
      description: 'A responsive five page website.'
    });
    expect(post.init.headers.Authorization).toBe('Bearer test-token');
    expect(screen.getByRole('heading', { name: 'Website build' })).toBeInTheDocument();
  });
});

describe('client booking', () => {
  it('books a gig after confirmation and sends only the gig id', async () => {
    const user = userEvent.setup();
    const fetchMock = signInAs('client', {
      'GET /api/gigs': { body: { gigs: GIGS } },
      'POST /api/bookings': {
        status: 201,
        body: {
          booking: { id: 'b'.repeat(24), gig: 'g1', amount: 450, status: 'confirmed' },
          transaction: { id: 't1' }
        }
      }
    });
    renderApp('/gigs');

    const card = (await screen.findByRole('heading', { name: 'Logo design' })).closest('article');
    await user.click(within(card).getByRole('button', { name: 'Book this gig' }));
    expect(callsTo(fetchMock, 'POST /api/bookings')).toHaveLength(0);

    await user.click(within(card).getByRole('button', { name: 'Confirm booking' }));

    expect(await within(card).findByText('Booking confirmed.')).toBeInTheDocument();
    const [post] = callsTo(fetchMock, 'POST /api/bookings');
    expect(post.body).toEqual({ gigId: 'g1' });
    expect(post.init.headers.Authorization).toBe('Bearer test-token');
  });
});

describe('route guards', () => {
  it('sends an anonymous visitor to the login page', async () => {
    stubApi({});
    renderApp('/bookings');

    expect(await screen.findByRole('heading', { name: 'Sign in.' })).toBeInTheDocument();
  });

  it('shows access denied when the role does not match', async () => {
    signInAs('client');
    renderApp('/freelancer/gigs');

    expect(await screen.findByRole('heading', { name: 'Access denied.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your gigs.' })).not.toBeInTheDocument();
  });

  it('shows the page to the matching role', async () => {
    signInAs('freelancer', { 'GET /api/gigs/mine': { body: { gigs: [] } } });
    renderApp('/freelancer/gigs');

    expect(await screen.findByRole('heading', { name: 'Your gigs.' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Access denied.')).not.toBeInTheDocument());
  });
});
