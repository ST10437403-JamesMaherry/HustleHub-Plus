# HustleHub+

**INSY7314 Portfolio of Evidence - Part 1: Secure Foundations**

## Demonstration Video

[**Watch the HustleHub+ Part 1 demonstration on YouTube**](https://youtu.be/fm5UVAwE3pM)

## Group Members

| Group Member | Student Number | GitHub Username |
|---|---|---|
| James Maherry | ST10437403 | [ST10437403-JamesMaherry](https://github.com/ST10437403-JamesMaherry) |
| Ewald Pagel | ST10257942 | [ST10257942](https://github.com/ST10257942) |
| Mark Mansvelt | ST10438365 | [ST10438365MarkMansvelt](https://github.com/ST10438365MarkMansvelt) |

---

HustleHub+ is a secure freelance marketplace for clients, freelancers, and administrators. The completed platform will allow freelancers to advertise services, clients to make bookings, and the system to record transactions, income, and estimated tax.

Part 1 implements the secure backend foundation: an Express API with registration, login, password hashing, JWT authentication, HTTPS, input validation, security headers, and controlled error responses. MongoDB, the React frontend, marketplace features, RBAC, financial reporting, DevSecOps, and monitoring are introduced in later parts.

## Table of Contents

- [Demonstration Video](#demonstration-video)
- [Group Members](#group-members)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Security Design](#security-design)
- [Installation and HTTPS Setup](#installation-and-https-setup)
- [Postman Testing](#postman-testing)
- [Screenshot Evidence](#screenshot-evidence)
- [Response Status Codes](#response-status-codes)
- [Part 1 Limitations and Part 2 Direction](#part-1-limitations-and-part-2-direction)
- [References](#references)

## Architecture

```mermaid
flowchart LR
    subgraph U["Untrusted zone"]
        USERS["Client / Freelancer / Admin"]
        POSTMAN["Postman test client"]
        REACT["React frontend - Part 2"]
    end

    TLS{{"HTTPS / TLS boundary"}}

    subgraph A["Trusted application server"]
        SEC["Helmet + CSP + CORS"]
        BODY["10 KB JSON limit"]
        ROUTES["Express routes"]
        VALIDATE["Validation + JWT middleware"]
        CTRL["Authentication controllers"]
        BCRYPT["bcrypt hashing"]
        JWT["JWT signing and verification"]
        ERR["Controlled error handler"]
    end

    subgraph D["Data zone"]
        MEMORY["In-memory user store - Part 1"]
        MONGO[("MongoDB - Part 2")]
    end

    USERS --> POSTMAN
    USERS --> REACT
    POSTMAN --> TLS --> SEC --> BODY --> ROUTES --> VALIDATE --> CTRL
    REACT --> TLS
    CTRL --> BCRYPT --> MEMORY
    CTRL --> JWT
    CTRL --> ERR
    MEMORY -.->|"replaced later"| MONGO
```

The main trust boundaries are:

| Boundary | Protection |
|---|---|
| Network | HTTPS encrypts credentials, tokens, and responses in transit. |
| Request | The body limit and validation middleware reject unsafe input before controller processing. |
| Identity | Protected routes verify the Bearer token's signature and expiry. |
| Storage | Only bcrypt password hashes are stored; plaintext passwords are never retained. |
| Response | Fixed client-safe errors prevent stack traces, paths, configuration, and secrets from leaking. |

See [`docs/architecture/hustlehub-architecture.md`](docs/architecture/hustlehub-architecture.md) for the detailed request flow and [`docs/architecture/hustlehub-architecture.mmd`](docs/architecture/hustlehub-architecture.mmd) for the editable diagram source.

## Technology Stack

- Node.js and Express 5
- JavaScript
- bcrypt for password hashing
- JSON Web Tokens through `jsonwebtoken`
- Helmet and Content Security Policy headers
- CORS allow-listing
- HTTPS using Node's built-in `https` module
- dotenv for local configuration
- Postman for endpoint testing
- An in-memory user store for Part 1

## Project Structure

```text
INSY7314POE/
|-- api/
|   |-- controllers/       Authentication workflows
|   |-- middleware/        Validation, JWT protection, and errors
|   |-- models/            Temporary in-memory user store
|   |-- routes/            Authentication routes
|   |-- utils/             bcrypt and JWT helpers
|   |-- .env.example       Safe configuration template
|   |-- index.js           Express and HTTPS entry point
|   `-- package.json
|-- docs/architecture/     Architecture documentation and diagram source
|-- evidence/part1/        Submission evidence
|   `-- screenshots/       Setup, authentication, security, and Postman screenshots
|-- postman/               Collection, environment, and import instructions
|-- .gitignore
`-- README.md
```

Local `.env`, certificate, private-key, dependency, and log files are excluded from Git.

## API Endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/` | Public | Returns basic API information. |
| `GET` | `/health` | Public | Confirms availability and reports HTTP or HTTPS mode. |
| `POST` | `/api/auth/register` | Public | Registers a client or freelancer. |
| `POST` | `/api/auth/login` | Public | Verifies credentials and returns a signed JWT. |
| `GET` | `/api/auth/me` | Bearer JWT | Returns the authenticated user's safe profile. |

### Register

```json
{
  "fullName": "Test Client",
  "email": "client@example.com",
  "password": "Password123!",
  "role": "client"
}
```

Registration applies these rules before hashing or storage:

- All four fields are required and must be strings.
- Names are trimmed, limited to 2-80 characters, and checked for invalid or control characters.
- Emails are trimmed, converted to lowercase, limited to 254 characters, and format-checked.
- Passwords must contain 8-72 UTF-8 bytes and are not trimmed.
- Public roles are limited to `client` and `freelancer`; public `admin` registration is rejected.
- Unexpected properties are removed before the controller runs.
- Duplicate emails return `409 Conflict`.

A successful response contains the new UUID, full name, normalised email, and role. It never contains the password or password hash.

### Login

```json
{
  "email": "client@example.com",
  "password": "Password123!"
}
```

The email is normalised before lookup and the submitted password is compared with the stored bcrypt hash. Unknown users and incorrect passwords both return the generic response below to reduce account-enumeration information:

```json
{
  "error": "Invalid credentials"
}
```

Successful login returns safe user data and a signed JWT. The application-specific token claims are limited to the user's `id` and `role`; the library also adds issued-at and expiry timestamps.

### Protected Profile

Send the token returned by login as:

```text
Authorization: Bearer <token>
```

`GET /api/auth/me` verifies the token signature and expiry on every request, then returns the matching user's safe profile. Missing, malformed, invalid, tampered, and expired tokens are rejected with controlled responses.

## Security Design

### Password Storage

Passwords are hashed with bcrypt before storage and checked with bcrypt comparison during login. The work factor is configured through `BCRYPT_SALT_ROUNDS`; invalid or weak configuration falls back to 12 rounds. The 72-byte maximum is enforced because bcrypt implementations only process a limited input length. See the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

### JWT Authentication

Tokens are signed using the server-only `JWT_SECRET` and expire according to `JWT_EXPIRES_IN`. JWTs are signed, not encrypted, so sensitive values are never placed in the payload. Protected routes trust claims only after verification. JWT structure is defined by [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html).

### HTTPS and Headers

Normal Part 1 execution uses a locally generated self-signed certificate. Helmet adds browser security headers, including a restrictive Content Security Policy and Cross-Origin Resource Policy. Express's `X-Powered-By` header is disabled. Production must use a certificate issued by a trusted Certificate Authority or managed hosting platform.

### CORS and Request Limits

`CLIENT_ORIGIN` defines the browser origin permitted to read API responses. The current API advertises only `GET` and `POST`, with `Content-Type` and `Authorization` request headers. CORS is browser-enforced and does not replace authentication. JSON bodies are limited to `10kb`; oversized bodies receive a controlled `413` response.

### Error Handling

Unknown routes pass to a controlled `404` handler. Other forwarded failures reach the final four-argument Express error middleware, following Express's [error-handling model](https://expressjs.com/en/guide/error-handling/). Client responses use fixed safe messages, while diagnostic details remain in server logs. Responses never intentionally expose stack traces, filesystem paths, environment values, JWT secrets, certificates, or password hashes.

### Secret Management

The real `.env`, JWT secret, SSL key, and certificate remain local and must never be committed, pasted into documentation, or included in screenshots or Postman exports. Only `.env.example` belongs in source control.

## Installation and HTTPS Setup

Prerequisites: Node.js, npm, Git, OpenSSL, and Postman.

From the repository root:

```bash
cd api
npm install
cp .env.example .env
mkdir -p certs
```

Generate a JWT secret and place the result in the local `.env` file:

```bash
openssl rand -hex 32
```

Generate the local development certificate and private key:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout certs/localhost-key.pem -out certs/localhost-cert.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Git Bash users may need `//CN=localhost` for the subject to avoid path rewriting.

The local `.env` should contain:

```env
PORT=4000
APP_NAME=HustleHubPlusAPI
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
USE_HTTPS=true
SSL_KEY_PATH=./certs/localhost-key.pem
SSL_CERT_PATH=./certs/localhost-cert.pem
BCRYPT_SALT_ROUNDS=12
JWT_SECRET=replace_with_your_generated_secret
JWT_EXPIRES_IN=1h
```

Start the API:

```bash
npm start
```

Development mode uses:

```bash
npm run dev
```

The default address is `https://localhost:4000`. The certificate is self-signed, so a local browser or Postman may display a trust warning. HTTP is available only for troubleshooting by setting `USE_HTTPS=false`; the Part 1 demonstration should use HTTPS.

## Postman Testing

The [`postman`](postman/) folder contains:

- `postman_collection.json` - the **HustleHub+ Part 2 - API Tests** collection
- `postman_environment.json` - the **HustleHub+ Part 2 - Local** environment
- Folder details, admin set-up, run instructions and caveats in [`postman/README.md`](postman/README.md)

The collection contains 79 requests grouped by domain and run in order:

| Folder | Requests | Covers |
|---|---|---|
| `01 Health and Security Headers` | 3 | HTTPS, Helmet headers and the CORS allow-list |
| `02 Authentication` | 18 | Admin login, registration, login, invalid login, JWT capture and invalid tokens |
| `03 Gigs` | 21 | Gig browsing, freelancer CRUD, ownership, role checks, sanitisation and validation |
| `04 Bookings` | 13 | Client bookings, simulated transactions, ownership and invalid gigs |
| `05 Income` | 4 | Freelancer income and wrong-role rejection |
| `06 Admin` | 12 | Admin user and booking lists, admin gig removal and rejection of non-admin requests |
| `07 Security and Errors` | 6 | Malformed JSON, unknown routes, oversized bodies and NoSQL operator payloads on login, gigs and bookings |
| `08 Rate Limiting` | 2 | Failed-login rate limiting, `Retry-After` headers and forged `X-Forwarded-For` headers |

Each run generates unique test accounts, so it works against the persistent MongoDB database. Test scripts capture user IDs, JWTs, gig IDs and booking IDs automatically, and every response is checked for leaked stack traces or server internals.

### Admin Account

The admin tests log in as `admin.demo@hustlehub.test`. Public registration rejects the `admin` role, so create the account once per database: register it as a normal user, then set its role in MongoDB. With the API running, in PowerShell 7 (replace `<admin-password>` and use the database named in your `MONGO_URI`):

```powershell
Invoke-RestMethod -Method Post -Uri https://localhost:4000/api/auth/register -SkipCertificateCheck -ContentType 'application/json' -Body (@{ fullName = 'Demo Admin'; email = 'admin.demo@hustlehub.test'; password = '<admin-password>'; role = 'client' } | ConvertTo-Json)
```

```powershell
docker exec hustlehub-mongo mongosh hustlehub-test --quiet --eval "db.users.updateOne({ email: 'admin.demo@hustlehub.test' }, { `$set: { role: 'admin' } })"
```

The backtick before `$set` stops PowerShell expanding it. Restart the API afterwards, because the registration counts towards the register limit.

### Automated Run With Newman

With the API running over HTTPS and the local certificate in `api/certs/`, run the suite from the repository root in PowerShell, passing the admin password at run time:

```powershell
cd api; npm run test:api --silent -- --env-var 'adminPassword=<admin-password>'
```

The admin password is never stored in the collection or environment file. `--silent` stops npm echoing it above the results. If it is missing or the admin login fails, the run stops early with one failure explaining what to fix.

Newman runs every folder, prints the results and writes a JUnit report to `evidence/part2/newman/newman-report.xml`. A valid run finishes with zero failed assertions.

The rate limiters are keyed by IP address and keep their counters in memory. A full run makes 8 of the 10 registrations allowed per hour, 8 of the 10 booking requests allowed per 15 minutes, and 2 failed logins before `08 Rate Limiting` uses up the rest of the 5 failed logins allowed per 15 minutes to confirm the `429` response. Successful logins do not count. Restart the API before running the collection again, because the counters reset on restart; otherwise wait up to 1 hour. If the budget is already used, the run stops at the admin login or the first registration with a message saying to restart the API.

To run the collection in the Postman app instead, import both files, select the environment, set the current value of `adminPassword`, trust `api/certs/localhost-cert.pem` as a CA certificate or temporarily disable SSL verification, and run the collection in its existing order.

## Screenshot Evidence

The screenshots below are stored in [`evidence/part1/screenshots/`](evidence/part1/screenshots/) and referenced using paths relative to this repository-root README.

### Setup and HTTPS

**Fresh Clone Setup**

![Fresh clone setup](evidence/part1/screenshots/NewCloneSetUp.png)

**HTTPS Health Check**

![HTTPS health check](evidence/part1/screenshots/HTTPS_HealthCheck.png)

### Registration

**Successful Registration**

![Successful registration](evidence/part1/screenshots/RegisterSuccess.png)

**Duplicate Registration**

![Duplicate registration test](evidence/part1/screenshots/RegisterDuplicate.png)

### Login

**Successful Login**

![Successful login](evidence/part1/screenshots/LoginSuccessful.png)

**Failed Login**

![Failed login test](evidence/part1/screenshots/LoginFailed.png)

### JWT Authentication

**Valid JWT**

![Protected-route test with a valid JWT](evidence/part1/screenshots/JWT_Valid.png)

**Invalid JWT**

![Protected-route test with an invalid JWT](evidence/part1/screenshots/JWT_Invalid.png)

### Input Validation and Request Limits

**Invalid Field Types**

![Invalid field types test](evidence/part1/screenshots/InvalidFieldTypes.png)

**Malformed JSON**

![Malformed JSON test](evidence/part1/screenshots/Malformed_JSON.png)

**Oversized Request Body**

![Oversized request body test](evidence/part1/screenshots/OversizedBody.png)

### CORS and Security Headers

**Allowed CORS Origin**

![Allowed CORS origin test](evidence/part1/screenshots/CORS_AllowedOrigin.png)

**Untrusted CORS Origin**

![Untrusted CORS origin test](evidence/part1/screenshots/CORS_UntrustedOrigin.png)

**Security Headers — Screenshot 1**

![Security headers screenshot 1](evidence/part1/screenshots/SecurityHeaders1.png)

**Security Headers — Screenshot 2**

![Security headers screenshot 2](evidence/part1/screenshots/SecurityHeaders2.png)

### Postman Collection

**Postman Collection — Screenshot 1**

![Postman collection screenshot 1](evidence/part1/screenshots/PostmanCollection1.jpeg)

**Postman Collection — Screenshot 2**

![Postman collection screenshot 2](evidence/part1/screenshots/PostmanCollection2.jpeg)

## Response Status Codes

| Status | Use |
|---|---|
| `200 OK` | Information, health, login, and authenticated profile responses. |
| `201 Created` | Successful user registration. |
| `400 Bad Request` | Invalid fields or malformed JSON. |
| `401 Unauthorized` | Invalid credentials or missing/invalid JWT. |
| `404 Not Found` | Unknown route. |
| `409 Conflict` | Duplicate email. |
| `413 Payload Too Large` | JSON body exceeds `10kb`. |
| `500 Internal Server Error` | Controlled unexpected server failure. |

## Part 1 Limitations and Part 2 Direction

The Part 1 user store is deliberately temporary: all accounts disappear whenever the API restarts. It is suitable only for demonstrating the secure authentication contract.

Part 2 will replace the store with MongoDB and Mongoose, add the React frontend, enforce full role-based access control, and implement gigs, bookings, simulated transactions, and freelancer income tracking. Later work also adds tax estimates, rate limiting, automated tests, Docker, CI/CD, static analysis, logging, and monitoring.

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 7519 - JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html)
- [Express error-handling guide](https://expressjs.com/en/guide/error-handling/)
- [Helmet documentation](https://helmetjs.github.io/)
