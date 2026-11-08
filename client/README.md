# HustleHub+ Client

The React frontend for HustleHub+, built with Vite. It provides registration and login, the gig marketplace, client booking and booking history, freelancer gig management with the income and illustrative tax dashboard, and the administrator dashboard. All data comes from the HTTPS API; the client never connects to MongoDB.

Setup for the whole project, including the API and the local certificate, is in the [root README](../README.md).

## Configuration

`client/.env` holds one public value:

```env
VITE_API_URL=https://localhost:4000
```

It is the API origin only, without `/api`. Vite embeds it at build time, so restart the dev server (or rebuild the image) after changing it. No secret belongs in this file.

## Scripts

Run from the repository root:

| Command | Purpose |
|---|---|
| `npm --prefix client run dev` | Development server at `http://localhost:5173` |
| `npm --prefix client run build` | Production build into `client/dist/` |
| `npm --prefix client run preview` | Serve the production build locally |
| `npm --prefix client run lint` | ESLint |
| `npm --prefix client test` | Vitest tests; also writes the Part 2 JUnit report |
| `npm --prefix client run test:coverage` | Vitest with V8 coverage; writes `client/coverage/lcov.info` for SonarQube Cloud |

## Structure

| Location | Purpose |
|---|---|
| `src/App.jsx` | Routes and role-specific pages |
| `src/context/` | `AuthContext`: sign-in, server-side sign-out, session restoration through `/api/auth/me` |
| `src/services/api.js` | Shared API requests, bearer tokens, timeouts, controlled errors and the booking `Idempotency-Key` header |
| `src/pages/` | Login, registration, marketplace, client bookings, freelancer gigs and dashboard, administrator dashboard |
| `src/components/` | Route guards, app shell, forms, gig controls and the booking confirmation flow |
| `src/test/` | Vitest and React Testing Library tests |
| `nginx/default.conf`, `Dockerfile`, `docker/` | Container image: Nginx serving the built app as a non-root user |

## Security notes

- The JWT is kept in the tab's `sessionStorage` and sent as `Authorization: Bearer <token>`. Signing out calls `POST /api/auth/logout` so the server revokes the token, then clears local state even if the request fails.
- Each booking attempt generates a UUID v4 `Idempotency-Key` with the browser's cryptographic random generator and reuses it only for retries of that attempt.
- React renders text through JSX escaping. Route guards only shape navigation; the API enforces every role and ownership rule.

See [session revocation](../docs/security/session-revocation.md), [booking replay protection](../docs/security/booking-idempotency.md) and the [threat-to-control review](../docs/security/threat-control-review.md).
