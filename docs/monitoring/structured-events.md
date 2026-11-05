# Structured Application Events (P3-07)

## Purpose

HustleHub+ emits one JSON event per line using Winston's console transport. The application logs successful and failed authentication requests, booking outcomes, committed simulated transactions, unexpected errors and database/server readiness. These records are intended for operational monitoring and security review rather than financial bookkeeping.

MongoDB remains the authoritative store for bookings and simulated transactions. Log delivery is **best effort** and is never part of the booking transaction.

## Event contract

| Event | Trigger | Outcome values |
|---|---|---|
| `auth.login` | Completed `POST /api/auth/login`, including validation and limiter rejections | `success`, `failure` |
| `auth.logout` | Completed `POST /api/auth/logout` | `success`, `failure` |
| `booking.create` | Completed `POST /api/bookings`, including input errors and rate limits | `success`, `replayed`, `conflict`, `failure` |
| `transaction.commit` | A new booking and its simulated transaction both committed in MongoDB | `success` |
| `api.error` | Central Express error handler receives an exception | `failure` |
| `database.ready` | MongoDB connection and booking unique-index setup | `success`, `failure` |
| `app.start` | Server listener is ready or startup fails | `success`, `failure` |

Common fields: `timestamp` (UTC), `service`, `level`, `message`, `event`, `outcome`. Request-scoped events also contain a server-generated `requestId`, `method` and `statusCode`. Startup events can include a fixed `phase`. Errors contain only a bounded `errorType` such as `TypeError` or `OtherError`.

Example record (illustrative, not a real production event):

```json
{"level":"info","message":"booking.create","event":"booking.create","outcome":"success","requestId":"123e4567-e89b-42d3-a456-426614174000","method":"POST","statusCode":201,"service":"hustlehub-api","timestamp":"2026-11-05T10:00:00.000Z"}
```

A booking returning HTTP 200 for an idempotent replay has outcome `replayed`. It never emits another `transaction.commit` event. A rolled-back transaction emits no committed transaction event. In the unlikely event of process termination after a successful commit but before a log is written, the database record still exists and the audit stream may be incomplete.

## Privacy and security

- All event names, outcomes and optional fields are allowlisted in `api/utils/logger.js`.
- Raw errors, stack traces, query strings, incoming request IDs, IP addresses, email addresses, passwords, tokens, request bodies and MongoDB connection strings are never passed to the logging transport.
- The server generates the request ID using `randomUUID()`; the response includes `X-Request-ID` for troubleshooting. Browser clients can read it through CORS.
- Logs are sent to stdout (and error-level events to stderr), making them available to Docker, the process manager and later Grafana Cloud collection.
- Failing to write a log does not change the API result or roll back a completed booking.
- Log events are not evidence of successful email delivery, payments or tax liabilities. Payments in HustleHub+ are simulated.

## Verification

From the repository root, after installing dependencies:

```bash
npm --prefix api test
npm --prefix api run test:coverage
node -e "const {logEvent} = require('./api/utils/logger'); logEvent('app.start', 'success', {phase: 'http'})"
```

The last command prints a single structured JSON line. Verify that all expected field names are present and that no secret values appear.

With the API running, successful and failed sign-ins and bookings produce corresponding `auth.login` and `booking.create` events. `transaction.commit` occurs only for a newly committed booking/transaction pair. Full HTTP/database integration and Postman evidence are covered by the later team testing milestone.

## P3-08 monitoring handoff

Setup, queries, dashboard and privacy checks are documented in `grafana-cloud.md`.

Ewald can configure a collector to ingest container stdout/stderr into Grafana Cloud without modifying the authentication or booking controllers. Useful filters are `event`, `outcome`, `level` and `requestId`.

The collector must use external secret configuration, preserve the raw JSON event structure, and avoid broad capture of unrelated process output that might contain sensitive debugging messages. Any evidence screenshots must omit secrets, tokens and personally identifiable fields. Cloud storage retention should be minimised and set according to the assessment environment.
