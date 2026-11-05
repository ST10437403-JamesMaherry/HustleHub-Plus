# Booking request replay protection

HustleHub+ uses a per-client idempotency key to prevent duplicate simulated booking and transaction records when a booking request is repeated. This is the second additional Part 3 security control. Booking amounts, ownership and payment outcomes remain server-derived; no real payments are processed.

## Contract

`POST /api/bookings` requires a verified **client** JWT, JSON body containing only `gigId`, and an `Idempotency-Key` HTTP header containing a UUID v4. The key is generated with browser cryptographic randomness and reused for an explicit retry of the same booking attempt. New purchase attempts use new keys.

```http
POST /api/bookings HTTP/1.1
Authorization: Bearer <client-jwt>
Content-Type: application/json
Idempotency-Key: 123e4567-e89b-42d3-a456-426614174000

{"gigId":"507f1f77bcf86cd799439011"}
```

| Result | HTTP status | Behaviour |
|---|---|---|
| First successful request | `201` | Creates one confirmed booking and one simulated transaction; `replayed: false` |
| Same client, same key and gig | `200` | Returns the original booking and transaction; `replayed: true` |
| Same client and key, different gig | `409` | Rejects conflicting key reuse without writing records |
| Missing/malformed key or booking body | `400` | Rejects before database writes |
| Unavailable gig for an unused key | `404` | Does not create a booking |
| Exceeded booking rate limit | `429` | Existing booking limiter still applies to all requests |

A successful replay returns the **original price and ownership snapshot**, even if the gig has been edited or deleted. The API does not expose internal request keys in booking responses. Keys are scoped by authenticated client ID; another client can independently use the same key without accessing the first client's records.

## Database enforcement

`api/models/Booking.js` defines a unique compound index on `{ client: 1, requestKey: 1 }`. The partial filter includes only documents with a string `requestKey`, preserving existing Part 2 bookings without a key. `api/config/db.js` awaits `Booking.createIndexes()` before the API starts listening, so the replay guard never runs before the database constraint is ready. MongoDB database credentials need permission to create indexes during initial setup.

Booking creation continues using `session.withTransaction()`. The booking and its associated simulated transaction are written in the same session; partial results are not accepted. If simultaneous requests compete for one unique index entry, the losing request looks up the committed winner and returns the original result (`200`) or a payload conflict (`409`). A transaction that fails before commit must not persist either record.

The original `Transaction.booking` unique index remains in place. Neither the booking amount nor the client/freelancer IDs are accepted from the caller.

## Frontend behaviour

`BookGigAction.jsx` keeps the generated key in a component ref for a single booking attempt. A user-triggered retry after a definite API rejection retains the key. Cancelling a pending confirmation begins a new attempt with a fresh key. An ambiguous network failure does **not** trigger an automatic retry: the UI instructs the client to inspect **My bookings** before trying again. Navigation or a tab reload may lose the component key; checking history is therefore necessary before initiating another purchase.

`client/src/services/api.js` restricts `Idempotency-Key` to `POST /api/bookings`. `api/index.js` allows that header in browser CORS preflights. API rate limiting and JWT/role checks continue to run before booking validation.

## Verification and handoff

- `npm --prefix api test` covers key validation, uniqueness, same-key replay, conflicts, client isolation, concurrent submissions and staged rollback using deterministic database doubles.
- `npm --prefix client test` covers request headers, stable retries, independent attempts and ambiguous failures.
- Unit doubles **do not prove live MongoDB transaction isolation or index enforcement**. Verify real concurrent requests and rollback against a transaction-capable MongoDB replica set in the Part 3 container/integration milestone.
- **Mark (P3-12)** must add UUID v4 `Idempotency-Key` headers to every existing Postman booking `POST`, including negative/rate-limit cases that must reach booking logic; extend transaction-count and conflict assertions.
- **Ewald (P3-13)** owns replay abuse, invalid header, cross-client and concurrent-request security cases in the separate Part 3 Postman collection.
- The old Part 2 Postman collection will reject booking requests without the new header. Update the relevant test definitions before merging this API contract into `dev`; run comprehensive Newman suites at the planned integrated milestone, not after every change.

## Residual limitations

A deliberate purchase with a new valid key is a separate booking and is permitted. The key protects **retries of the same logical request**, not all intentionally repeated purchases. The existing booking limiter reduces abuse but is not a payment-fraud detector. The index is not configured with a TTL because booking records are retained as part of the financial audit history.

## References

- [Mongoose — Indexes](https://mongoosejs.com/docs/production/indexes.html)
- [Mongoose — Model.createIndexes](https://mongoosejs.com/docs/api/model.html#Model.createIndexes())
- [MongoDB — Create an index](https://www.mongodb.com/docs/manual/core/indexes/create-index/)
- [MDN — Crypto.getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)
