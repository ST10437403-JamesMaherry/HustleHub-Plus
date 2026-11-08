# HustleHub+

**INSY7314 Portfolio of Evidence: Part 3, DevSecOps, Monitoring and Finalisation**

HustleHub+ is a secure freelance marketplace built with MongoDB, Express, React and Node.js. Freelancers advertise services, clients browse and book those services, and administrators review users and bookings and remove gigs when necessary.

Part 2 extends the Part 1 authentication foundation into a working full-stack application. It adds persistent MongoDB storage, a React interface, role-based access control, gig management, bookings, simulated transactions, freelancer income and automated backend and frontend testing.

Part 3 adds an illustrative South African income-tax estimate to the freelancer dashboard, two new security features (server-side session revocation and booking replay protection), structured logging with Grafana Cloud monitoring, Docker images for the API and frontend, a GitHub Actions DevSecOps pipeline with SonarQube Cloud static analysis, and a final threat-to-control security review.

## Demonstration Video

**Part 3 demonstration:** *link to be added before submission.*

**Part 2 demonstration (retained):** [Watch on YouTube](https://youtu.be/laT6uWLJGro). It covers registration and login, freelancer gig creation and editing, client booking and history, transaction recording, freelancer income, administration, security controls and test evidence.

## Group Members

| Group Member | Student Number | GitHub Username |
|---|---|---|
| James Maherry | ST10437403 | [ST10437403-JamesMaherry](https://github.com/ST10437403-JamesMaherry) |
| Ewald Pagel | ST10257942 | [ST10257942](https://github.com/ST10257942) |
| Mark Mansvelt | ST10438365 | [ST10438365MarkMansvelt](https://github.com/ST10438365MarkMansvelt) |

## Contents

- [Implemented Features and Roles](#implemented-features-and-roles)
- [Part 3 Features](#part-3-features)
- [Architecture and Frontend Integration](#architecture-and-frontend-integration)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation and Configuration](#installation-and-configuration)
- [Running with Docker Compose](#running-with-docker-compose)
- [Administrator Account](#administrator-account)
- [API Endpoints](#api-endpoints)
- [Security Design](#security-design)
- [Security Review](#security-review)
- [Automated Testing](#automated-testing)
- [CI/CD and Static Analysis](#cicd-and-static-analysis)
- [Assessment Evidence Map](#assessment-evidence-map)
- [Screenshot Evidence](#screenshot-evidence)
- [Response Status Codes](#response-status-codes)
- [Group Contributions](#group-contributions)
- [References](#references)

## Implemented Features and Roles

| User | Available functionality | Access restrictions |
|---|---|---|
| Visitor | Browse active gigs; register as a client or freelancer; log in. | Booking, management, income and administration require authentication. |
| Client | Browse and search gigs, confirm bookings, and view their booking history. | Cannot manage freelancer gigs, access another client's bookings, or use administrator endpoints. |
| Freelancer | Create, view, edit, activate/deactivate and delete their own gigs; view their bookings and income. | Cannot manage another freelancer's gigs, create client bookings, or access another freelancer's income. |
| Administrator | View safe user information and platform bookings; remove gigs. | Administrator access requires a verified JWT and the administrator role. Public registration cannot grant this role. |

Bookings use simulated payments. No real payment processor or card details are required. Each successful booking creates a confirmed transaction associated with the booking, client and freelancer.

Income is calculated from confirmed transactions belonging to the authenticated freelancer. The stored booking amount is a snapshot of the server-side gig price at the time of booking. Updating or deleting a gig does not remove the existing booking and transaction history.

## Part 3 Features

### Freelancer income and illustrative tax

The freelancer dashboard shows lifetime income, year-to-date income for the South African tax year (1 March 2026 to 28 February 2027), a March to February monthly breakdown and an illustrative annual tax figure. The API annualises year-to-date confirmed income and applies the SARS 2027 tax brackets and rebates. The figure is a projection for illustration only: it is not tax advice or tax currently due, and platform revenue is not verified taxable income.

Methodology and SARS sources: [tax estimation](docs/finance/tax-estimation.md). Response fields: [income API contract](docs/finance/income-api-contract.md).

### Security feature 1: server-side session revocation

Signing out invalidates every JWT issued to the account, not only the copy held by the browser. Each token carries the account's session version, and every protected request compares it with the version stored in MongoDB. `POST /api/auth/logout` increments the version atomically. Deleted accounts and changed roles are rejected in the same check. [Design and trade-offs](docs/security/session-revocation.md).

### Security feature 2: booking replay protection

`POST /api/bookings` requires an `Idempotency-Key` header containing a UUID v4 that the browser generates for each booking attempt. Retrying with the same key returns the original booking (`200`, `replayed: true`) instead of creating a second booking and transaction. Reusing a key for a different gig returns `409`. A unique `{ client, requestKey }` index and a MongoDB transaction enforce this in the database. [Design and limits](docs/security/booking-idempotency.md).

### Structured logging and Grafana Cloud monitoring

The API writes one JSON event per security-relevant outcome (sign-in, sign-out, booking, committed transaction, errors and start-up) with a server-generated request ID. Fields are allowlisted, so passwords, tokens, email addresses, IP addresses and request bodies are never logged. When `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER` and `GRAFANA_LOKI_TOKEN` are set, events are also sent to Grafana Cloud Loki using a write-only token. Without them, logging stays on stdout.

[Event contract](docs/monitoring/structured-events.md), [Grafana setup, queries and privacy checks](docs/monitoring/grafana-cloud.md), [dashboard JSON](docs/monitoring/grafana-dashboard.json).

### Containers

The API and the frontend each have a Docker image that runs as a non-root user: Node.js serving HTTPS for the API, and Nginx serving the built React application. Docker Compose runs both, binds their ports to `127.0.0.1` only and keeps the local certificate in a named volume. See [Running with Docker Compose](#running-with-docker-compose).

### DevSecOps pipeline and static analysis

GitHub Actions runs unit tests with coverage, lint and build, dependency audits, Docker-based API, security and browser suites, and the SonarQube Cloud quality gate. A final `CI gate` job fails if any required job fails. See [CI/CD and Static Analysis](#cicd-and-static-analysis).

## Architecture and Frontend Integration

```mermaid
flowchart TB
    subgraph BROWSER["Browser boundary: untrusted client"]
        ACTORS["Client / Freelancer / Admin"]
        REACT["React / React Router"]
        SESSION["AuthContext / sessionStorage JWT"]
        ACTORS --> REACT
        REACT <--> SESSION
    end

    TOOLS["Postman CLI / Playwright / curl"]
    HTTPS{{"API boundary: HTTPS / TLS"}}

    subgraph HOST["Docker host: ports bound to 127.0.0.1"]
        NGINX["Client container: Nginx, non-root, built React app"]

        subgraph SERVER["API container: Node.js / Express, non-root"]
            HEADERS["Helmet / API CSP / restricted CORS"]
            BODY["JSON parsing: 10kb body limit"]
            ROUTES["Express route selection"]
            AUTH["Register / login: rate limits and input checks"]
            JWT["Protected routes: JWT verification and session-version check"]
            RBAC["Role authorisation"]
            INPUT["Route-specific limits, sanitisation and validation"]
            CTRL["Controllers: ownership and booking replay protection"]
            CREDENTIALS["bcrypt / JWT issuing / sign-out revocation"]
            INCOME["Income and illustrative tax"]
            MONGOOSE["Mongoose models, queries and transactions"]
            ERRORS["Controlled 404 and error handlers"]
            LOGGER["Structured event logger: allowlisted fields"]

            HEADERS --> BODY --> ROUTES
            ROUTES -->|"Registration / login"| AUTH
            ROUTES -->|"Protected routes"| JWT
            ROUTES -->|"Public gig reads"| CTRL
            AUTH --> CTRL
            JWT -->|"Account profile / sign-out"| CTRL
            JWT -->|"Role-restricted routes"| RBAC
            RBAC -->|"Where configured"| INPUT
            RBAC -->|"Reads and deletes"| CTRL
            INPUT --> CTRL
            CTRL --> CREDENTIALS
            CTRL --> INCOME --> MONGOOSE
            CTRL -->|"Other database operations"| MONGOOSE
            JWT -->|"Live user, role and session version"| MONGOOSE
            BODY -->|"Parsing errors"| ERRORS
            ROUTES -->|"Unmatched routes"| ERRORS
            CTRL -->|"Forwarded failures"| ERRORS
            ROUTES -.->|"Request outcomes"| LOGGER
            ERRORS -.-> LOGGER
        end
    end

    DBBOUNDARY{{"Database boundary: Atlas connection"}}
    subgraph DATA["Persistent data: MongoDB Atlas"]
        MONGO[("hustlehub database")]
    end

    LOGBOUNDARY{{"Log boundary: HTTPS, write-only token"}}
    subgraph MONITOR["Monitoring: Grafana Cloud"]
        LOKI["Loki logs and security dashboard"]
    end

    subgraph PIPE["Delivery pipeline: GitHub"]
        REPO["Repository: dev and pull requests"]
        GHA["GitHub Actions: tests, audit, Docker integration"]
        SONAR["SonarQube Cloud quality gate"]
        GATE["CI gate"]
        REPO --> GHA
        GHA --> SONAR
        GHA --> GATE
        SONAR --> GATE
    end

    REACT -->|"Loads the app"| NGINX
    REACT -->|"HTTPS API requests"| HTTPS
    TOOLS -->|"HTTPS API requests"| HTTPS
    HTTPS --> HEADERS
    MONGOOSE --> DBBOUNDARY --> MONGO
    LOGGER --> LOGBOUNDARY --> LOKI

    classDef default fill:#111111,stroke:#737373,color:#f5f5f5
    classDef boundary fill:#080808,stroke:#d4d4d4,stroke-width:2px,color:#ffffff
    class HTTPS,DBBOUNDARY,LOGBOUNDARY boundary
    style BROWSER fill:#0a0a0a,stroke:#525252,color:#f5f5f5
    style HOST fill:#050505,stroke:#3f3f3f,color:#f5f5f5
    style SERVER fill:#0a0a0a,stroke:#525252,color:#f5f5f5
    style DATA fill:#0a0a0a,stroke:#525252,color:#f5f5f5
    style MONITOR fill:#0a0a0a,stroke:#525252,color:#f5f5f5
    style PIPE fill:#0a0a0a,stroke:#525252,color:#f5f5f5
    linkStyle default stroke:#a3a3a3,color:#a3a3a3
```

The diagram groups the endpoint controls for readability. Their exact order is defined in each route file. For example, booking creation verifies the JWT and client role before applying the booking limiter and request validation.

### How React connects to the API

1. A React page or component collects user input and displays validation feedback.
2. `AuthContext` manages login, logout and authenticated requests. It restores a saved session by checking `/api/auth/me` with the API.
3. `client/src/services/api.js` builds requests against `VITE_API_URL`. Protected requests include `Authorization: Bearer <token>`; public requests omit the token.
4. Express routes apply authentication, authorisation and input controls before the appropriate controller accesses MongoDB through Mongoose.
5. The API returns JSON. React updates its state to show data, confirmation, loading feedback or a controlled error message.

The React interface never connects directly to MongoDB. Database credentials and the JWT signing secret remain in the backend configuration.

### Booking and income flow

The client sends only the selected `gigId`. `bookingController.js` obtains the client ID from the verified JWT and the freelancer and price from the active gig in MongoDB. Client-supplied price or ownership overrides are rejected.

The controller uses a MongoDB session and `withTransaction()` to save the booking and its simulated transaction together. Both records contain matching client, freelancer, amount and confirmed status information. If a database operation fails, the transaction prevents a partial financial record from being committed.

`incomeController.js` aggregates confirmed transactions for the authenticated freelancer and returns `totalIncome` and `transactionCount`. The freelancer dashboard retrieves that summary and the freelancer's booking records through protected endpoints.

### Trust boundaries

| Boundary | Applied control |
|---|---|
| Browser to API | HTTPS encrypts API requests and responses. CORS specifies the frontend origin allowed to read API responses in a browser. |
| Request to application logic | JSON size limits, expected field types, allowed fields, sanitisation and validation reject invalid input. |
| Anonymous to authenticated operations | JWT signature, expiry and the server-side session version are checked before protected controllers; sign-out revokes earlier tokens. |
| Authenticated user to resources | Role checks and ownership-filtered queries restrict access to the user's permitted records. |
| Application to database | Mongoose schemas, authenticated Atlas access, server-derived ownership and atomic booking transactions protect persistence. |
| Server to response | Safe response objects and controlled errors keep password hashes and internal diagnostic information out of API responses. |
| API to Grafana Cloud | Only allowlisted log fields leave the API, over HTTPS with a write-only token. |
| Container to host | Non-root images, ports bound to `127.0.0.1`, private key kept in a Docker volume. |
| Source code to pipeline | Pinned actions, read-only permissions, dependency audit and a blocking SonarQube Cloud gate. |

See the [detailed architecture document](docs/architecture/hustlehub-architecture.md) and [editable diagram source](docs/architecture/hustlehub-architecture.mmd).

## Technology Stack

| Area | Technology |
|---|---|
| Frontend | React, React Router, Vite and CSS |
| Backend | Node.js, Express 5 and JavaScript |
| Persistence | MongoDB Atlas and Mongoose |
| Authentication | bcrypt password hashing, JWTs through `jsonwebtoken`, server-side session versions |
| API security | Helmet, CSP, CORS, validation, sanitisation, `express-rate-limit` and idempotency keys |
| Transport and configuration | Node HTTPS, local development certificates and dotenv |
| Logging and monitoring | Winston structured events, `winston-loki` and Grafana Cloud |
| Containers | Docker, Nginx and Docker Compose |
| CI/CD and analysis | GitHub Actions, npm audit and SonarQube Cloud |
| API testing | Postman collections run with the Postman CLI, JUnit evidence |
| Backend unit testing | Node.js test runner (`node:test`) with coverage |
| Frontend testing | Vitest, React Testing Library, user-event and jsdom |
| Browser testing | Playwright (Chromium) |

## Project Structure

| Location | Purpose |
|---|---|
| `api/index.js` | Express setup, security headers, CORS, body limits, database startup and HTTPS. |
| `api/config/db.js` | MongoDB connection configuration. |
| `api/routes/` | Authentication, gig, booking, income and administrator endpoints. |
| `api/middleware/` | JWT and role checks, validation, sanitisation, rate limits and controlled errors. |
| `api/controllers/` | Authentication, marketplace, booking, income and administration workflows. |
| `api/models/` | `User`, `Gig`, `Booking` and `Transaction` Mongoose schemas. |
| `api/utils/` | Password hashing/comparison and JWT signing/verification. |
| `client/src/App.jsx` | Frontend routing and role-specific pages. |
| `client/src/context/` | Authentication state, session restoration and authenticated requests. |
| `client/src/services/api.js` | Shared API requests, safe responses, timeouts and controlled errors. |
| `client/src/pages/` | Registration, login, marketplace and role-specific management/dashboard pages. |
| `client/src/components/` | Reusable forms, route guards, gig controls and booking interactions. |
| `client/src/test/` | Automated frontend rendering, interaction and API-service tests. |
| `postman/` | API collection, local environment and detailed runner instructions. |
| `docs/architecture/` | Architecture documentation and Mermaid source. |
| `evidence/part1/screenshots/` | Retained Part 1 foundation evidence. |
| `evidence/part2/` | Part 2 application screenshots, API captures and automated test reports. |
| `evidence/part3/` | Part 3 evidence: test reports, logging, static analysis and CI runs ([index](evidence/part3/README.md)). |
| `api/test/` | Backend unit tests (`node:test`). |
| `api/Dockerfile`, `client/Dockerfile`, `client/nginx/` | Container images and the frontend web server configuration. |
| `compose.yaml`, `compose.ci.yaml`, `docker/` | Docker Compose stack, CI overlay with a local MongoDB replica set, and start-up scripts. |
| `e2e/` | Playwright browser tests. |
| `.github/workflows/ci.yml`, `scripts/ci/` | DevSecOps pipeline and its helper scripts. |
| `sonar-project.properties` | SonarQube Cloud project and coverage configuration. |
| `docs/security/` | Session revocation, booking replay protection, static analysis and the threat-to-control review. |
| `docs/finance/`, `docs/monitoring/`, `docs/docker/`, `docs/ci/`, `docs/testing/` | Tax methodology, logging and monitoring, containers, pipeline and test guides. |

## Installation and Configuration

### Prerequisites

- Node.js 22 or later with npm (CI uses Node 22 for the API and Node 24 for the client).
- Git and OpenSSL. On Windows, Git for Windows includes OpenSSL at `C:\Program Files\Git\usr\bin\openssl.exe`.
- A MongoDB Atlas database with database-user credentials and network access configured for the machine running the API.
- Docker Desktop, to run the containers.
- Postman Desktop for manual collection runs, if required.
- On Windows, use PowerShell 7. The `npm --prefix ...` commands below work unchanged in PowerShell.

Use the committed `package-lock.json` files for repeatable dependency installation. The following setup commands are for a fresh clone.

### 1. Clone and install

```bash
git clone https://github.com/ST10437403-JamesMaherry/INSY7314POE.git
cd INSY7314POE
git switch dev

npm --prefix api ci
npm --prefix client ci

cp api/.env.example api/.env
cp client/.env.example client/.env
mkdir -p api/certs
```

Windows (PowerShell):

```powershell
git clone https://github.com/ST10437403-JamesMaherry/INSY7314POE.git; cd INSY7314POE; git switch dev; npm --prefix api ci; npm --prefix client ci; Copy-Item api/.env.example api/.env; Copy-Item client/.env.example client/.env; New-Item -ItemType Directory -Force api/certs
```

### 2. Configure the API

Generate a local signing secret:

```bash
openssl rand -hex 32
```

Set the following values in `api/.env`, replacing the placeholders with local configuration. The current assessment database is `hustlehub` in MongoDB Atlas.

```env
PORT=4000
APP_NAME=HustleHubPlusAPI
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

USE_HTTPS=true
SSL_KEY_PATH=./certs/localhost-key.pem
SSL_CERT_PATH=./certs/localhost-cert.pem

MONGO_URI=mongodb+srv://<database-user>:<database-password>@<cluster-host>/hustlehub?appName=HustleHubPlus

BCRYPT_SALT_ROUNDS=12
JWT_SECRET=replace_with_your_generated_local_secret
JWT_EXPIRES_IN=1h
```

Optional Grafana Cloud log delivery uses `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER` and `GRAFANA_LOKI_TOKEN`; leave them unset to log to stdout only. See [Grafana Cloud setup](docs/monitoring/grafana-cloud.md).

Use database-user credentials in `MONGO_URI`. The Atlas connection must be available before the API starts; startup fails if the database connection cannot be established.

### 3. Configure the frontend

Set `client/.env` to:

```env
VITE_API_URL=https://localhost:4000
```

`VITE_API_URL` is the API origin only, without `/api` or a trailing path. Only the public API address belongs in the frontend configuration. Restart Vite after changing its environment values.

### 4. Generate the local HTTPS certificate

From the repository root:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -keyout api/certs/localhost-key.pem \
  -out api/certs/localhost-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Windows (PowerShell), using the OpenSSL bundled with Git for Windows:

```powershell
& "C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout api/certs/localhost-key.pem -out api/certs/localhost-cert.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Trust `api/certs/localhost-cert.pem` in the local browser/operating system so the React application can call the HTTPS API:

- **macOS:** open the certificate in Keychain Access and set it to *Always Trust*.
- **Windows:** `certutil -user -addstore Root api\certs\localhost-cert.pem` adds it to the current user's trusted roots.

In Postman, add the certificate under **Settings > Certificates > CA certificates**. The npm test scripts pass it to the Postman CLI with `--ssl-extra-ca-certs`.

The certificate is for local development. A deployed application requires a trusted certificate and the corresponding deployed frontend/API origins.

### 5. Run the API and frontend

Open two terminals at the repository root.

**API terminal:**

```bash
npm --prefix api start
```

**Frontend terminal:**

```bash
npm --prefix client run dev
```

| Application | Local address |
|---|---|
| React frontend | `http://localhost:5173` |
| HTTPS API | `https://localhost:4000` |
| API health check | `https://localhost:4000/health` |

Vite serves the frontend locally on port 5173. Authentication, marketplace and financial API requests use HTTPS on port 4000.

For frontend linting and a production build:

```bash
npm --prefix client run lint
npm --prefix client run build
```

## Running with Docker Compose

Requires Docker Desktop. Compose reads the **repository-root** `.env`, not `api/.env`.

1. Create the root `.env` from `.env.example` (`cp .env.example .env` on macOS, `Copy-Item .env.example .env` in PowerShell). Set `MONGO_URI` and `JWT_SECRET` to the same values as `api/.env`, and keep `CLIENT_ORIGIN=http://localhost:5173` and `VITE_API_URL=https://localhost:4000`.
2. Validate, build and start the stack:

   ```bash
   docker compose config --quiet
   docker compose up --build -d --wait
   docker compose ps
   ```

   `api` and `client` should report `healthy`, and the one-shot `tls-init` service `Exited (0)`.
3. The API certificate is generated inside a Docker volume. Export its public certificate and trust it before using the frontend at `http://localhost:5173`; the [Compose guide](docs/docker/compose.md) gives the export, verification and trust steps.
4. Stop with `docker compose down`. Adding `--volumes` also deletes the certificate, so a new one must be trusted next time.

`compose.ci.yaml` adds a disposable MongoDB replica set for automated tests. It is for CI and local test runs only and must never be pointed at Atlas.

## Administrator Account

Public registration allows only `client` and `freelancer`. Administrator access is assigned directly in the assessment database rather than through the registration interface.

Reuse the existing assessment account if it is already provisioned. For a fresh database:

1. With the API running, register `admin.demo@hustlehub.test` as a normal client through the registration screen, using the chosen assessment password.
2. In Atlas, open the `hustlehub` database and the `users` collection.
3. Find the account by its email and change its `role` from `client` to `admin`. Preserve its existing password hash and other fields.
4. Sign in again to obtain a JWT containing the administrator role.
5. Set `adminEmail` and `adminPassword` in the selected local Postman environment, or supply the password at Newman run time.

Provisioning registration consumes the registration allowance. Stop the API with `Ctrl+C` and restart it before a complete automated API cycle:

```bash
npm --prefix api start
```

No administrator password is stored in the repository: both Postman environments keep `adminPassword` blank, and passwords are supplied at run time. Earlier commits of `postman/postman_environment.json` contained the assessment administrator's password in plain text. That password must be treated as compromised and changed in the assessment database before submission; this rotation is still outstanding. Credentials for marking are shared outside the repository. Backend database credentials, the JWT signing secret and private keys remain outside the frontend and assessment documentation.

## API Endpoints

The default API origin is `https://localhost:4000`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/` | Public | Basic API information. |
| `GET` | `/health` | Public | Availability and HTTP/HTTPS mode. |
| `POST` | `/api/auth/register` | Public | Register a client or freelancer. |
| `POST` | `/api/auth/login` | Public | Authenticate and return a signed JWT with safe user data. |
| `GET` | `/api/auth/me` | Verified JWT | Retrieve the authenticated account's safe profile. |
| `POST` | `/api/auth/logout` | Verified JWT | Sign out and revoke every token issued to the account. |
| `GET` | `/api/gigs` | Public | Browse active marketplace gigs. |
| `GET` | `/api/gigs/mine` | Freelancer | List the freelancer's own active and inactive gigs. |
| `GET` | `/api/gigs/:id` | Public | View an active gig. |
| `POST` | `/api/gigs` | Freelancer | Create a gig owned by the authenticated freelancer. |
| `PUT` | `/api/gigs/:id` | Owning freelancer | Update allowed gig fields. |
| `DELETE` | `/api/gigs/:id` | Owning freelancer | Delete an owned gig. |
| `POST` | `/api/bookings` | Client | Create a booking and its simulated transaction. Requires an `Idempotency-Key` header (UUID v4). |
| `GET` | `/api/bookings/mine` | Client | Retrieve the client's own booking history. |
| `GET` | `/api/bookings/freelancer` | Freelancer | Retrieve bookings associated with the freelancer. |
| `GET` | `/api/bookings/:id` | Owning client | Retrieve one owned booking. |
| `GET` | `/api/income/me` | Freelancer | Retrieve lifetime and year-to-date income, the monthly breakdown and the illustrative tax estimate. |
| `GET` | `/api/admin/users` | Administrator | View safe user records. |
| `GET` | `/api/admin/bookings` | Administrator | View platform booking records. |
| `DELETE` | `/api/admin/gigs/:id` | Administrator | Remove a marketplace gig. |

### Example request bodies

**Registration:**

```json
{
  "fullName": "Demo Freelancer",
  "email": "freelancer@example.com",
  "password": "DemoPassword123!",
  "role": "freelancer"
}
```

**Gig creation:**

```json
{
  "title": "Website design service",
  "description": "A responsive website design service for a small business.",
  "category": "Web Development",
  "price": 800.25,
  "active": true
}
```

**Booking creation:** replace the sample ID with the actual active gig ID.

```json
{
  "gigId": "000000000000000000000001"
}
```

Protected requests use:

```text
Authorization: Bearer <token-from-login>
```

The example password is fictional. User and resource identifiers are MongoDB ObjectIds. Successful user responses contain only the fields required by the API contract, with no password or password hash.

## Security Design

### Passwords and JWTs

Passwords are hashed with bcrypt before storage. Login compares the submitted password with the stored hash. The bcrypt work factor is configurable, with a secure default of 12 and a minimum configured value of 10. Registration and login enforce bcrypt's supported password-byte limit.

Unknown accounts and incorrect passwords receive the same `Invalid credentials` response. JWT application claims contain the user ID, role and session version; the token library adds issue and expiry timestamps. JWTs are signed using the backend-only secret, and protected routes verify the signature and expiry, then check the session version and role against MongoDB before using the claims. Signing out increments the session version, which revokes all earlier tokens.

The frontend keeps the token in the tab's `sessionStorage`. `AuthContext` checks the account with `/api/auth/me` during session restoration and clears the session when an authenticated request returns `401`.

### Roles and ownership

Frontend route guards provide role-appropriate navigation. The API independently applies `protect` and `authorizeRoles` before sensitive operations.

Ownership is included in database queries. Freelancer gig updates/deletions use the verified freelancer ID, client booking queries use the verified client ID, and income aggregation uses the verified freelancer ID. Administrator routes require the administrator role.

The booking controller derives ownership and price from trusted server-side sources. Clients cannot choose the booking's freelancer, client ID or amount through request fields.

### Validation and sanitisation

- Request bodies must have the expected shape and field types. Arrays, object-valued credentials and unsupported fields are rejected where the endpoint contract requires primitive values.
- Registration normalises names and email addresses, validates their format/length, enforces the password-byte limits and rejects public administrator registration.
- Gig validation checks text lengths, category, boolean activity state and numeric price. Prices must be at least `0.01`, use no more than two decimal places and remain within the supported numeric range.
- Gig text sanitisation removes script/style blocks, HTML comments, markup and unsafe control characters before validation.
- Booking validation accepts the required gig identifier and rejects price or ownership overrides.
- MongoDB identifiers are checked before lookups. Expected primitive inputs are used to construct queries rather than forwarding arbitrary request objects as database filters.
- React renders text through JSX and displays validation, loading, confirmation and controlled error states.

### HTTPS, security headers and CORS

`api/index.js` configures HTTPS, Helmet and a restrictive API Content Security Policy. The configured directives include self-origin defaults, restrictions on scripts, no embedded objects and no framing. API responses also include headers such as HSTS, `X-Content-Type-Options` and `Referrer-Policy`; `X-Powered-By` is disabled.

`CLIENT_ORIGIN` identifies the frontend origin permitted to read API responses in a browser. Allowed methods include `GET`, `POST`, `PUT` and `DELETE`; allowed request headers include `Content-Type` and `Authorization`. `Retry-After` is exposed so the frontend can explain rate limits.

CORS controls browser response access; it does not grant application permissions. Browser document CSP is a separate policy from the API's response headers.

### Rate limits and request size

| Limiter | Endpoint | Allowance | Behaviour |
|---|---|---|---|
| Authentication | `POST /api/auth/login` | 5 failed attempts per 15 minutes | Successful logins do not consume the failed-login allowance. Once exhausted, further login requests are blocked until reset. |
| Registration | `POST /api/auth/register` | 10 attempts per hour | Counts requests that reach the registration limiter. |
| Booking | `POST /api/bookings` | 10 attempts per 15 minutes | Applied after JWT and client-role checks. |

Limiters use the client IP and keep their counters in API process memory. Rejected requests receive `429`, a controlled message, `RateLimit-*` headers and `Retry-After`. The test suite checks that forged `X-Forwarded-For` headers do not bypass the limits.

JSON bodies are limited to `10kb`. Malformed JSON returns `400`; oversized bodies return `413` before the route controller runs.

### Controlled errors and configuration

The final Express error handler produces bounded, safe JSON error responses. Unknown routes return `404`. Internal diagnostics remain on the server rather than in client responses; public responses omit stack traces, database error details, configuration values and password hashes.

Local `.env` files, private keys, certificates and dependency directories are excluded from Git. Safe `.env.example` files document the configuration contract. The public frontend API URL is separate from backend credentials.

## Security Review

The full [threat-to-control review](docs/security/threat-control-review.md) maps 32 threats across 7 trust boundaries to their controls, tests and evidence, classified with STRIDE and the OWASP Top 10:2025. The summary below covers the main threats. The two Part 3 security features are in bold.

| Threat (OWASP Top 10:2025) | Control | Added in | Evidence |
|---|---|---|---|
| Credentials intercepted in transit (A04) | HTTPS API, HSTS, restricted CORS | Part 1/2 | [Security matrix](evidence/part3/security-tests/security-matrix.xml) |
| Password guessing (A07) | Failed-login limiter, bcrypt work factor 12 | Part 1/2 | [Rate-limit cycle](evidence/part3/security-tests/security-limits.xml) |
| Forged or altered JWT (A07) | Signature and expiry verified with a server-only secret | Part 1/2 | [Security matrix](evidence/part3/security-tests/security-matrix.xml) |
| Stolen token reused after sign-out (A07) | **Server-side session version, checked on every request** | **P3-05** | [Security matrix](evidence/part3/security-tests/security-matrix.xml), [Playwright](evidence/part3/e2e/playwright-junit.xml) |
| Access to other users' data (A01) | Role guards and ownership-filtered queries | Part 1/2 | [Security matrix](evidence/part3/security-tests/security-matrix.xml), [access denied](evidence/part3/e2e/screenshots/07-client-access-denied.png) |
| Price, owner or extra fields injected (A01) | Allowlist validators; server-derived price and owner | Part 1/2, P3-15 | [Backend tests](evidence/part3/unit-tests/api-node-test.xml) |
| NoSQL injection (A05) | Primitive-type validation; plain-string lookups | Part 1/2, P3-15 | [Backend tests](evidence/part3/unit-tests/api-node-test.xml), [static analysis](evidence/part3/static-analysis/) |
| Stored XSS (A05) | Text sanitisation, React escaping, API CSP | Part 1/2 | [Backend tests](evidence/part3/unit-tests/api-node-test.xml) |
| Duplicate bookings and transactions (A06) | **`Idempotency-Key`, unique index, MongoDB transaction** | **P3-06** | [Security matrix](evidence/part3/security-tests/security-matrix.xml) |
| Internal errors exposed (A10) | Central error handler with generic responses | Part 1/2 | [Security matrix](evidence/part3/security-tests/security-matrix.xml) |
| Unnoticed attacks; secrets in logs (A09) | Allowlisted structured events, Grafana Cloud dashboard | P3-07, P3-08 | [Logging evidence](evidence/part3/logging/) |
| Vulnerable dependencies; insecure code merged (A03, A08) | npm audit, SonarQube quality gate, blocking CI gate | P3-15, P3-16 | [Static analysis](evidence/part3/static-analysis/), [workflow runs](evidence/part3/ci/github-actions-runs.png) |
| Container or service exposure (A02) | Non-root images, localhost-only ports, isolated CI database | P3-09 to P3-11, P3-16 | [Compose guide](docs/docker/compose.md) |

### Residual risks

The review lists 14 accepted limitations. The most important:

- Payments are simulated; no payment provider or real money is involved.
- TLS uses a self-signed localhost certificate, and the frontend is served over plain HTTP on localhost.
- The tax figure is an illustrative projection, not tax advice.
- `jwt.verify` does not pin the algorithm to HS256. Exploiting this needs the signing secret, but RFC 8725 asks for an explicit list.
- The JWT is kept in `sessionStorage` and the SPA has no Content-Security-Policy, so a successful XSS could read it.
- Rate limits are kept in process memory per IP and reset when the API restarts.
- An administrator password was committed in earlier revisions and must be rotated (see [Administrator Account](#administrator-account)).

## Automated Testing

### Postman collection

The [Postman folder](postman/) contains the **HustleHub+ Functional API Review (Part 2 + Part 3 Financial)** collection and **HustleHub+ Functional - Local** environment. See [postman/README.md](postman/README.md) for detailed runner instructions and troubleshooting.

| Folder | Request definitions | Coverage |
|---|---:|---|
| 01 Health and Security Headers | 4 | HTTPS health, Helmet/CSP headers, CORS origins and preflight. |
| 02 Authentication | 21 | Administrator login, unique account creation, registration/login failures, JWTs and protected profiles. |
| 03 Gigs | 36 | Freelancer CRUD, ownership, roles, sanitisation, visibility and price boundaries. |
| 04 Bookings | 19 | Booking/transaction consistency, idempotent replay with the same `Idempotency-Key`, history, ownership, roles and rejected fields or unavailable gigs. |
| 05 Income | 11 | Year-to-date income, March–February monthly breakdown, tax-year boundaries, illustrative tax recalculated independently, replay not double-counted, empty-income report, freelancer isolation and authentication/role failures. |
| 06 Administration | 18 | Safe user/booking views, restricted gig removal, preserved financial history and cleanup. |
| 07 Security and Controlled Errors | 7 | Malformed JSON, body limits, unknown routes, NoSQL operator inputs and arrays. |
| 08 Rate Limiting | 4 | Login and booking exhaustion, `429` response headers and forwarded-IP bypass rejection. |

There are **120 request definitions** (112 from Part 2 plus 8 Part 3 financial checks). Two bounded limiter loops can repeat requests, so executed request and assertion totals can be higher.

Each complete cycle creates unique test clients and freelancers. Scripts capture tokens and resource IDs automatically. Later folders reuse that state and check prerequisites. The existing administrator is authenticated separately. The suite verifies safe responses and controlled failure cases as well as the successful marketplace workflow.

### Run in Postman

1. Start a fresh API process using `npm --prefix api start` from the repository root.
2. Import `postman/postman_collection.json` and `postman/postman_environment.json`.
3. Select **HustleHub+ Functional - Local** and set `adminPassword` as a local current value (the committed file keeps it blank).
4. Trust the local certificate through Postman's CA certificate settings.
5. Use the desktop/local Collection Runner with one iteration and no data file.
6. Enable **Keep variable values** and **Stop run if an error occurs**.
7. Run the complete collection, or run folders 01–08 individually in order. Keep the API running between folders.

Save/export corrected requests back to the repository collection so Postman and Newman use the same configuration. Exported collection state should exclude generated JWTs and captured run identifiers.

### Run with the Postman CLI

Start a fresh API process in one terminal:

```bash
npm --prefix api start
```

In a second terminal at the repository root, supply the administrator password at run time. Replace `<admin-password>` with the assessment password:

```bash
npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

The JUnit report is written to `evidence/part3/newman/functional-report.xml`.

The script runs the pinned Postman CLI (`postman-cli`, installed with the API dependencies; no Postman account or API key is needed) against the repository collection and environment, trusts `api/certs/localhost-cert.pem`, and runs the CLI and JUnit reporters. The report path is relative to the npm script's `api` working directory. `--silent` suppresses npm's script-command echo.

**Committed API evidence:** Part 3 [JUnit report](evidence/part3/newman/functional-report.xml) and [summary](evidence/part3/newman/functional-summary.png). Part 2 [JUnit report](evidence/part2/newman/newman-report.xml), [terminal summary](evidence/part2/newman/newman-summary.png) and [Postman Runner summary](evidence/part2/newman/postman-runner-summary.png).

A successful cycle must complete all eight folders with zero failed assertions and no script errors. The Part 3 cycle records 335 passing assertions. The committed reports and screenshots record the submitted results.

### Repeatability and limiter capacity

Before folder 08, the normal cycle uses eight registration attempts, ten authenticated client booking attempts (including the idempotent replay) and three failed login attempts. Folder 08 deliberately exhausts the remaining login and booking capacity. Its booking probes use an invalid gig ID and create no additional financial records.

Stop the API with `Ctrl+C`, then restart before another complete cycle:

```bash
npm --prefix api start
```

This resets the in-memory counters. A full Postman run and a full Postman CLI run each need their own fresh API process. The database persists across restarts, while unique test accounts prevent fixture collisions. Test accounts and the booking/transaction pair remain available for persistence evidence; the suite removes its captured test gigs during its cleanup checks.

### Security test suite

A separate collection, `postman/part3_security_collection.json`, tests the security controls: missing, forged, expired and revoked JWTs, role and cross-account isolation, `Idempotency-Key` misuse, malformed input and safe errors, security headers, and the rate limiters. Run each cycle on a freshly started API. From the `api` folder:

```bash
npm run test:security --silent -- --env-var 'adminPassword=<admin-password>' --env-var "jwtSecret=<JWT_SECRET from api/.env>"
```

Restart the API, then run the rate-limit cycle:

```bash
npm run test:security:limits --silent
```

Keep `--silent`, otherwise npm echoes the secret values. See the [security suite guide](docs/testing/security-postman-suite.md); reports are in [`evidence/part3/security-tests/`](evidence/part3/security-tests/).

### Backend unit tests and coverage

```bash
npm --prefix api test
npm --prefix api run test:coverage
```

The coverage run also writes `api/coverage/lcov.info` for SonarQube Cloud. See [backend unit tests](docs/testing/backend-unit-tests.md).

### Real-browser tests (Playwright)

The [`e2e/`](e2e/) suite drives Chromium through the React application against the running HTTPS API and database. It covers registration, gig publishing, booking with confirmation, the income and tax dashboard (checked against an independent SARS calculation), session revocation on sign-out, and failure paths (wrong password, a client opening freelancer pages). It uses isolated, generated accounts and trusts only the local API certificate. With a freshly started API:

```bash
npm --prefix e2e ci
npm --prefix e2e run install:browser
npm --prefix e2e test
```

See [docs/testing/e2e-playwright.md](docs/testing/e2e-playwright.md). Evidence: [JUnit](evidence/part3/e2e/playwright-junit.xml) and [screenshots](evidence/part3/e2e/screenshots/).

### Frontend tests

`client/src/test/app.test.jsx` exercises login feedback, allowed registration roles, marketplace rendering/search, gig form validation, booking confirmation and role-based route behaviour. `client/src/test/api.test.js` checks the shared API service's token/destination behaviour. Part 3 adds `logout.test.jsx` (server-side sign-out), `bookingIdempotency.test.jsx` (request keys and retries) and `freelancerDashboard.test.jsx` (income and tax display). The frontend tests use jsdom and mocked API responses; the Newman suite separately exercises the real API and database.

Run from the repository root:

```bash
npm --prefix client test
npm --prefix client run test:coverage
```

`test:coverage` writes `client/coverage/lcov.info` and does not rewrite the Part 2 JUnit report.

To write a JUnit report explicitly into the submitted frontend evidence folder:

```bash
npm --prefix client test -- \
  --reporter=default \
  --reporter=junit \
  --outputFile=../evidence/part2/frontend-tests/react-tests.xml
```

**Committed frontend evidence:** [JUnit report](evidence/part2/frontend-tests/react-tests.xml) and [test summary](evidence/part2/frontend-tests/react-tests-summary.png).

## CI/CD and Static Analysis

The workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (*HustleHub DevSecOps*) runs on pushes to `dev`, `main`, `feature/**`, `fix/**` and `chore/**`, on pull requests into `dev` or `main`, and on manual dispatch.

| Job | What runs | Fails when |
|---|---|---|
| Configuration contracts | Container, Compose and pipeline configuration checks | A check or shell syntax test fails |
| Backend | Locked install, backend unit tests and coverage | A test fails or coverage is missing |
| Frontend | Locked install, Vitest with coverage, ESLint and a production build | A test, lint rule or build fails |
| Dependency audit | `npm audit` for `api`, `client` and `e2e` | Any high or critical advisory |
| Docker integration | Smoke, functional, security, rate-limit and browser suites, each in its own disposable stack | Start-up, health, TLS, non-root or test failure |
| Sonar quality gate | SonarQube Cloud analysis with both coverage reports (on `dev` and pull requests into `dev`) | The quality gate does not pass, or the token or coverage is missing |
| CI gate | Combines every required job | Any required job fails, is cancelled or is skipped unexpectedly |

Integration jobs use a local MongoDB replica set and secrets generated for the run, so production credentials never reach CI. The only stored secret is `SONAR_TOKEN`. Actions are pinned to full commit SHAs, and the workflow has read-only repository permissions. Full details: [DevSecOps pipeline](docs/ci/devsecops.md).

### Static analysis

SonarQube Cloud (project `hustlehub-plus_insy7314poe`, Free plan, main branch `dev`) analyses `api` and `client/src` with coverage from both test suites, using the default *Sonar way* quality gate. The scan waits for the gate and fails if it does not pass. The first scan found 19 issues (security rating E): 14 were fixed and 5 accessibility findings were accepted with written reasons, giving a security rating of A. To scan locally:

```bash
npm --prefix api run test:coverage
npm --prefix client run test:coverage
npx --yes @sonar/scan
```

The scan needs `SONAR_TOKEN` set in the shell. [Configuration, findings and decisions](docs/security/static-analysis.md). Evidence: [static analysis](evidence/part3/static-analysis/) and [workflow runs](evidence/part3/ci/github-actions-runs.png).

## Assessment Evidence Map

### Part 3 rubric

| Rubric criterion (marks) | Implementation | Evidence |
|---|---|---|
| Final features: tax and income dashboard (20) | [Tax estimator](api/services/taxEstimator.js), [income analytics](api/services/incomeAnalytics.js), [freelancer dashboard](client/src/pages/FreelancerDashboardPage.jsx), [methodology](docs/finance/tax-estimation.md) | [Dashboard screenshot](evidence/part3/e2e/screenshots/05-freelancer-income-tax-dashboard.png), [financial API assertions](evidence/part3/newman/financial-assertions.png) |
| CI/CD pipeline (20) | [Workflow](.github/workflows/ci.yml), [pipeline guide](docs/ci/devsecops.md) | [Workflow runs](evidence/part3/ci/github-actions-runs.png) |
| Static code analysis (10) | [`sonar-project.properties`](sonar-project.properties), [findings and decisions](docs/security/static-analysis.md) | [Static analysis](evidence/part3/static-analysis/) |
| Docker: backend and frontend (10) | [API image](api/Dockerfile), [client image](client/Dockerfile), [Compose](compose.yaml), [guide](docs/docker/compose.md) | Listed as pending in the [evidence index](evidence/part3/README.md) |
| Logging (10) | [Event logger](api/utils/logger.js), [Grafana transport](api/utils/lokiTransport.js), [monitoring docs](docs/monitoring/) | [Logging evidence](evidence/part3/logging/) |
| Own security features (15) | [Session revocation](docs/security/session-revocation.md), [booking replay protection](docs/security/booking-idempotency.md) | [Security tests](evidence/part3/security-tests/), [Playwright](evidence/part3/e2e/playwright-junit.xml) |
| Security review (10) | [Security Review](#security-review), [threat-to-control review](docs/security/threat-control-review.md) | Review document |
| README update (5) | This README and the [architecture document](docs/architecture/hustlehub-architecture.md) | This README |

The complete list of reports, screenshots and test totals is in the [Part 3 evidence index](evidence/part3/README.md).

### Part 2 evidence map

This map connects the Part 2 assessment areas to implementation and evidence without requiring a reviewer to search the entire codebase.

| Assessment area | Implementation to review | Evidence |
|---|---|---|
| Application functionality | React [pages](client/src/pages/), [gig controller](api/controllers/gigController.js), [booking controller](api/controllers/bookingController.js), [income controller](api/controllers/incomeController.js). | [Marketplace and gigs](#marketplace-and-gigs), [bookings](#bookings-and-client-history), [database records](#database-persistence), [income](#freelancer-income). |
| Roles and ownership | [JWT/role middleware](api/middleware/authMiddleware.js), [gig routes](api/routes/gigRoutes.js), [booking routes](api/routes/bookingRoutes.js), ownership-filtered controllers. | [Administration and access control](#administration-and-access-control) and the role/ownership cases in the API captures. |
| JWT, validation and sanitisation | [Token helpers](api/utils/token.js), [middleware](api/middleware/), [shared frontend API service](client/src/services/api.js). | [Authentication](#authentication-evidence) and [security tests](#security-headers-errors-and-rate-limits). |
| Rate limiting | [Rate limiter configuration](api/middleware/rateLimiters.js) and protected booking/login routes. | [Rate-limit captures](#security-headers-errors-and-rate-limits). |
| Security headers | [Express/Helmet configuration](api/index.js). | [Health and security headers](evidence/part2/security/postman-01-health-headers.png). |
| React integration and UX | [AuthContext](client/src/context/AuthContext.jsx), [route guards](client/src/components/ProtectedRoute.jsx), [booking interaction](client/src/components/bookings/BookGigAction.jsx). | Application screenshots and the [demonstration video](#demonstration-video). |
| Backend API tests | [Postman collection](postman/postman_collection.json) and [Newman script](api/package.json). | [Newman JUnit](evidence/part2/newman/newman-report.xml) and [summary](evidence/part2/newman/newman-summary.png). |
| Frontend rendering/interaction tests | [Component tests](client/src/test/app.test.jsx) and [API-service tests](client/src/test/api.test.js). | [React JUnit](evidence/part2/frontend-tests/react-tests.xml) and [summary](evidence/part2/frontend-tests/react-tests-summary.png). |
| Documentation | This README, [Postman instructions](postman/README.md) and [architecture documentation](docs/architecture/hustlehub-architecture.md). | Setup, security explanations, endpoint contracts and evidence links. |

## Screenshot Evidence

All paths below are relative to this repository-root README. Main application screenshots are embedded directly; detailed API captures are grouped in expandable sections.

### Authentication Evidence

**Successful frontend login**

![Successful frontend login](evidence/part2/authentication/login-success.png)

<details>
<summary>Authentication API test captures</summary>

![Authentication API tests, capture 1](evidence/part2/authentication/postman-02-authentication.png)

![Authentication API tests, capture 2](evidence/part2/authentication/postman-02-authentication-2.png)

![Authentication API tests, capture 3](evidence/part2/authentication/postman-02-authentication-3.png)

</details>

### Marketplace and Gigs

**Active marketplace listings**

![Marketplace listings](evidence/part2/gigs/marketplace.png)

**Freelancer gig creation**

![Freelancer gig created](evidence/part2/gigs/freelancer-gig-created.png)

**Freelancer gig update**

![Freelancer gig edited](evidence/part2/gigs/freelancer-gig-edited.png)

<details>
<summary>Gig CRUD, validation and ownership API captures</summary>

![Gig API tests, capture 1](evidence/part2/gigs/postman-03-gigs.png)

![Gig API tests, capture 2](evidence/part2/gigs/postman-03-gigs-2.png)

![Gig API tests, capture 3](evidence/part2/gigs/postman-03-gigs-3.png)

</details>

### Bookings and Client History

**Booking confirmation and simulated payment**

![Booking confirmed](evidence/part2/bookings/booking-confirmed.png)

**Client booking history**

![Client booking history](evidence/part2/bookings/client-history.png)

<details>
<summary>Booking and transaction API captures</summary>

![Booking API tests, capture 1](evidence/part2/bookings/postman-04-bookings.png)

![Booking API tests, capture 2](evidence/part2/bookings/postman-04-bookings-2.png)

</details>

### Database Persistence

These captures show the database side of the marketplace workflow. The booking and transaction records can be compared using their booking reference, client, freelancer, amount and status fields.

<details>
<summary>MongoDB Atlas persistence and linked financial records</summary>

**Database persistence overview**

![MongoDB persistence overview](evidence/part2/database/mongodb-persistence.png)

**Stored gig**

![Gig record in MongoDB](evidence/part2/database/hustlehub-gig.png)

**Stored booking**

![Booking record in MongoDB](evidence/part2/database/booking-record.png)

**Matching transaction**

![Transaction record in MongoDB](evidence/part2/database/transaction-record.png)

</details>

### Freelancer Income

**Freelancer bookings and income dashboard**

![Freelancer income dashboard](evidence/part2/income/freelancer-income.png)

<details>
<summary>Income API test capture</summary>

![Income API tests](evidence/part2/income/postman-05-income.png)

</details>

### Administration and Access Control

**Administrator dashboard**

![Administrator dashboard](evidence/part2/admin/admin-dashboard.png)

**Rejected administrator access**

![Administrator access rejected](evidence/part2/security/admin-access-rejected.png)

<details>
<summary>Administrator API permissions and data-view captures</summary>

![Administrator API tests, capture 1](evidence/part2/admin/postman-06-admin.png)

![Administrator API tests, capture 2](evidence/part2/admin/postman-06-admin-2.png)

</details>

### Security Headers, Errors and Rate Limits

<details>
<summary>Health, security headers and controlled error captures</summary>

![Health and API security header tests](evidence/part2/security/postman-01-health-headers.png)

![Security and controlled error tests](evidence/part2/security/postman-07-security-errors.png)

</details>

**Rate-limit rejection**

![429 rate-limit response](evidence/part2/security/rate-limit-429.png)

<details>
<summary>Automated rate-limit test capture</summary>

![Automated rate-limit tests](evidence/part2/security/postman-08-rate-limit.png)

</details>

### Automated Test Results

**Newman terminal summary**

![Newman test summary](evidence/part2/newman/newman-summary.png)

[Open the Newman JUnit report](evidence/part2/newman/newman-report.xml).

**Postman Runner summary**

![Postman Runner summary](evidence/part2/newman/postman-runner-summary.png)

**React rendering and interaction test summary**

![React test summary](evidence/part2/frontend-tests/react-tests-summary.png)

[Open the frontend JUnit report](evidence/part2/frontend-tests/react-tests.xml).

### Retained Part 1 Evidence

The Part 1 captures document the original secure authentication foundation. Current Part 2 behaviour is demonstrated in the sections above.

<details>
<summary>Part 1 setup, authentication and API security screenshots</summary>

[Watch the earlier Part 1 demonstration](https://youtu.be/fm5UVAwE3pM).

**Fresh-clone setup and HTTPS**

![Part 1 fresh-clone setup](evidence/part1/screenshots/NewCloneSetUp.png)

![Part 1 HTTPS health check](evidence/part1/screenshots/HTTPS_HealthCheck.png)

**Registration and login**

![Part 1 successful registration](evidence/part1/screenshots/RegisterSuccess.png)

![Part 1 duplicate registration](evidence/part1/screenshots/RegisterDuplicate.png)

![Part 1 successful login](evidence/part1/screenshots/LoginSuccessful.png)

![Part 1 failed login](evidence/part1/screenshots/LoginFailed.png)

**JWT authentication**

![Part 1 valid JWT](evidence/part1/screenshots/JWT_Valid.png)

![Part 1 invalid JWT](evidence/part1/screenshots/JWT_Invalid.png)

**Validation and request limits**

![Part 1 invalid field types](evidence/part1/screenshots/InvalidFieldTypes.png)

![Part 1 malformed JSON](evidence/part1/screenshots/Malfromed_JSON.png)

![Part 1 oversized body](evidence/part1/screenshots/OversizedBody.png)

**CORS and headers**

![Part 1 allowed CORS origin](evidence/part1/screenshots/CORS_AllowedOrigin.png)

![Part 1 untrusted CORS origin](evidence/part1/screenshots/CORS_UntrustedOrigin.png)

![Part 1 security headers, capture 1](evidence/part1/screenshots/SecurityHeaders1.png)

![Part 1 security headers, capture 2](evidence/part1/screenshots/SecurityHeaders2.png)

**Postman collection**

![Part 1 Postman collection, capture 1](evidence/part1/screenshots/PostmanCollection1.jpeg)

![Part 1 Postman collection, capture 2](evidence/part1/screenshots/PostmanCollection2.jpeg)

</details>

## Response Status Codes

| Status | Use |
|---|---|
| `200 OK` | Successful reads, login, sign-out, gig updates, deletion confirmations and replayed bookings (`replayed: true`). |
| `201 Created` | Successful registration, gig creation and booking/transaction creation. |
| `400 Bad Request` | Invalid input, malformed JSON or invalid identifier format. |
| `401 Unauthorized` | Invalid credentials, or a missing, invalid, expired or revoked JWT. |
| `403 Forbidden` | Authenticated role is not permitted to perform the operation. |
| `404 Not Found` | Unknown route, missing/unavailable gig, or resource not available to the requesting owner. |
| `409 Conflict` | Duplicate registration email, or an `Idempotency-Key` reused for a different gig. |
| `413 Payload Too Large` | JSON body exceeds the configured `10kb` limit. |
| `429 Too Many Requests` | Authentication, registration or booking allowance exceeded. |
| `500 Internal Server Error` | Controlled unexpected server failure. |

## Group Contributions

Part 3 work by member, taken from each member's assigned issues and merged pull requests. The commits behind every item are in the Git history; Part 1 and Part 2 contributions are recorded there as well.

| Member | Part 3 work |
|---|---|
| James Maherry | P3-01 tax estimation, P3-02 income analytics, P3-03 tax dashboard, P3-04 backend unit tests, P3-05 session revocation, P3-06 booking replay protection, P3-07 structured logging, P3-09 API container, P3-10 client container, P3-11 Docker Compose, P3-16 DevSecOps pipeline, P3-20 final regression and submission |
| Ewald Pagel | P3-08 Grafana Cloud logging, P3-13 security Postman collection, P3-15 SonarQube static analysis, P3-17 threat-to-control review, P3-18 final README and architecture, fixes to the functional Postman collection |
| Mark Mansvelt | P3-12 Postman financial coverage, P3-14 Playwright browser tests, P3-19 QA evidence and demonstration runbook |

P3-19 and P3-20 were still open when this section was written.

## References

- [OWASP Top 10:2025](https://top10.owasp.org/2025/)
- [Threat-to-control review sources](docs/security/threat-control-review.md#sources)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 7519 — JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html)
- [Express error-handling guide](https://expressjs.com/en/guide/error-handling/)
- [Helmet documentation](https://helmet.js.org/)
- [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- [Postman CLI reporters](https://learning.postman.com/docs/postman-cli/postman-cli-reporters)
- [Vitest reporters](https://vitest.dev/guide/reporters.html)
