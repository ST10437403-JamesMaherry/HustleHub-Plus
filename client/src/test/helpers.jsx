import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';

const USER_ID = 'a'.repeat(24);

export function makeUser(role) {
  return { id: USER_ID, fullName: 'Test User', email: 'test@example.com', role };
}

// Routes are keyed "METHOD /path" and give { status = 200, body } or a function
// returning one. An unlisted request fails the test loudly instead of reaching the network.
export function stubApi(routes) {
  routes = { 'GET /health': { body: { status: 'OK' } }, ...routes };
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    const { status = 200, body } = typeof handler === 'function' ? handler(init) : handler;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Mimics a returning visitor: the stored token is confirmed by GET /api/auth/me.
export function signInAs(role, routes = {}) {
  window.sessionStorage.setItem('hustlehub.token', 'test-token');
  return stubApi({ 'GET /api/auth/me': { body: { user: makeUser(role) } }, ...routes });
}

export function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

// Calls made to a route, as { init, body } with the JSON body parsed.
export function callsTo(fetchMock, key) {
  return fetchMock.mock.calls
    .filter(([url, init = {}]) => `${init.method ?? 'GET'} ${new URL(url).pathname}` === key)
    .map(([, init]) => ({ init, body: init.body ? JSON.parse(init.body) : undefined }));
}
