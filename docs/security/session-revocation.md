# Server-side JWT session revocation

HustleHub+ implements a database-backed session version as an additional Part 3 security control. This supplements the existing JWT signature and expiry checks, rate limiting, role-based access control and HTTPS configuration.

## Threat and control

Before this control, signing out only removed `hustlehub.token` from the browser's `sessionStorage`. A stolen or copied token remained valid until expiry. The server now checks a per-user `sessionVersion` stored in MongoDB on every protected request.

- `User.sessionVersion` starts at `0`, including for existing documents without that field.
- On login, the signed JWT contains only `id`, `role`, `sessionVersion` and JWT timestamps.
- Authentication middleware verifies the JWT signature/expiry, validates the claims, loads the user from MongoDB and checks that the database role and session version match. Deleted users, changed roles and old versions receive `401`.
- `POST /api/auth/logout` requires a current JWT and atomically increments the database session version using an expected-version condition. All tokens from earlier versions become invalid; signing in again generates a token containing the new version.
- A concurrent sign-out whose expected version no longer matches receives `401` rather than claiming success.

## Client behaviour

The React `AuthContext` starts the protected logout request using the current bearer token, then clears the in-memory user and browser token immediately. If the network request fails, local access still ends and a warning explains that server revocation was not confirmed. A protected `401` clears local state without attempting a redundant logout request. The client never stores the session-version field separately.

## API contract

`POST /api/auth/logout` accepts no request body and requires `Authorization: Bearer <jwt>`.

- `200` — `{ "message": "Signed out successfully" }` after the MongoDB update succeeds.
- `401` — missing, invalid, expired, revoked or stale token; concurrent sign-out.
- `500` — unexpected database failure, returned through the existing safe error handler.

`GET /api/auth/me` and all other protected routes now use the same live account check. The existing login and registration request/response shapes and public API routes remain unchanged.

## Security and operational trade-offs

- **All devices:** Signing out invalidates all sessions for the account. Per-device logout would require a separate session store and is outside this issue.
- **Database cost:** Each protected request now performs a MongoDB user lookup. MongoDB availability is required; errors are not interpreted as valid sessions.
- **Existing accounts:** MongoDB documents without `sessionVersion` are treated as version zero, and logout atomically creates/increments the field. No destructive migration is required.
- **Existing tokens:** JWTs issued before this release lack `sessionVersion` and are rejected. Users must sign in again after deployment.
- **Offline logout:** Removing a local token does not revoke a copied token when the API cannot confirm logout. A token remains usable until its normal expiry if the remote update did not succeed.
- **Request timing:** A request already authorised before a concurrent logout may finish. New protected requests recheck the current database version.
- **Privacy:** The version is not returned in public user responses. No password, token, signing secret or connection string is logged.

## Automated verification

Backend tests in `api/test/sessionRevocation.test.js` cover JWT claims, legacy accounts, deleted users, stale roles, server revocation across tokens, concurrent logout and database failures. The existing auth middleware suite is retained and adapted for asynchronous checks. Frontend tests in `client/src/test/logout.test.jsx` cover successful logout, API failure and revoked-session handling.

Run from the repository root:

```bash
npm --prefix api test
npm --prefix api run test:coverage
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

The end-to-end Postman/Newman logout and session-replay cases will be added by the team in the dedicated Part 3 API security testing milestone.
