# HustleHub+

**INSY7314 Portfolio of Evidence — Part 2: Secure Stack**

HustleHub+ is a secure freelance marketplace built with MongoDB, Express, React and Node.js. Freelancers advertise services, clients browse and book those services, and administrators review users and bookings and remove gigs when necessary.

Part 2 extends the Part 1 authentication foundation into a working full-stack application. It adds persistent MongoDB storage, a React interface, role-based access control, gig management, bookings, simulated transactions, freelancer income and automated backend and frontend testing.

## Demonstration Video

[Watch the HustleHub+ Part 2 demonstration on YouTube](https://youtu.be/laT6uWLJGro)

**Video link placeholder:** replace the URL above with the recorded Part 2 demonstration link before submission.

The demonstration covers registration and login, freelancer gig creation and editing, client booking and history, transaction recording, freelancer income, administration, security controls and test evidence.

## Group Members

| Group Member | Student Number | GitHub Username |
|---|---|---|
| James Maherry | ST10437403 | [ST10437403-JamesMaherry](https://github.com/ST10437403-JamesMaherry) |
| Ewald Pagel | ST10257942 | [ST10257942](https://github.com/ST10257942) |
| Mark Mansvelt | ST10438365 | [ST10438365MarkMansvelt](https://github.com/ST10438365MarkMansvelt) |

## Contents

- [Implemented Features and Roles](#implemented-features-and-roles)
- [Architecture and Frontend Integration](#architecture-and-frontend-integration)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation and Configuration](#installation-and-configuration)
- [Administrator Account](#administrator-account)
- [API Endpoints](#api-endpoints)
- [Security Design](#security-design)
- [Automated Testing](#automated-testing)
- [Assessment Evidence Map](#assessment-evidence-map)
- [Screenshot Evidence](#screenshot-evidence)
- [Response Status Codes](#response-status-codes)
- [Part 3 Direction](#part-3-direction)
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

## Architecture and Frontend Integration

```mermaid
flowchart TB
    subgraph BROWSER["Browser and test clients"]
        USER["Client / Freelancer / Administrator"]
        REACT["React pages and components"]
        AUTH["AuthContext and shared API service"]
        TESTS["Postman / Newman"]
        USER --> REACT --> AUTH
    end

    TLS["HTTPS API boundary"]

    subgraph SERVER["Node.js and Express application"]
        HTTP["Helmet / CSP / CORS / JSON body limit"]
        ROUTES["Routes and endpoint middleware"]
        GUARDS["JWT / Roles / Validation / Sanitisation / Rate limits"]
        AUTHCTRL["Authentication"]
        GIGCTRL["Gigs"]
        MONEYCTRL["Bookings and income"]
        ADMINCTRL["Administration"]
        ERRORS["Controlled JSON errors"]
        HTTP --> ROUTES --> GUARDS
        GUARDS --> AUTHCTRL
        GUARDS --> GIGCTRL
        GUARDS --> MONEYCTRL
        GUARDS --> ADMINCTRL
        ROUTES --> ERRORS
    end

    subgraph DATA["MongoDB Atlas data boundary"]
        MODELS["Mongoose models and schemas"]
        DATABASE[("Users / Gigs / Bookings / Transactions")]
        MODELS --> DATABASE
    end

    AUTH --> TLS
    TESTS --> TLS
    TLS --> HTTP
    AUTHCTRL --> MODELS
    GIGCTRL --> MODELS
    MONEYCTRL --> MODELS
    ADMINCTRL --> MODELS
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
| Anonymous to authenticated operations | JWT signature and expiry verification run before protected controllers. |
| Authenticated user to resources | Role checks and ownership-filtered queries restrict access to the user's permitted records. |
| Application to database | Mongoose schemas, authenticated Atlas access, server-derived ownership and atomic booking transactions protect persistence. |
| Server to response | Safe response objects and controlled errors keep password hashes and internal diagnostic information out of API responses. |

See the [detailed architecture document](docs/architecture/hustlehub-architecture.md) and [editable diagram source](docs/architecture/hustlehub-architecture.mmd).

## Technology Stack

| Area | Technology |
|---|---|
| Frontend | React, React Router, Vite and CSS |
| Backend | Node.js, Express 5 and JavaScript |
| Persistence | MongoDB Atlas and Mongoose |
| Authentication | bcrypt password hashing and JWTs through `jsonwebtoken` |
| API security | Helmet, CSP, CORS, validation, sanitisation and `express-rate-limit` |
| Transport and configuration | Node HTTPS, local development certificates and dotenv |
| Backend testing | Postman collections and Newman with JUnit evidence |
| Frontend testing | Vitest, React Testing Library, user-event and jsdom |

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

## Installation and Configuration

### Prerequisites

- Node.js and npm compatible with the project dependencies.
- Git and OpenSSL.
- A MongoDB Atlas database with database-user credentials and network access configured for the machine running the API.
- Postman Desktop for manual collection runs, if required.

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

Trust `api/certs/localhost-cert.pem` in the local browser/operating system so the React application can call the HTTPS API. In Postman, add the certificate under **Settings > Certificates > CA certificates**. Newman uses `--ssl-extra-ca-certs` through the existing npm script.

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

Demonstration credentials supplied for marking are assessment credentials and will be removed and rotated after marking. The collection itself contains no administrator password or generated JWTs. Backend database credentials, the JWT signing secret and private keys remain outside the frontend and assessment documentation.

## API Endpoints

The default API origin is `https://localhost:4000`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/` | Public | Basic API information. |
| `GET` | `/health` | Public | Availability and HTTP/HTTPS mode. |
| `POST` | `/api/auth/register` | Public | Register a client or freelancer. |
| `POST` | `/api/auth/login` | Public | Authenticate and return a signed JWT with safe user data. |
| `GET` | `/api/auth/me` | Verified JWT | Retrieve the authenticated account's safe profile. |
| `GET` | `/api/gigs` | Public | Browse active marketplace gigs. |
| `GET` | `/api/gigs/mine` | Freelancer | List the freelancer's own active and inactive gigs. |
| `GET` | `/api/gigs/:id` | Public | View an active gig. |
| `POST` | `/api/gigs` | Freelancer | Create a gig owned by the authenticated freelancer. |
| `PUT` | `/api/gigs/:id` | Owning freelancer | Update allowed gig fields. |
| `DELETE` | `/api/gigs/:id` | Owning freelancer | Delete an owned gig. |
| `POST` | `/api/bookings` | Client | Create a booking and its simulated transaction. |
| `GET` | `/api/bookings/mine` | Client | Retrieve the client's own booking history. |
| `GET` | `/api/bookings/freelancer` | Freelancer | Retrieve bookings associated with the freelancer. |
| `GET` | `/api/bookings/:id` | Owning client | Retrieve one owned booking. |
| `GET` | `/api/income/me` | Freelancer | Retrieve income and confirmed transaction count. |
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

Unknown accounts and incorrect passwords receive the same `Invalid credentials` response. JWT application claims contain the user ID and role; the token library adds issue and expiry timestamps. JWTs are signed using the backend-only secret, and protected routes verify the signature and expiry before using the claims.

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

### Run with Newman

Start a fresh API process in one terminal:

```bash
npm --prefix api start
```

In a second terminal at the repository root, supply the administrator password at run time. Replace `<admin-password>` with the assessment password:

```bash
npm --prefix api run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

The JUnit report is written to `evidence/part3/newman/functional-report.xml`.

The script uses the repository collection/environment, trusts `api/certs/localhost-cert.pem`, and runs the CLI and JUnit reporters. The report path is relative to the npm script's `api` working directory. `--silent` suppresses npm's script-command echo.

**Committed Newman evidence:** Part 3 [JUnit report](evidence/part3/newman/functional-report.xml) and [summary](evidence/part3/newman/functional-summary.png). Part 2 [JUnit report](evidence/part2/newman/newman-report.xml), [terminal summary](evidence/part2/newman/newman-summary.png) and [Postman Runner summary](evidence/part2/newman/postman-runner-summary.png).

A successful cycle must complete all eight folders with zero failed assertions and no script errors. The Part 3 cycle records 335 passing assertions. The committed reports and screenshots record the submitted results.

### Repeatability and limiter capacity

Before folder 08, the normal cycle uses eight registration attempts, ten authenticated client booking attempts (including the idempotent replay) and three failed login attempts. Folder 08 deliberately exhausts the remaining login and booking capacity. Its booking probes use an invalid gig ID and create no additional financial records.

Stop the API with `Ctrl+C`, then restart before another complete cycle:

```bash
npm --prefix api start
```

This resets the in-memory counters. A full Postman run and a full Newman run each need their own fresh API process. The database persists across restarts, while unique test accounts prevent fixture collisions. Test accounts and the booking/transaction pair remain available for persistence evidence; the suite removes its captured test gigs during its cleanup checks.

### Real-browser tests (Playwright)

The [`e2e/`](e2e/) suite drives Chromium through the React application against the running HTTPS API and database. It covers registration, gig publishing, booking with confirmation, the income and tax dashboard (checked against an independent SARS calculation), session revocation on sign-out, and failure paths (wrong password, a client opening freelancer pages). It uses isolated, generated accounts and trusts only the local API certificate. With a freshly started API:

```bash
npm --prefix e2e ci
npm --prefix e2e run install:browser
npm --prefix e2e test
```

See [docs/testing/e2e-playwright.md](docs/testing/e2e-playwright.md). Evidence: [JUnit](evidence/part3/e2e/playwright-junit.xml) and [screenshots](evidence/part3/e2e/screenshots/).

### Frontend tests

`client/src/test/app.test.jsx` exercises login feedback, allowed registration roles, marketplace rendering/search, gig form validation, booking confirmation and role-based route behaviour. `client/src/test/api.test.js` checks the shared API service's token/destination behaviour. The frontend tests use jsdom and mocked API responses; the Newman suite separately exercises the real API and database.

Run from the repository root:

```bash
npm --prefix client test
```

To write a JUnit report explicitly into the submitted frontend evidence folder:

```bash
npm --prefix client test -- \
  --reporter=default \
  --reporter=junit \
  --outputFile=../evidence/part2/frontend-tests/react-tests.xml
```

**Committed frontend evidence:** [JUnit report](evidence/part2/frontend-tests/react-tests.xml) and [test summary](evidence/part2/frontend-tests/react-tests-summary.png).

## Assessment Evidence Map

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
| `200 OK` | Successful reads, login, gig updates and deletion confirmations. |
| `201 Created` | Successful registration, gig creation and booking/transaction creation. |
| `400 Bad Request` | Invalid input, malformed JSON or invalid identifier format. |
| `401 Unauthorized` | Invalid credentials or missing/invalid/expired JWT. |
| `403 Forbidden` | Authenticated role is not permitted to perform the operation. |
| `404 Not Found` | Unknown route, missing/unavailable gig, or resource not available to the requesting owner. |
| `409 Conflict` | Duplicate registration email. |
| `413 Payload Too Large` | JSON body exceeds the configured `10kb` limit. |
| `429 Too Many Requests` | Authentication, registration or booking allowance exceeded. |
| `500 Internal Server Error` | Controlled unexpected server failure. |

## Part 3 Direction

Part 2 delivers the full-stack marketplace, persistent financial records, income tracking and the security/testing controls described above.

Part 3 will extend this baseline with estimated tax, Docker-based containerisation, CI/CD for backend and frontend, security/static analysis, event logging and monitoring, and the final security review. Those items are outside the current Part 2 implementation.

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 7519 — JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html)
- [Express error-handling guide](https://expressjs.com/en/guide/error-handling/)
- [Helmet documentation](https://helmet.js.org/)
- [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- [Newman command reference](https://learning.postman.com/docs/reference/newman-cli/newman-options/)
- [Vitest reporters](https://vitest.dev/guide/reporters.html)
