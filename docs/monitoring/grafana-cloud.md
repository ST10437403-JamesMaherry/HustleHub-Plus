# Grafana Cloud logging, monitoring and evidence (P3-08)

## Purpose and data flow

The P3-07 structured events (see `structured-events.md`) are also shipped to Grafana Cloud Logs (Loki) so that sign-ins, bookings, committed transactions and errors can be queried and charted.

```text
API request -> logEvent() -> Winston
                               |-> Console transport -> stdout / stderr (always on)
                               `-> Loki transport (opt-in, api/utils/lokiTransport.js) -> Grafana Cloud Logs
```

- Shipping is **best effort**. MongoDB remains the authoritative store for bookings and simulated transactions; a lost log line never changes an API result.
- Only Winston events are shipped. Other process output (for example Node or Mongoose deprecation warnings on stderr) is not shipped, because no collector tails stdout.
- With no `GRAFANA_*` variables set, the API behaves exactly as before and writes to stdout only.

## Grafana Cloud setup

1. Create a Grafana Cloud stack (free tier: 50 GB of logs per month, 14-day retention; a new stack starts with a 14-day trial and then drops to the free plan).
2. Open **Connections -> Data sources** and find the Loki data source named `grafanacloud-<stack>-logs`. The stack also contains `-alert-state-history` and `-usage-insights` Loki data sources; those are Grafana-internal and are not the target.
3. Note the numeric user ID from that data source. Use the **public** push host, `https://logs-prod-<NNN>.grafana.net`. The data source page may show an internal URL such as `https://logs-prod-<NNN>-local-nlb.internal.grafana.net`, which is not reachable from outside Grafana.
4. Open **Administration -> Cloud access policies** and create a dedicated policy with the single scope `logs:write`. Do not reuse the default `pdc-...` policy. Do not restrict the policy by IP address, because home connections change address.
5. Add a token to that policy with an expiry date and copy it once. It is the `GRAFANA_LOKI_TOKEN` secret.
6. Put the three variables below into the untracked `api/.env` (local runs) or the secret store described in the next section.
7. Start the API and perform a sign-in. Within about 10 seconds, `{service="hustlehub-api"}` in **Explore** should return events.

## Configuration contract for Docker/Compose and CI

| Variable | Secret | Example placeholder | Required |
|---|---|---|---|
| `GRAFANA_LOKI_URL` | No | `https://logs-prod-<NNN>.grafana.net` | Optional, but all three or none |
| `GRAFANA_LOKI_USER` | No | `<numeric-user-id>` | Optional, but all three or none |
| `GRAFANA_LOKI_TOKEN` | **Yes** | `<access-policy-token>` | Optional, but all three or none |

`GRAFANA_LOKI_URL` must be a bare HTTPS origin: no path, query string or embedded credentials. The transport appends `/loki/api/v1/push`. `GRAFANA_LOKI_USER` must be numeric.

Rules:

- Never bake these values into an image (`ENV`, `ARG`, copied `.env` files) and never commit them.
- Compose: supply them with `env_file` or `environment` pointing at a non-committed file, or with Compose secrets. Commit only a template containing placeholders.
- CI: store `GRAFANA_LOKI_TOKEN` as a repository secret. Do **not** set any `GRAFANA_*` variable in test or Newman jobs unless shipping CI traffic is intended; it would mix test events into the dashboards. If it is wanted, set `NODE_ENV` (the `env` label) to a distinct value such as `ci` so the traffic can be filtered out.
- Unit tests do not load dotenv, so `npm test` never ships even if `api/.env` contains Grafana values, unless the shell itself exports `GRAFANA_*`.

Behaviour when configuration is missing or invalid:

- None of the three set: stdout only, silent.
- Partial or invalid (non-HTTPS URL, URL with a path or credentials, non-numeric user, missing token): stdout only, plus one fixed warning on stderr that contains no values.
- Grafana unreachable or rejecting requests: batches are dropped (`clearOnError`), so memory stays bounded, and at most one line per minute is written to stderr: `Grafana Cloud log delivery failed (<code>).` Logging never throws into a request.
- Shutdown: the transport flushes pending events, so Ctrl+C or SIGTERM can take up to about 5 seconds. A container stop grace period of 10 seconds or more (the Docker default) is enough.

Labels contract (kept low-cardinality):

| Label | Value |
|---|---|
| `service` | `hustlehub-api` |
| `env` | `NODE_ENV`, or `development` when unset |
| `level` | Added automatically by `winston-loki` |

`requestId`, `event`, `outcome` and the other fields stay inside the JSON line and are extracted at query time. Because `level` is already a stream label, the JSON field `level` is parsed as `level_extracted`.

## Queries

Dashboard panels (LogQL, Loki data source):

| Panel | Query |
|---|---|
| Login outcomes over time | `sum by (outcome) (count_over_time({service="hustlehub-api"} \| json \| event="auth.login" [$__auto]))` |
| Failed logins by status code | `sum by (statusCode) (count_over_time({service="hustlehub-api"} \| json \| event="auth.login" \| outcome="failure" [$__auto]))` |
| Booking outcomes | `sum by (outcome) (count_over_time({service="hustlehub-api"} \| json \| event="booking.create" [$__auto]))` |
| Transactions committed | `sum(count_over_time({service="hustlehub-api"} \| json \| event="transaction.commit" [$__range]))` (instant query) |
| Rate-limited requests | `sum by (event) (count_over_time({service="hustlehub-api"} \| json \| statusCode="429" [$__auto]))` |
| API errors by type | `sum by (errorType, statusCode) (count_over_time({service="hustlehub-api"} \| json \| event="api.error" [$__auto]))` |
| Recent failures | `{service="hustlehub-api"} \| json \| outcome="failure"` |

The failed-login panel separates `400` (validation), `401` (bad credentials) and `429` (rate limited).

Useful ad-hoc queries in **Explore**:

```logql
{service="hustlehub-api"} | json | requestId="<uuid from X-Request-ID>"
{service="hustlehub-api"} | json | event="auth.login" | outcome="failure"
{service="hustlehub-api"} | json | statusCode="429"
{service="hustlehub-api"} | json | statusCode=~"5.."
{service="hustlehub-api", env="ci"}
```

## Dashboard

`grafana-dashboard.json` defines the "HustleHub+ API Monitoring" dashboard (uid `hustlehub-api-monitoring`, default range last hour, no auto refresh). To import it:

1. Open **Dashboards -> New -> Import** and upload the file.
2. When asked for the Loki data source, choose `grafanacloud-<stack>-logs`.
3. Generate traffic (sign-ins, bookings, a rate-limited burst) and set the time range to cover it.

The file contains no URLs, tokens or stack identifiers; the data source is supplied at import time.

## Privacy safeguards and verification

- Only allowlisted events, outcomes and fields reach the logger (`api/utils/logger.js`): `level`, `message`, `event`, `outcome`, `requestId`, `method`, `statusCode`, `phase`, `errorType`, `service`, `timestamp`.
- Never logged: passwords, tokens, request bodies, query strings, incoming request IDs, IP addresses, email addresses, raw errors or stack traces, and MongoDB connection strings. `requestId` is a random server-generated UUID and is not personal data.
- The Loki transport sends the same JSON line as stdout, so it cannot add fields.
- The access policy is write-only (`logs:write`) and the token has an expiry, so a leaked token cannot read the stored logs.
- Retention is 14 days on the free tier.

Verification query. It should return **no lines** after any amount of traffic:

```logql
{service="hustlehub-api"} |~ `(?i)(password|passwd|bearer|eyJ[a-zA-Z0-9_-]{10,}|mongodb(\+srv)?://|@[a-z0-9.-]+\.[a-z]{2,})`
```

It is valid RE2. The allowlisted field names and values contain none of the matched strings: no `@`, `password`, `passwd` or `bearer`, and UUID request IDs are hexadecimal with dashes, so they cannot form the `eyJ` prefix. A match means a new field leaked and the logger allowlist needs review.

Evidence screenshots must be redacted: crop out or blur the stack name, user ID, hostnames, tokens and any account details before submitting them.

## Failure behaviour and testing

- `api/test/lokiTransport.test.js` covers: unconfigured (silent stdout only), incomplete or unsafe settings (disabled with a value-free warning), valid settings (labels and bounded delivery) and an unreachable endpoint (events continue and the warning is rate-limited).
- Manual check: pointing the URL at an unreachable host produced the fixed delivery warning and no API errors.
- Full Newman suite with the transport configured: 115 requests and 284 assertions passed with 0 failures and no delivery failures.
- Not verified by automated tests: the dashboard import and the panels' rendering, which require a live Grafana Cloud stack.
