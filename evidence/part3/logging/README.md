# P3-08 logging and monitoring evidence

Evidence that HustleHub+ structured events (P3-07) reach Grafana Cloud Logs, can be queried and visualised, and contain no sensitive data. Setup, queries and privacy rules are in [`docs/monitoring/grafana-cloud.md`](../../../docs/monitoring/grafana-cloud.md).

All screenshots come from one local run on 5 November 2026: API started with the Grafana Cloud transport enabled, then the full Postman collection run through Newman. Times in Grafana are SAST (UTC+2); timestamps inside the JSON are UTC.

| File | What it shows | Interpretation |
|---|---|---|
| `newman-with-grafana-enabled.png` | Full Newman run with log shipping enabled: 115 requests, 284 assertions, 0 failed | Cloud log delivery does not change API behaviour. Bookings, authentication and rate limiting behave the same as without telemetry. |
| `dashboard-overview.png` | The imported `HustleHub+ API Monitoring` dashboard over the run window | Login outcomes, failed logins by status (400 validation, 401 bad credentials, 429 rate limited), booking outcomes, three committed transactions (one per full run; replays never add one), rate-limited requests for both login and booking, and API errors by type (`SyntaxError` 400 for malformed JSON, `OtherError` 413 for an oversized body). |
| `explore-auth-login-failure.png` | An `auth.login` failure with status 429 expanded in Explore | A blocked brute-force attempt is visible as a structured event. Indexed labels are only `env`, `level`, `service` and `service_name`; request fields stay inside the JSON line. |
| `explore-transaction-commit.png` | A `transaction.commit` success (201) expanded in Explore | Committed simulated transactions are observable without logging amounts, users or gig details. |
| `explore-request-correlation.png` | Query by one `requestId` returning `booking.create` and `transaction.commit` | A single booking request can be traced end to end through its server-generated request ID, with no personal data needed. |
| `privacy-check-no-results.png` | Regex search for passwords, bearer tokens, JWTs, MongoDB connection strings and email addresses: "No logs found" | No shipped log line contains those patterns. Every line is built from the allowlisted event schema only. |

## Privacy notes

- Shipped fields are limited to `event`, `outcome`, `level`, `message`, `requestId`, `method`, `statusCode`, `phase`, `errorType`, `service` and `timestamp`.
- Only Winston events are shipped. Other process output, such as Node or Mongoose warnings, stays on the local console.
- The Grafana Cloud token is write-only (`logs:write`), is kept only in the local `api/.env` and is never committed. Screenshots are cropped to the dashboard and Explore views and show no credentials.
- Free-tier retention is 14 days, so the cloud copy of these test logs expires automatically.
