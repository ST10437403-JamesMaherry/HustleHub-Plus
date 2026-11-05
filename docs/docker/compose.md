# HustleHub+ full-stack Docker Compose (P3-11)

## Scope and source

P3-11 assembles the existing API image (P3-09) and React/Nginx image (P3-10) without modifying any authentication, financial or React application code. The source baseline is the `dev` merge of P3-10, commit `60a41d6ce61736918bf769abcb6f39fabcfe34f2`. This implementation follows the INSY7314 Module Manual, Learning Unit 5, Docker Compose section (around pages 147-150), and the Part 3 POE containerisation criteria (both containers working with Compose and CI).

This issue supplies two execution paths:

- `compose.yaml`: local, Atlas-connected frontend and API with HTTPS on the API boundary.
- `compose.ci.yaml`: an explicit, isolated overlay for repeatable integration tests using a disposable MongoDB replica set.

CI orchestration in GitHub Actions remains P3-16. The security and functional Postman suites are run at their own assessment milestones, not after every Compose change.

## Local architecture

```text
Browser: http://localhost:5173         Browser: https://localhost:4000
            |                                        |
            v                                        v
   Client (Nginx, port 8080)           API (Express HTTPS, port 4000)
     non-root static server                 non-root Node.js
            |                                        |
            +-- VITE_API_URL ------------------------+
                                                     |
                                            MongoDB Atlas (TLS)
                                                     |
                                            Structured JSON logs
                                            Grafana Cloud (optional)

TLS init (one-shot Alpine/openssl) -> named certificate volume -> API (read-only)
```

The frontend browser origin is **`http://localhost:5173`**. Its built-in public API URL is **`https://localhost:4000`**, and the API CORS `CLIENT_ORIGIN` is **`http://localhost:5173`**. These addresses are intentional. A browser cannot resolve Docker's private service hostname `api`, and React/Vite embeds `VITE_API_URL` when the image is built. The API certificate is self-signed for local development; browsers must trust its public certificate before authenticated functionality can work. Do not use this certificate in a public deployment.

For local safety, only `127.0.0.1` host ports are published. Both containers retain their non-root runtime images and existing Dockerfile health checks. The client waits until the API health check passes, and the API waits for the local TLS initializer to exit successfully. MongoDB Atlas remains external; no database is created by the ordinary `compose.yaml`.

## Requirements

- Docker Desktop with Compose v2 or later, running on your Mac.
- An Atlas database with the current public egress IP on the Atlas IP access list.
- Valid backend `MONGO_URI` and `JWT_SECRET` values (already used in the ignored `api/.env`).
- Available local ports `4000` and `5173`; stop native API/Vite processes and old P3-09/P3-10 smoke containers first.
- Node.js 22+ for the new configuration/smoke-test scripts (the project uses Node.js 24 locally).
- OpenSSL installed on the host for generating a short-lived CI JWT secret; macOS includes it.

Docker must have network access to install Alpine OpenSSL on first run and to download container images. A generated local private key is stored **only in the named Docker volume** `tls_certs` and made readable only to the API's UID 1000. Neither Docker image contains a private key or database credentials.

## 1. Configure the environment

From the repository root:

```bash
cd ~/Documents/GitHub/INSY7314POE

# Create the ignored Compose environment file once.
if [ ! -f .env ]; then cp .env.example .env; fi

# Open it locally and set MONGO_URI and JWT_SECRET from your existing api/.env.
open -e .env
```

Keep the browser settings in the root `.env` as:

```dotenv
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=https://localhost:4000
```

The public frontend API URL is not a secret. `MONGO_URI`, `JWT_SECRET` and optional `GRAFANA_LOKI_TOKEN` are secrets and belong **only in the ignored `.env`**, not `.env.example`, Git history, screenshots, Docker build args or documentation. A Compose build does not need MongoDB credentials; they are injected into the running API environment.

**Important:** Compose reads **repository-root** `.env`; it does not automatically load `api/.env`. The existing native Node development setup can continue using `api/.env` independently. The example deliberately contains blank secrets and cannot start a working authenticated Atlas deployment until populated.

## 2. Start the Atlas-connected stack

```bash
cd ~/Documents/GitHub/INSY7314POE

docker info

# Quiet mode validates Compose without printing substituted credentials.
docker compose config --quiet

docker compose up --build -d --wait

docker compose ps
```

The first run pulls Alpine, builds the API and client images, provisions a **local** HTTPS certificate, connects to Atlas, creates the booking replay-protection index if necessary, and waits for both application services to become healthy. The frontend does not start successfully until the API can serve `/health`.

Verify from the Mac:

```bash
mkdir -p api/certs

# Export only the public certificate from the running container.
docker compose cp \
  api:/app/certs/localhost-cert.pem \
  api/certs/compose-localhost-cert.pem

curl --fail --silent --show-error \
  --cacert api/certs/compose-localhost-cert.pem \
  https://localhost:4000/health

curl --fail --silent --show-error \
  -o /dev/null \
  -w 'Frontend HTTP %{http_code}\n' \
  http://localhost:5173/login

docker compose exec -T api node docker/healthcheck.js

docker compose ps
```

Expected: JSON with `"status":"OK"` and `"protocol":"HTTPS"`, frontend HTTP `200`, and both application containers `healthy`. The one-shot `tls-init` service is expected to show `Exited (0)`.

### Trust the local browser certificate

`curl --cacert` proves the API certificate chain without weakening TLS checks. The browser has a **separate** certificate trust store. Open the exported public certificate in Keychain Access on macOS, verify it belongs to this local `localhost` setup, and explicitly trust it for local testing. Restart the browser if needed; visit `https://localhost:4000/health` directly to verify the secure connection. Never disable browser or Node TLS verification globally, and never import or share the private key.

Then open `http://localhost:5173`. The API connection indicator should say **Connected to HustleHub+**. Browse gigs, log in and verify a protected page. For repeatable booking/transaction tests, use the disposable CI setup below instead of creating test data in the assessment Atlas database.

The generated local certificate is valid for one year. If you intentionally delete the named TLS volume, a new certificate will be generated and must be trusted again. `docker compose down` **without** `--volumes` preserves it.

## 3. Isolated CI integration database

The Compose overlay is an additional configuration file that must **never** be used as a production database. It adds a MongoDB 8 service with a **single-node replica set** and a one-shot `mongo-init` service. A plain standalone MongoDB container does not support the booking controller's `session.withTransaction()`; waiting for the replica set to become a writable primary is required for deterministic tests.

The overlay replaces the Atlas `MONGO_URI` with `mongodb://mongo:27017/hustlehub_ci?replicaSet=rs0`, overrides the JWT secret with a randomly generated throwaway value and disables outbound Grafana delivery. MongoDB has **no published host port**. Use a distinct Compose project name so the CI certificate volume and database state do not overlap with the normal Atlas-backed setup.

Stop the default stack first to free ports 4000 and 5173:

```bash
cd ~/Documents/GitHub/INSY7314POE

docker compose down

# Generate a temporary signing secret in this shell session.
export CI_JWT_SECRET="$(openssl rand -hex 32)"

# Verify the merged configuration without disclosing the JWT secret.
docker compose -p hustlehub-ci \
  -f compose.yaml -f compose.ci.yaml \
  config --quiet

# Build and start the isolated integration stack.
docker compose -p hustlehub-ci \
  -f compose.yaml -f compose.ci.yaml \
  up --build -d --wait

docker compose -p hustlehub-ci \
  -f compose.yaml -f compose.ci.yaml \
  ps
```

Extract its public certificate and execute the guarded smoke test:

```bash
mkdir -p api/certs

docker compose -p hustlehub-ci \
  -f compose.yaml -f compose.ci.yaml \
  cp api:/app/certs/localhost-cert.pem \
  api/certs/compose-ci-localhost-cert.pem

node scripts/compose-smoke.mjs
```

The smoke script refuses to create accounts or bookings unless it can verify the running API has `COMPOSE_CI_FIXTURE=true`, the exact isolated replica-set URI and a properly configured throwaway JWT secret. It then checks:

1. HTTPS API health and allowed browser CORS origin.
2. Nginx SPA routes (`/login`, `/bookings`, `/freelancer/dashboard`, `/admin`) and a missing asset's HTTP 404 response.
3. Real client/freelancer account registration and JWT login.
4. Authenticated gig creation.
5. Booking plus transaction creation with matching confirmed amounts.
6. Replaying the same `Idempotency-Key` without duplicating the booking or transaction.
7. Freelancer confirmed income of the single disposable booking.

The test creates **disposable** records only in the overlay's MongoDB container. It does not contact Atlas, does not print credentials or tokens, and does not require an administrator account. A successful run ends with `P3-11 disposable Compose integration smoke test: PASSED`.

Cleanup **only the CI project** and its disposable database volume:

```bash
docker compose -p hustlehub-ci \
  -f compose.yaml -f compose.ci.yaml \
  down --volumes --remove-orphans

unset CI_JWT_SECRET
```

The `--volumes` flag is intentional **only for disposable CI**. Do not add it to the normal Atlas stack shutdown unless you want to invalidate the local certificate trust.

## 4. Configuration tests and normal application tests

```bash
cd ~/Documents/GitHub/INSY7314POE

node --test scripts/composeConfig.test.mjs
npm --prefix api test
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

The existing Vite/Vitest configuration may update `evidence/part2/frontend-tests/react-tests.xml`. Restore only that generated report if it changed incidentally:

```bash
git restore evidence/part2/frontend-tests/react-tests.xml
```

A successful `docker compose up --build`, healthy `api` and `client` services, a verified HTTPS health response and passing disposable booking workflow supply the working-container evidence requested in the POE. P3-16 will run the same isolated setup within GitHub Actions as part of the assessment CI pipeline.

## 5. Operational notes and troubleshooting

| Problem | Check | Action |
|---|---|---|
| API exits during `database.ready` | Atlas IP allowlist and root `.env` URI | Add only your current public IP in Atlas; keep credentials outside Git |
| API health stays unhealthy | `docker compose logs api`, TLS certificate files, Atlas status | Confirm `tls-init` exited 0 and the database is reachable |
| `tls-init` fails on first run | Docker image network/Alpine package repository | Verify Docker network access; retry with `docker compose up --build` |
| `curl` reports untrusted certificate | Local self-signed CA not provided to curl | Use `--cacert api/certs/compose-localhost-cert.pem`, not `-k` |
| Browser reports `Connection unavailable` | Browser certificate trust, API startup or CORS mismatch | Open the HTTPS API health URL first, trust local public certificate and retry |
| Frontend JavaScript points to wrong API | Vite build-time address | Set `VITE_API_URL` in root `.env` and run `docker compose up --build` |
| CI booking fails with transaction error | MongoDB not writable as replica-set primary | Inspect `docker compose -p hustlehub-ci -f compose.yaml -f compose.ci.yaml logs mongo-init` |
| CI smoke refuses to run | Overlay not active or wrong API instance | Start the `hustlehub-ci` project with both Compose files; do not bypass the guard |
| Ports are already in use | Existing Vite/API or Docker container | Stop native processes and previous containers before starting Compose |
| `docker compose config` would expose secrets | Normal output prints environment values | Use `docker compose config --quiet` and never paste raw `.env` contents |

### Shutdown

For ordinary Atlas-connected local Compose:

```bash
docker compose down
```

This stops the application without removing the certificate volume. A production deployment needs trusted public TLS certificates and an appropriate public ingress design; this local self-signed setup is intended for development, review and CI only.

## Evidence to capture

Capture redacted screenshots or saved test output showing `docker compose ps` with **healthy** API/client services, `curl --cacert` returning HTTPS health JSON, the client UI showing API connected, and the passing disposable booking/transaction smoke test. Never capture `.env`, `docker compose config` without `--quiet`, JWTs or Atlas credentials. The final README and CI screenshots are completed in the relevant later issues.

## References

- IIE, *INSY7314 Module Manual*, Learning Unit 5, Docker Compose practice and Exercise 10.5 (pp. 147-151).
- IIE, *INSY7314 POE*, Part 3 containerisation requirements and top-band Docker rubric.
- [Docker Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/).
- [Docker Compose environment variables](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
- [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).
