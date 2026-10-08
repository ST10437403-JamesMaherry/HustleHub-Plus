# HustleHub+ Client Foundation

Issue 28 establishes the shared React/Vite frontend. It does not implement the later authentication forms, Gig UI, booking UI, income dashboard or admin actions. Every feature page is deliberately a placeholder; routing, session restoration, logout, API communication and the app shell are functional.

## Install

This source overlay is applied AFTER creating the official JavaScript React template:

```bash
npm create vite@latest client -- --template react
npm --prefix client install
npm --prefix client install react-router
```

Extract the supplied archive into the repository root so its `client/` folder merges with the generated `client/`. The archive intentionally does not replace the generated package.json, package-lock.json, eslint.config.js or .gitignore.

Remove unused template assets and prepare local configuration:

```bash
rm -f client/src/App.css client/src/index.css client/src/assets/react.svg client/public/vite.svg
cp client/.env.example client/.env
```

The only frontend environment value is:

```env
VITE_API_URL=https://localhost:4000
```

Do not copy api/.env to client/.env. VITE_ values are public build configuration, not a place for secrets.

## Run

Run the backend from the repository root in terminal one:

```bash
npm --prefix api run dev
```

Use the same browser you will use for the frontend to visit https://localhost:4000/health. Trust the project's local development certificate through the browser/operating system where necessary. Browser HTTPS trust is independent of Node's TLS environment variables. Do not disable browser certificate validation globally.

Run the client in terminal two:

```bash
npm --prefix client run dev
```

Open http://localhost:5173. The API connection indicator uses the real GET /health endpoint; it does not display a simulated success state.

Vite uses localhost:5173 with strictPort enabled. Stop any other process using that port instead of moving the frontend to a different origin. The API's local CLIENT_ORIGIN should be http://localhost:5173.

## Routes and ownership

| Route | Page | Access | Main feature owner |
|---|---|---|---|
| /gigs | GigsPage.jsx | Public | Ewald |
| /login | LoginPage.jsx | Signed out | Ewald |
| /register | RegisterPage.jsx | Signed out | Ewald |
| /freelancer/gigs | FreelancerGigsPage.jsx | Freelancer | Ewald |
| /bookings | ClientBookingsPage.jsx | Client | Mark |
| /freelancer/dashboard | FreelancerDashboardPage.jsx | Freelancer | James |
| /admin | AdminDashboardPage.jsx | Admin | Ewald |

The root redirects to /gigs. Unknown paths show a page-not-found screen. All routes are registered now, so later work should normally replace page/component content rather than edit App.jsx.

The booking API was completed by James following reassignment. The table above assigns the later frontend pages, not ownership of already completed backend work.

## Shared architecture

- `services/api.js`: JSON transport, safe errors, abort/timeout support and token storage primitives.
- `context/AuthContext.jsx`: AuthProvider, safe restoration, login, logout and authenticated request wrapper.
- `context/auth-context.js`: The shared context object.
- `context/useAuth.js`: Hook for consuming the provider.
- `components/AppShell.jsx`: Header, role-aware navigation, footer and main content area.
- `components/ProtectedRoute.jsx`: Signed-in and role-aware navigation guard.
- `components/GuestRoute.jsx`: Keeps authenticated users out of login/register placeholders.
- `components/SessionGate.jsx`: Loading and retryable session-restoration states.
- `components/ApiStatus.jsx`: Small, real API health check with retry.
- `components/PagePlaceholder.jsx`: Consistent placeholder layout for the seven pages.

The provider and hook live in separate modules so component modules keep their React Fast Refresh boundary.

## API contract for contributors

Use `apiRequest` for PUBLIC requests. Supply a plain JavaScript object as `body`; the service serializes JSON. Paths include `/api` because VITE_API_URL is the origin, not an `/api` URL.

```javascript
import { apiRequest } from '../services/api';

const { gigs } = await apiRequest('/api/gigs', { signal });

await apiRequest('/api/auth/register', {
  method: 'POST',
  body: { fullName, email, password, role }
});
```

Use `useAuth()` for session changes and PROTECTED requests:

```javascript
import { useAuth } from '../context/useAuth';

// Inside a component.
const { user, login, logout, request } = useAuth();

await login({ email, password });
const { bookings } = await request('/api/bookings/mine', { signal });
const income = await request('/api/income/me', { signal });
logout();
```

`login` returns the safe user object, not a token. A future login form should hold password input only while editing/submitting and clear it after submission. Do not store passwords in browser storage.

`request` adds `Authorization: Bearer <token>` centrally and clears the current session on a protected 401. It does not clear the session on 403 or 429. Components must handle errors and use AbortController cleanup when fetching in an effect. AbortError means the request was cancelled and should not be displayed as a server failure.

`ApiError` exposes `message`, `status`, and `retryAfter` (when the browser can read the header). The backend does not currently expose Retry-After through CORS, so do not depend on that header in the UI. A 429 still exposes its status and controlled response message.

Requests are never automatically retried. In particular, do not automatically repeat a booking POST or login POST.

## Session behavior

Only `hustlehub.token` is stored in sessionStorage. No user object, password, MongoDB URI or signing secret is stored by this client.

On a refresh, the provider calls GET /api/auth/me with the saved JWT. Only the API response establishes the user and role. A stored token is not treated as a verified session by itself.

- Valid session: display the safe user and allow the matching UI routes.
- Missing token: remain signed out.
- Invalid/expired token or deleted account returning 401: clear the token and remain signed out.
- Network/server failure: retain the token, but do not display protected content; offer retry or discard.
- Logout: remove the app's sessionStorage token and clear the in-memory user.
- Delayed responses from an older session do not replace a newer session.

Session storage is JavaScript-readable. This follows the module's teaching approach; it is not equivalent to HttpOnly cookies. Keep user text in JSX text expressions and do not use dangerouslySetInnerHTML. Logout clears this tab's session, but does not revoke an already-issued JWT on the backend.

The backend remains responsible for real authentication, RBAC and ownership. Frontend route guards are navigation controls, not an API security boundary.

## Quick local verification

```bash
npm --prefix client run lint
npm --prefix client run build
```

Visit /gigs, /login and /register, then try /bookings while signed out. It should redirect to /login. Inspect the shell at a narrow mobile width and confirm no horizontal scrolling.

The temporary browser snippet below creates one disposable client and makes ONE login request. It allows restoration and logout to be checked before a login form exists. Run it only in browser developer tools at http://localhost:5173 while the local backend is running.

```javascript
void (async () => {
  const { apiRequest, saveToken } = await import('/src/services/api.js');
  const email = `foundation.${Date.now().toString(36)}@example.com`;
  const password = 'FoundationTest123!';

  // Create a disposable account through the existing public API.
  await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Frontend Foundation Client', email, password, role: 'client' }
  });

  const result = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  });

  saveToken(result.token);
  window.location.assign('/bookings');
})().catch((error) => console.error(error.message));
```

On /bookings, expect the client placeholder, your test user's name, and Sign out. Refresh: the same account should be restored through /api/auth/me, without another login. Visit /admin: expect Access denied. Click Sign out: expect /login and no `hustlehub.token` in sessionStorage.

For invalid-session handling, while signed out run:

```javascript
sessionStorage.setItem('hustlehub.token', 'invalid-token');
window.location.assign('/bookings');
```

Expect the API's 401 to clear the token and return to /login. Never use a real password or copy a real JWT into shared screenshots.

If the login rate limiter returns 429, stop and restart only the local development API or wait for its window to expire. Do not remove the rate limiter.

This smoke check creates one disposable User record and does not delete existing records. Formal Postman/Newman and frontend interaction testing remain part of the later testing milestone.

## Frontend tests

Vitest, React Testing Library and jsdom cover the main user journeys. Network calls are replaced at the `fetch` boundary, so no API, database or certificate is needed. Install and run from the repository root:

```powershell
npm --prefix client install; npm --prefix client test
```

`VITE_API_URL` is set to `https://localhost:4000` by the test config, so `client/.env` is not read or required. Each run also writes a JUnit report to `evidence/part2/react-tests.xml` for the Part 2 evidence folder.

What is covered:

- Login (interaction): a rejected sign-in shows one generic error, clears the password field and stores nothing.
- Registration (rendering and interaction): only client and freelancer can be chosen, and the request omits `confirmPassword` and sends a lowercase email.
- Marketplace (rendering and interaction): gigs from the API are listed, the search box narrows them, and anonymous visitors see no booking button.
- Freelancer gig form (interaction): an empty form is blocked with field messages and no request; a valid form posts the expected payload with the bearer token.
- Client booking (interaction): booking needs a confirmation step and sends only the gig ID.
- Route guards (rendering): anonymous visitors go to `/login`, the wrong role sees Access denied, and the right role sees the page.
- API service (security): paths that would leave the configured origin are refused before `fetch`, so the JWT cannot be sent elsewhere.

The admin dashboard is still a placeholder, so only its route guard is exercised, not admin features.

## Build and deployment boundary

`npm run build` builds this client into `dist/`. The generated package-lock.json must be committed for reproducible installs. A later deployment must serve index.html for frontend route paths such as /bookings; do not configure that fallback on the API server blindly.

No reverse proxy, Axios, Redux, UI kit, refresh-token infrastructure or backend changes are introduced in this issue.

## Source anchors

Project requirements: INSY7314 Module Manual, Learning Unit 4, pp. 106-114; INSY7314 POE, Part 2 requirements and React/frontend rubric; supplied Issue 28 and team development roadmap.

Implementation references:

- https://vite.dev/guide/
- https://vite.dev/guide/env-and-mode
- https://vite.dev/config/server-options
- https://reactrouter.com/start/declarative/installation
- https://reactrouter.com/start/declarative/routing
- https://react.dev/reference/react/useEffect