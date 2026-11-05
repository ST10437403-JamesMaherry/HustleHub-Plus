# HustleHub+ API container (P3-09)

## Purpose and scope

The API is packaged in a production-oriented, non-root Node.js container. The image includes the current Express routes, tax services, booking transaction logic, session revocation, idempotency protection, and structured logging from P3-01 to P3-08. It introduces **no new API endpoint** and does not change the native HTTPS development workflow.

This is the backend image only. P3-10 provides the frontend Dockerfile; P3-11 connects the services using Docker Compose; P3-16 builds and smoke-tests them in GitHub Actions.

The module manual's Docker learning unit (pp. 144-148) calls for a Dockerfile in `api/`, a `.dockerignore`, an Atlas-connected container, and secure runtime environment variables. The POE rubric (pp. 8-9, 16) also requires both frontend and backend containers, Compose orchestration, clear instructions, and working containers in CI. Those broader acceptance checks are completed by P3-11 and P3-16, not by this API-only issue.

## Architecture

```text
Host / browser
  | HTTPS (native development or TLS reverse proxy)
  v
Trusted TLS boundary  -- HTTP over private container network --> API (Node/Express :4000)
                                                             |
                                                             +--> MongoDB Atlas (TLS)
                                                             +--> Winston JSON stdout
                                                             +--> Grafana Cloud Loki (optional HTTPS)
```

- `api/Dockerfile` uses `node:22-bookworm-slim` for both dependency and runtime stages. Debian slim is used rather than Alpine to match the glibc runtime used by the native `bcrypt` package.
- `npm ci --omit=dev` installs exactly the locked production dependencies; Newman and other development tooling do not enter the runtime image.
- The `node` user runs the API; no root access is required by the application.
- `.dockerignore` is allowlist-based. Only the application entry point, runtime modules, lockfile and health probe are sent as build inputs. The Dockerfile also copies only those paths. Local `.env` files, certificates, tests, screenshots and dependency directories are not copied.
- `NODE_ENV=production`, `PORT=4000` and `USE_HTTPS=false` are **non-secret defaults**. Other values must be supplied at runtime.
- `GET /health` is served only after the startup MongoDB connection and booking unique index succeed. Health does not continuously re-check the MongoDB connection after startup; it is an HTTP liveness probe, not a full dependency readiness test.

## Build

From the repository root on macOS (Docker Desktop must be running):

```bash
cd ~/Documents/GitHub/INSY7314POE
docker info
docker build --pull -f api/Dockerfile -t hustlehub-api:p3-09 api
```

The build uses `api/` as its context, not the repository root. That keeps React, Postman and assessment evidence out of the build.

Verify the runtime identity and published port:

```bash
docker run --rm --entrypoint id hustlehub-api:p3-09 -u
docker image inspect hustlehub-api:p3-09 --format '{{json .Config.ExposedPorts}}'
```

The first command should return UID `1000` (the unprivileged `node` user); the second should contain `4000/tcp`. No MongoDB connection is needed just to build the image.

## Local smoke run with MongoDB Atlas

This temporary smoke run intentionally exposes plain HTTP **only on the Mac's loopback interface**. It must not be exposed to the public internet. Production deployments require HTTPS at a trusted reverse proxy/load balancer, or securely mounted TLS materials with `USE_HTTPS=true`.

The existing ignored `api/.env` must supply `MONGO_URI` and `JWT_SECRET`. The Atlas deployment must permit the machine's public egress IP. If native API port 4000 is already occupied, stop the native process first.

```bash
cd ~/Documents/GitHub/INSY7314POE

docker run -d \
  --name hustlehub-api-p3-09 \
  --env-file api/.env \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e USE_HTTPS=false \
  -e CLIENT_ORIGIN=http://localhost:5173 \
  -e GRAFANA_LOKI_URL= \
  -e GRAFANA_LOKI_USER= \
  -e GRAFANA_LOKI_TOKEN= \
  -p 127.0.0.1:4000:4000 \
  hustlehub-api:p3-09
```

The empty `GRAFANA_*` overrides prevent a local smoke test from sending artificial events to the existing Grafana Cloud dashboard. Remove those overrides only when explicitly testing P3-08 monitoring. Do not put JWT secrets, database credentials or Grafana tokens into `docker build --build-arg`, a Dockerfile `ENV` instruction, or commit them.

Once the API starts, verify the returned JSON and Docker health status:

```bash
# Give Atlas connection and index setup time to complete.
for attempt in $(seq 1 30); do
  health="$(docker inspect --format '{{.State.Health.Status}}' hustlehub-api-p3-09)"
  if [ "$health" = "healthy" ]; then break; fi
  if [ "$(docker inspect --format '{{.State.Running}}' hustlehub-api-p3-09)" != "true" ]; then break; fi
  sleep 2
done

curl --fail --silent --show-error http://127.0.0.1:4000/health
docker exec hustlehub-api-p3-09 node docker/healthcheck.js
docker inspect --format '{{.State.Health.Status}}' hustlehub-api-p3-09
docker logs --tail 15 hustlehub-api-p3-09
```

A successful health response contains `"status":"OK"` and `"protocol":"HTTP"`. Docker will first report `starting`, then `healthy` after a successful scheduled probe. The startup logs should include allowlisted `database.ready` and `app.start` events. If Atlas or the booking request-key index is unavailable, `api/index.js` intentionally refuses to start; Docker will show an exited container rather than falsely reporting a healthy API.

Clean up the temporary container:

```bash
docker stop hustlehub-api-p3-09
docker rm hustlehub-api-p3-09
```

## Runtime configuration contract

| Variable | Usage | Secret? |
|---|---|---|
| `MONGO_URI` | Cloud MongoDB connection string; required at startup | Yes |
| `JWT_SECRET` | JWT signing and verification; required for authentication | Yes |
| `PORT` | Internal HTTP/HTTPS port; default `4000` | No |
| `NODE_ENV` | Runtime mode and Loki environment label; default `production` | No |
| `USE_HTTPS` | `false` behind trusted HTTPS terminator; `true` with mounted key/cert | No |
| `CLIENT_ORIGIN` | Browser origin for CORS, e.g. `http://localhost:5173` during local smoke run | No |
| `SSL_KEY_PATH`, `SSL_CERT_PATH` | Existing API TLS paths, used only when `USE_HTTPS=true` | Private key file is secret |
| `HEALTHCHECK_CA_CERT_PATH` | Optional PEM CA certificate trusted by the internal HTTPS probe | No (public certificate) |
| `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN` | Optional, all-or-nothing Grafana Cloud delivery settings | Token is secret |
| `BCRYPT_SALT_ROUNDS`, `JWT_EXPIRES_IN` | Existing password and token configuration | No |

Use a secret manager or platform runtime secrets for a real deployment. A local `--env-file` is convenient for a demonstration, but container environment variables may be visible to users with Docker daemon access through `docker inspect`. Do not grant untrusted users Docker daemon access.

### HTTPS mode with mounted certificates

The original `api/index.js` still supports `USE_HTTPS=true`. For a container using HTTPS directly, **mount** (do not copy) the private key and certificate read-only and configure `SSL_KEY_PATH` and `SSL_CERT_PATH` as absolute paths inside the container. The files must be readable by the container's `node` user (UID 1000) without making private keys world-readable. If using a self-signed local certificate, set `HEALTHCHECK_CA_CERT_PATH` to the mounted public certificate so the health probe validates it. For CA-signed certificates, the health probe uses Node's system trust store when that setting is absent.

In P3-11, we will choose and document one browser-facing HTTPS strategy for the full API/frontend Compose deployment. The existing local non-container TLS and Postman certificate trust remain unchanged.

## Validation

Unit-test the new health probe and run the existing backend tests:

```bash
node --test api/test/containerHealth.test.js
npm --prefix api test
npm --prefix api run test:coverage
```

The Dockerfile itself is validated by the `docker build` command. The final cross-container booking/transaction test belongs to P3-11, the security Newman integration milestone to P3-13, and automated container smoke checks to P3-16.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Build fails on `COPY` | Incorrect build context | Use `docker build -f api/Dockerfile ... api` from repo root |
| `npm ci` fails | Lockfile does not match `package.json`, registry unavailable | Reconcile via the committed lockfile; do not use `npm install` inside the image |
| Container exits immediately | Missing `MONGO_URI`, Atlas unreachable, or index creation failure | Inspect `docker logs`; verify ignored `.env` and Atlas allowlist |
| `unhealthy` after startup | API not serving `/health`, mismatched `PORT`, TLS probe trust issue | Run `docker exec ... node docker/healthcheck.js`; inspect configuration |
| Native frontend cannot call Docker API | Native client still points to `https://localhost:4000` while smoke API is HTTP | Restore the native HTTPS API or wait for the P3-11 TLS integration; do not weaken the browser's HTTPS protections |
| Loki is silent | Grafana settings omitted/blank, intentionally for smoke testing | Use the existing P3-08 configuration when testing actual cloud logging |
| Local private key cannot be read | Certificate not mounted or unreadable by UID 1000 | Correct secret mount access; do not change the key to world-readable mode |

## References

- IIE, *INSY7314 Module Manual*, Learning Unit 5, Theme 4: Containerisation with Docker, pp. 144-148.
- IIE, *INSY7314 POE*, Part 3 requirements pp. 8-9 and Docker rubric p. 16.
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/).
- [Docker Node.js image variants](https://hub.docker.com/_/node/).
- [Docker's Node.js guide](https://docs.docker.com/guides/nodejs/).
