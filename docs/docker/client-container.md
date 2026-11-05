# HustleHub+ frontend container (P3-10)

## Scope and source

P3-10 packages the existing React 19 / React Router 8 / Vite 8 client into a production static web image. Its original assignment was Mark; James implemented the Docker work. No React screens, protected routes, API controllers, MongoDB logic or Compose files are changed.

Source baseline: `dev` at `07e03d24aed692210b41a8f4d3cad4bc67ed0661`, containing the completed P3-09 API container. The design follows the INSY7314 Module Manual, Learning Unit 5 (Docker), and the Part 3 POE rubric, which requires both images to work with Docker Compose and CI in later issues.

**Responsibility boundaries:** P3-10 builds and serves the frontend. P3-11 connects the frontend and API with Compose and a defined browser-facing TLS strategy. P3-16 runs both images in CI. Do not treat an independent frontend HTTP smoke test as proof that authenticated API operations work across containers.

## Architecture

```text
Build stage (Node.js 24)                Runtime stage (unprivileged Nginx)
----------------------------            ----------------------------------
package-lock.json -> npm ci            dist/index.html + hashed /assets/
VITE_API_URL (public build arg)          port 8080 (HTTP inside container)
React + Vite -> dist/                    SPA fallback -> /index.html
                                        root HTML health probe
                                        no Node.js, source, or secrets
```

- `client/Dockerfile` uses `node:24-bookworm-slim` to build the current Vite/React Router dependencies. The runtime image is `nginxinc/nginx-unprivileged:stable-alpine`, which runs Nginx without root privileges and listens on port `8080`.
- `npm ci` uses the committed `client/package-lock.json`. Build-only dependencies, source files and `npm` are not copied into the runtime image.
- `client/.dockerignore` uses a deny-by-default build context. It includes the Vite inputs and excludes local environment files, package installations, test files, coverage and documentation.
- `client/docker/validate-build-url.mjs` refuses to build without a valid public API origin. It accepts HTTPS origins and HTTP origins only for `localhost`, `127.0.0.1` or `[::1]`, matching the existing API client's trust policy. Paths, credentials, queries and fragments are not allowed.
- `client/nginx/default.conf` serves the compiled SPA. Direct visits to `/login`, `/bookings`, `/freelancer/dashboard` and `/admin` load the React entry point on refresh. React still applies its existing authentication and role-based route guards.
- Missing files in `/assets/` return `404` instead of an HTML fallback. Vite's fingerprinted assets can be cached, while the main HTML entry point requests revalidation. Basic clickjacking, MIME-sniffing and referrer headers are applied without imposing an incompatible CSP for a separately hosted API.
- Docker probes `GET /` locally. The health check proves Nginx serves the built frontend; it **does not** prove the API or MongoDB is healthy.

## Build-time API address and TLS

Vite embeds `import.meta.env.VITE_API_URL` into generated JavaScript **during `npm run build`**. Setting `VITE_API_URL` via `docker run -e` later does not change the frontend bundle. Rebuild the image for a different public API origin.

The API URL must be what the **user's browser** can reach. Never use `http://api:4000` in the Vite build merely because an API container uses the Compose service name `api`. That DNS name is normally visible only to other containers, not to the browser.

| Environment | Frontend browser origin | `VITE_API_URL` build argument | API `CLIENT_ORIGIN` |
|---|---|---|---|
| Local Docker API over loopback HTTP | `http://localhost:5173` | `http://localhost:4000` | `http://localhost:5173` |
| Existing native HTTPS API | `http://localhost:5173` | `https://localhost:4000` | `http://localhost:5173` |
| Deployed TLS-terminated sites (example) | `https://app.example.com` | `https://api.example.com` | `https://app.example.com` |

The deployed hostnames above are examples, not provisioned services. When a public HTTPS frontend loads, its API must also use HTTPS to avoid mixed-content failures. Never put `MONGO_URI`, `JWT_SECRET`, passwords, Grafana tokens or other secrets into Vite variables or Docker build arguments. Public API addresses are visible in client JavaScript and potentially image build metadata.

## Run tests

From the repository root:

```bash
cd ~/Documents/GitHub/INSY7314POE

# Unit-check the new container configuration and URL policy.
node --test client/docker/containerConfig.check.mjs

# Preserve normal application behaviour and styling.
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

The existing Vitest configuration writes a JUnit XML report under `evidence/part2/frontend-tests/`. If running tests modified that tracked report as a by-product, restore **only that generated file** before the PR:

```bash
git restore evidence/part2/frontend-tests/react-tests.xml
```

Do not use Docker as a replacement for the normal React test suite.

## Build the image

Ensure Docker Desktop is running. Stop Vite if it occupies port `5173`.

```bash
cd ~/Documents/GitHub/INSY7314POE
docker info

docker build --pull \
  --build-arg VITE_API_URL=http://localhost:4000 \
  -f client/Dockerfile \
  -t hustlehub-client:p3-10 \
  client
```

This local example assumes the P3-09 API is serving **HTTP** at `127.0.0.1:4000`. If testing against the original native HTTPS API instead, build using `--build-arg VITE_API_URL=https://localhost:4000` and ensure the browser trusts the certificate. You do not need to run the API just to verify frontend static route serving.

Check the Nginx configuration and runtime identity:

```bash
docker run --rm --entrypoint nginx hustlehub-client:p3-10 -t
docker run --rm --entrypoint id hustlehub-client:p3-10 -u
```

The Nginx image should report a non-zero UID.

## Standalone frontend smoke test

Run the image with the container's `8080` port published only on the Mac's loopback interface:

```bash
docker run -d \
  --name hustlehub-client-p3-10 \
  -p 127.0.0.1:5173:8080 \
  hustlehub-client:p3-10
```

Check health, headers, SPA routes and unavailable assets:

```bash
curl --fail --silent --show-error http://127.0.0.1:5173/ -o /dev/null

for route in login bookings freelancer/dashboard admin; do
  curl --silent --show-error -o /dev/null -w "${route}: %{http_code} %{content_type}\n" \
    "http://127.0.0.1:5173/${route}"
done

curl --silent --show-error -o /dev/null -w 'missing asset: %{http_code}\n' \
  http://127.0.0.1:5173/assets/not-found.js

docker inspect --format '{{.State.Health.Status}}' hustlehub-client-p3-10
docker logs --tail 20 hustlehub-client-p3-10
```

Expected: the SPA routes respond with `200 text/html`, the nonexistent asset responds with `404`, and Docker health changes from `starting` to `healthy`. Load `http://localhost:5173/login` in the browser. An anonymous visitor to `/bookings` should still be sent to `/login` by the existing React route guard, even though Nginx itself returned the SPA HTML successfully.

Cleanup:

```bash
docker stop hustlehub-client-p3-10
docker rm hustlehub-client-p3-10
```

## Optional browser-to-API local check

If also running the API from P3-09 for a **temporary, local** full-stack check, use its documented `docker run` command with `USE_HTTPS=false`, `CLIENT_ORIGIN=http://localhost:5173` and port mapping `127.0.0.1:4000:4000`. The frontend image must have been built with `VITE_API_URL=http://localhost:4000` for this pairing. The Atlas IP allowlist and the API `.env` must already be valid. Check the gig listing and `/login` page manually. P3-11 will formalise this setup with Compose and TLS decisions.

The backend's HTTP port and this frontend HTTP port are published only to localhost for smoke testing. This does **not** constitute a public production TLS deployment.

## Troubleshooting

| Symptom | Cause to check | Action |
|---|---|---|
| `npm ci` fails while building | Docker network/registry or mismatched lockfile | Keep `client/package-lock.json` committed; do not replace `npm ci` with an unlocked install |
| Build reports missing `VITE_API_URL` | Required build argument omitted | Rebuild with `--build-arg VITE_API_URL=...` |
| API URL error in browser | Wrong build-time origin | Rebuild; do not set only a runtime environment variable |
| Frontend works at `/` but refresh at `/bookings` returns 404 | Nginx SPA fallback missing | Confirm `nginx/default.conf` was included and loaded |
| Browser cannot reach API | API stopped, wrong scheme, untrusted HTTPS cert or CORS mismatch | Match `VITE_API_URL` to browser-visible API origin and set API `CLIENT_ORIGIN` to frontend origin |
| Container health is `starting` | First probe not completed | Check again after startup; inspect `docker logs` if `unhealthy` |
| `5173` port conflict | Vite or prior container still running | Stop the other process; keep stable browser origin |
| Docker build contains private config | Incorrect build context | Use `client/` as context and retain the deny-by-default `.dockerignore` |

## References

- IIE, *INSY7314 Module Manual*, Learning Unit 5, Theme 4 (Docker); Part 3 POE Docker requirement and rubric.
- [Vite: Environment Variables and Modes](https://vite.dev/guide/env-and-mode).
- [NGINX Unprivileged Docker Image](https://github.com/nginx/docker-nginx-unprivileged).
- [Docker build variables](https://docs.docker.com/build/building/variables/).
