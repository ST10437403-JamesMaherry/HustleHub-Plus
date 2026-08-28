# HustleHub+

**INSY7314 Portfolio of Evidence**

HustleHub+ is a secure freelance marketplace being developed incrementally as part of the INSY7314 Portfolio of Evidence.

The completed platform will allow freelancers to advertise services and clients to browse and book those services. Later POE stages will extend the platform with MongoDB persistence, marketplace functionality, bookings, transaction tracking, freelancer income information, estimated tax calculations, DevSecOps practices, containerization, logging, and monitoring.

---

## Table of Contents

- [Part 1 - Secure Foundations](#part-1---secure-foundations)
- [Technology Stack](#technology-stack)
- [Part 1 Features](#part-1-features)
- [Project Structure](#project-structure)
- [Backend Architecture](#backend-architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Local HTTPS Setup](#local-https-setup)
- [Running the API](#running-the-api)
- [API Endpoints](#api-endpoints)
- [Testing Guide](#testing-guide)
- [Postman Testing](#postman-testing)
- [Security Implementation](#security-implementation)
- [HTTP Status Codes](#http-status-codes)
- [Part 1 Status](#part-1-status)
- [Part 1 Limitations](#part-1-limitations)
- [Part 2 Direction](#part-2-direction)

---

## Part 1 - Secure Foundations

Part 1 establishes the secure backend foundation for HustleHub+ using **Node.js** and **Express**.

The backend is intentionally modular so that MongoDB persistence, the React frontend, role-based authorization, marketplace functionality, DevSecOps controls, and later POE requirements can be added without rewriting the existing authentication contract.

Part 1 now includes the complete backend authentication and security baseline required for the current stage of the project.

---

## Technology Stack

### Current Part 1 Stack

- Node.js
- Express.js
- JavaScript
- dotenv
- bcrypt
- jsonwebtoken
- helmet
- cors
- Node.js Crypto
- HTTPS/TLS
- Git
- GitHub
- Postman
- OpenSSL for local certificate generation

### Planned Later POE Technologies

- MongoDB
- Mongoose
- React
- Role-Based Access Control
- Rate limiting
- Docker
- Docker Compose
- GitHub Actions
- Automated backend and frontend testing
- Static code analysis
- Security scanning
- Logging
- Monitoring

---

## Part 1 Features

The current Part 1 backend includes:

### Backend Foundation

- Node.js backend project
- Express REST API
- Environment-based configuration using `dotenv`
- JSON request handling
- `10kb` JSON request-body limit
- API health-check endpoint
- Modular routes, controllers, middleware, models, and utilities
- Controlled unknown-route handling
- Central error-handling middleware

### User Storage

- Temporary in-memory user storage
- UUID-based user identification
- Normalised email storage and lookup
- User lookup by email
- User lookup by ID
- Password hashes stored instead of plaintext passwords

### Registration

- Public registration for clients and freelancers
- Registration input validation
- Duplicate email prevention
- Public role allow-list
- Rejection of public `admin` registration
- Secure password hashing using bcrypt
- Configurable bcrypt work factor
- Safe registration responses that exclude credentials and password hashes

### Login and Authentication

- Login using registered credentials
- Secure bcrypt password verification
- Generic authentication-failure responses
- Signed JWT generation after successful authentication
- Configurable JWT expiry
- Minimal JWT application payload containing user ID and role
- Bearer-token authentication
- JWT signature and expiry verification
- Protected current-user endpoint
- Rejection of missing, malformed, invalid, tampered, and expired JWTs

### HTTPS and API Security

- Local HTTPS/TLS using a self-signed development certificate
- Environment-controlled HTTP/HTTPS startup
- HTTPS protection for registration, login, and protected routes
- Helmet security headers
- Custom Content Security Policy
- Cross-Origin Resource Policy
- Express `X-Powered-By` header removal
- Environment-controlled CORS
- Restricted allowed HTTP methods
- Restricted allowed request headers
- Oversized JSON payload protection
- Controlled `413 Payload Too Large` handling
- Safe backend integration and regression testing

---

## Project Structure

```text
INSY7314POE/
|
|-- api/
|   |-- controllers/
|   |   `-- authController.js
|   |
|   |-- middleware/
|   |   |-- authMiddleware.js
|   |   |-- errorHandler.js
|   |   |-- validateLogin.js
|   |   `-- validateRegistration.js
|   |
|   |-- models/
|   |   `-- userStore.js
|   |
|   |-- routes/
|   |   `-- authRoutes.js
|   |
|   |-- utils/
|   |   |-- password.js
|   |   `-- token.js
|   |
|   |-- certs/
|   |   |-- localhost-cert.pem
|   |   `-- localhost-key.pem
|   |
|   |-- .env
|   |-- .env.example
|   |-- index.js
|   |-- package.json
|   `-- package-lock.json
|
|-- docs/
|   `-- architecture/
|
|-- evidence/
|   `-- part1/
|
|-- postman/
|
|-- .gitignore
`-- README.md
```

> `.env`, `node_modules`, local certificate files, private keys, logs, and other local/generated files are excluded from Git and must remain local.

---

## Backend Architecture

The backend separates routing, validation, authentication, application logic, security utilities, and temporary storage.

```text
HTTP Request
     |
     v
Helmet / CSP
     |
     v
Controlled CORS
     |
     v
10kb JSON Body Parser
     |
     v
Routes
     |
     v
Validation / Authentication Middleware
     |
     v
Controllers
     |
     |-- Password Utilities
     |-- JWT Utilities
     |
     v
Temporary User Store
     |
     v
HTTP Response
     |
     v
Controlled 404 / Central Error Handler
```

### Routes

Routes define API endpoints and connect middleware to controller functions.

### Middleware

Current middleware performs reusable request-processing tasks including:

- Registration validation
- Login validation
- JWT authentication
- Central error handling

### Controllers

Controllers handle application workflows such as:

- Registering a user
- Logging in a user
- Returning the authenticated user's safe account information

### Models

Part 1 uses an in-memory user-store abstraction rather than MongoDB.

The temporary store is deliberately separated from controller logic so that it can later be replaced with MongoDB and Mongoose without changing the external authentication API.

### Utilities

Security-specific functionality is separated into reusable utilities:

- `password.js` handles password hashing and verification.
- `token.js` handles JWT creation and verification.

### Application Entry Point

`index.js` acts as the backend composition root. It is responsible for:

- Loading environment configuration
- Creating the Express application
- Applying Helmet and Content Security Policy headers
- Applying CORS restrictions
- Applying the JSON request-body limit
- Registering API routes
- Handling unknown routes
- Handling application errors
- Starting the HTTP or HTTPS server

Authentication business logic remains outside `index.js`.

---

## Prerequisites

Before running the project, ensure the following are installed:

- Node.js
- npm
- Git
- OpenSSL
- Postman or another API client for manual API testing

The command examples below use a macOS/Linux-style terminal. On Windows, equivalent commands may be run through Git Bash, WSL, PowerShell, or Postman where appropriate.

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd INSY7314POE
```

If the repository has already been supplied by the lecturer or opened directly from GitHub, continue from the repository root.

### 2. Navigate to the API Directory

```bash
cd api
```

### 3. Install Dependencies

```bash
npm install
```

This installs the dependencies defined in `package.json` and `package-lock.json`.

### 4. Confirm Core Dependencies

Optional verification:

```bash
npm ls express dotenv bcrypt jsonwebtoken helmet cors
```

This confirms that the core Part 1 backend and security packages are installed.

---

## Environment Configuration

### 1. Create the Local Environment File

From inside the `api` directory:

```bash
cp .env.example .env
```

The real `.env` file must remain local and must never be committed to GitHub.

### 2. Configure the Environment Variables

A local Part 1 environment should contain values equivalent to:

```env
PORT=4000
APP_NAME=HustleHubPlusAPI
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
USE_HTTPS=true
SSL_KEY_PATH=./certs/localhost-key.pem
SSL_CERT_PATH=./certs/localhost-cert.pem
BCRYPT_SALT_ROUNDS=12
JWT_SECRET=replace_with_a_long_random_local_secret
JWT_EXPIRES_IN=1h
```

### 3. Generate a JWT Secret

Do not use the placeholder JWT secret.

Generate a strong local value:

```bash
openssl rand -hex 32
```

Copy the generated value into the local `.env` file as `JWT_SECRET`.

Do not place the real secret in:

- `README.md`
- `.env.example`
- source files
- screenshots
- Postman collections committed to the repository

---

## Local HTTPS Setup

Part 1 normally runs over HTTPS using a self-signed development certificate.

### 1. Create the Certificate Directory

From inside `api`:

```bash
mkdir -p certs
```

### 2. Generate a Development Certificate and Private Key

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -subj "/CN=localhost"
```

This creates:

```text
certs/localhost-key.pem
certs/localhost-cert.pem
```

These files are for **local development only** and must never be committed to GitHub.

### 3. Self-Signed Certificate Warning

Because the certificate is self-signed, browsers, curl, and Postman may not trust it automatically.

For command-line testing in this README, `curl -k` is used to allow the local self-signed certificate.

For Postman testing, SSL certificate verification may need to be disabled temporarily for this local development API.

This is acceptable only for the local self-signed development environment. Production deployments must use certificates issued by a trusted Certificate Authority or managed by the deployment platform.

---

## Running the API

From inside the `api` directory:

### Normal Execution

```bash
npm start
```

### Development Mode

```bash
npm run dev
```

Development mode automatically restarts the Node.js process when source files change if the configured development script provides this behaviour.

### Default HTTPS Address

With the supplied Part 1 configuration:

```text
https://localhost:4000
```

### Optional Local HTTP Troubleshooting

Set:

```env
USE_HTTPS=false
```

The API will then start in HTTP mode.

Normal Part 1 testing and demonstration should use HTTPS.

---

## API Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| `GET` | `/` | Public | Returns basic HustleHub+ API information |
| `GET` | `/health` | Public | Confirms that the API is running |
| `POST` | `/api/auth/register` | Public | Registers a new client or freelancer |
| `POST` | `/api/auth/login` | Public | Authenticates a user and returns a signed JWT |
| `GET` | `/api/auth/me` | Bearer JWT | Returns the authenticated user's safe account information |

---

## Testing Guide

The following sequence can be used by the lecturer to install, run, verify, and security-test the Part 1 backend.

Start the API before running the requests below.

### 1. Health Check

```bash
curl -k -i https://localhost:4000/health
```

Expected result:

- HTTP `200 OK`
- JSON response indicating the API is running
- Protocol shown as HTTPS when `USE_HTTPS=true`

Example:

```json
{
  "status": "OK",
  "app": "HustleHubPlusAPI",
  "protocol": "HTTPS"
}
```

### 2. Register a Client

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Client","email":"client@example.com","password":"Password123","role":"client"}' \
  https://localhost:4000/api/auth/register
```

Expected result:

- HTTP `201 Created`
- Safe user information returned
- No plaintext password returned
- No password hash returned

### 3. Register a Freelancer

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Freelancer","email":"freelancer@example.com","password":"Password123","role":"freelancer"}' \
  https://localhost:4000/api/auth/register
```

Expected result:

- HTTP `201 Created`
- Role returned as `freelancer`

### 4. Reject Public Admin Registration

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Admin","email":"admin@example.com","password":"Password123","role":"admin"}' \
  https://localhost:4000/api/auth/register
```

Expected result:

- Controlled HTTP `400 Bad Request`
- Administrator accounts cannot be created through public registration

### 5. Duplicate Email Test

Repeat the client registration request using `client@example.com`.

Expected result:

- HTTP `409 Conflict`

### 6. Login

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"client@example.com","password":"Password123"}' \
  https://localhost:4000/api/auth/login
```

Expected result:

- HTTP `200 OK`
- Signed JWT returned
- Safe user details returned

Copy the returned JWT for the protected-route test.

### 7. Invalid Login - Wrong Password

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"client@example.com","password":"WrongPassword123"}' \
  https://localhost:4000/api/auth/login
```

Expected result:

```json
{
  "error": "Invalid credentials"
}
```

with HTTP `401 Unauthorized`.

### 8. Invalid Login - Unknown Email

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"unknown@example.com","password":"WrongPassword123"}' \
  https://localhost:4000/api/auth/login
```

Expected result:

```json
{
  "error": "Invalid credentials"
}
```

with HTTP `401 Unauthorized`.

The same external response is intentionally used for an unknown account and an incorrect password to reduce account-enumeration information leakage.

### 9. Protected Route Without a Token

```bash
curl -k -i https://localhost:4000/api/auth/me
```

Expected result:

- HTTP `401 Unauthorized`

### 10. Protected Route With an Invalid Token

```bash
curl -k -i \
  -H "Authorization: Bearer invalid-token" \
  https://localhost:4000/api/auth/me
```

Expected result:

- HTTP `401 Unauthorized`

### 11. Protected Route With a Valid Token

Replace `<token>` with the JWT returned by the login endpoint:

```bash
curl -k -i \
  -H "Authorization: Bearer <token>" \
  https://localhost:4000/api/auth/me
```

Expected result:

- HTTP `200 OK`
- Safe authenticated user details
- No password hash returned

### 12. Security Header Test

```bash
curl -k -i https://localhost:4000/health
```

The response should contain security-related headers applied by Helmet. Important Part 1 checks include headers such as:

```text
Content-Security-Policy
Cross-Origin-Resource-Policy
X-Content-Type-Options
X-Frame-Options
Referrer-Policy
Strict-Transport-Security
```

Exact Helmet defaults may vary by installed package version.

The response must **not** expose:

```text
X-Powered-By: Express
```

### 13. Allowed CORS Origin

```bash
curl -k -i \
  -H "Origin: http://localhost:5173" \
  https://localhost:4000/health
```

Expected CORS response:

```text
Access-Control-Allow-Origin: http://localhost:5173
```

### 14. Untrusted CORS Origin

```bash
curl -k -i \
  -H "Origin: https://malicious.example" \
  https://localhost:4000/health
```

The API must not grant `https://malicious.example` browser access.

With the current fixed-origin CORS configuration, the response may contain the configured trusted origin rather than the request origin. The important security property is that the malicious origin is never granted as the allowed origin, so a browser will reject the cross-origin response.

> Postman and curl can inspect CORS headers, but CORS itself is enforced by web browsers.

### 15. Unknown Route Test

```bash
curl -k -i https://localhost:4000/does-not-exist
```

Expected result:

- HTTP `404 Not Found`
- Controlled JSON response

Example:

```json
{
  "error": "Route not found"
}
```

### 16. Malformed JSON Test

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  --data-binary '{"email":"client@example.com",' \
  https://localhost:4000/api/auth/login
```

Expected result:

- HTTP `400 Bad Request`
- Controlled client error response
- No stack trace
- No internal file-system path
- No environment values
- No secret material
- No part of the submitted body repeated back

Example:

```json
{
  "error": "Request body is not valid JSON"
}
```

### 17. Oversized JSON Body Test

Generate a request body larger than the configured `10kb` limit:

```bash
node -e "process.stdout.write(JSON.stringify({data:'A'.repeat(11000)}))" > /tmp/hustlehub-large.json
```

Send it to the API:

```bash
curl -k -i \
  -X POST \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/hustlehub-large.json \
  https://localhost:4000/api/auth/login
```

Expected result:

- HTTP `413 Payload Too Large`
- Controlled JSON error response
- Request rejected before normal authentication processing

### 18. Dependency Security Review

From inside the `api` directory:

```bash
npm audit
```

The output should be reviewed before submission.

Do not automatically run `npm audit fix --force` without reviewing the dependency changes, because forced upgrades may introduce breaking changes.

### 19. Source-Control Secret Check

From the repository root:

```bash
git ls-files | grep -E '(^|/)\.env$|node_modules|certs/|localhost-key.pem'
```

Sensitive local files should not be tracked.

The repository should contain `.env.example`, but not the real `.env` file or local private key.

---

## Postman Testing

Postman is used for positive, negative, authentication, HTTPS, and security-focused testing.

### Recommended Postman Environment

Create environment variables such as:

```text
baseUrl = https://localhost:4000
token = <set after successful login>
```

Do not place a real JWT secret in the Postman environment committed to the repository.

### Local SSL Setting

Because the project uses a self-signed local certificate, Postman's SSL certificate verification may need to be disabled during local Part 1 testing.

### Registration Test Scenarios

- Valid client registration
- Valid freelancer registration
- Missing required field
- Invalid data type
- Whitespace-only value
- Malformed email
- Invalid full-name length
- Password below 8 bytes
- Password above 72 bytes
- Multi-byte password exceeding 72 bytes
- Admin registration attempt
- Unsupported role
- Duplicate email
- Control characters
- Normalised email
- Unexpected additional request properties

### Login Test Scenarios

- Valid login
- Incorrect password
- Unknown email
- Missing email
- Missing password
- Invalid field types
- Case-insensitive email lookup

### JWT Test Scenarios

- Protected route without token
- Malformed Authorization header
- Invalid JWT
- Tampered JWT
- Expired JWT
- Valid JWT

### HTTPS Test Scenarios

- Health endpoint over HTTPS
- Registration over HTTPS
- Login over HTTPS
- Protected route over HTTPS

### Security Hardening Test Scenarios

- Helmet headers present
- Content Security Policy present
- Cross-Origin Resource Policy present
- `X-Powered-By` absent
- Configured frontend CORS origin allowed
- Malicious origin not granted CORS access
- JSON body limit enforced
- Oversized JSON returns controlled `413`
- Unknown route returns controlled `404`
- Malformed JSON does not expose internal details

### Example Postman Header Tests

The following optional Postman test scripts can be added to a request such as `GET /health`:

```javascript
// Confirm that the Content Security Policy header is present.
pm.test('CSP header is present', function () {
  pm.expect(pm.response.headers.has('Content-Security-Policy')).to.be.true;
});

// Confirm that Express implementation details are not exposed.
pm.test('X-Powered-By header is removed', function () {
  pm.expect(pm.response.headers.has('X-Powered-By')).to.be.false;
});
```

---

## Security Implementation

HustleHub+ follows a **secure-by-design** approach. Security controls are integrated into the backend architecture instead of being treated as a final add-on.

### Password Security

Passwords are never stored in plaintext.

```text
Plaintext Password
       |
       v
     bcrypt
       |
       v
Password Hash
       |
       v
Temporary User Store
```

The bcrypt work factor is configured through:

```env
BCRYPT_SALT_ROUNDS=12
```

A secure fallback is used if the configured value is invalid.

During login, the supplied password is verified against the stored hash using bcrypt comparison. Stored hashes are never decrypted.

Passwords and password hashes are never included in API responses.

### Input Validation

Registration input is validated before it reaches the registration controller.

Invalid input is rejected before password hashing and user creation.

Registration validation includes:

- Required-field checks
- Data-type checks
- Full-name length checks
- Email format checks
- Email length checks
- Password byte-length checks
- Public-role allow-list checks
- Control-character rejection
- Filtering of unexpected request properties

#### Full Name

After surrounding whitespace is removed, names must contain between:

```text
2 and 80 characters
```

Legitimate characters such as accents and apostrophes remain supported.

#### Email

Email addresses are:

- Trimmed
- Converted to lowercase
- Limited to 254 characters
- Checked for a valid email-like structure

The backend validates structure rather than proving that a mailbox exists.

#### Password

Passwords must contain between:

```text
8 and 72 bytes
```

Password length is measured using UTF-8 bytes to remain compatible with bcrypt's supported input size.

Passwords are deliberately **not trimmed**. A password supplied during login must therefore match the original registration password exactly.

The current Part 1 policy prioritises password length and allows passphrases rather than enforcing unnecessary composition rules.

#### Public Roles

Public registration accepts only:

```text
client
freelancer
```

`admin` cannot be assigned through the public registration endpoint.

#### Request Filtering

After validation, only the accepted fields continue to the registration controller:

```text
fullName
email
password
role
```

Unexpected properties supplied by the client do not become trusted controller input.

### JWT Authentication

After successful login, HustleHub+ issues a signed JSON Web Token.

The application claims are intentionally minimal:

```text
id
role
```

The token also contains standard issued-at and expiry timestamps generated by the JWT library.

Sensitive data is not placed inside the token.

The JWT does not contain:

- Passwords
- Password hashes
- JWT secrets
- Certificate material

JWTs are signed rather than encrypted. Their payload can be decoded, but modifying the payload invalidates the signature.

The secret is loaded from:

```env
JWT_SECRET
```

Token lifetime is configured using:

```env
JWT_EXPIRES_IN=1h
```

### JWT Verification

Protected routes verify:

- Bearer-token format
- JWT signature
- Token expiry

Only successfully verified claims are attached to the authenticated request.

```text
Authorization Header
        |
        v
Bearer Token Extraction
        |
        v
Signature Verification
        |
        v
Expiry Verification
        |
        v
Verified id + role
        |
        v
Protected Controller
```

### HTTPS and TLS

HustleHub+ uses HTTPS during normal Part 1 development.

HTTPS protects data in transit including:

- Registration credentials
- Login credentials
- JWT access tokens
- Protected API responses

The current certificate is self-signed for local development only.

Production deployments must use trusted production certificates or platform-managed TLS.

### Helmet and Security Headers

The API uses `helmet` to apply security-related HTTP headers.

Part 1 explicitly configures a Content Security Policy and Cross-Origin Resource Policy.

The Content Security Policy restricts content to trusted sources and prevents unnecessary browser content execution or framing behaviour.

The API also disables Express's `X-Powered-By` header to reduce unnecessary implementation disclosure.

### CORS

The permitted browser frontend origin is loaded from:

```env
CLIENT_ORIGIN=http://localhost:5173
```

The current Part 1 API allows only the methods required by implemented endpoints:

```text
GET
POST
```

Allowed request headers are restricted to:

```text
Content-Type
Authorization
```

CORS is a browser-enforced cross-origin access control and is **not** a replacement for authentication or authorisation.

### Request-Body Limit

JSON bodies are limited to:

```text
10kb
```

This reduces oversized-payload abuse and prevents unnecessarily large JSON requests from reaching normal application logic.

Requests above the configured limit are rejected with a controlled `413 Payload Too Large` response.

### Error Handling

All failures are returned through a single error-handling middleware in:

```text
api/middleware/errorHandler.js
```

Two handlers are registered after the application routes:

- A not-found handler, which returns a controlled `404` for any request that does not match a defined route
- A central error handler, which converts every forwarded error into a controlled response

Response bodies are built from a fixed set of client-safe messages rather than from the underlying error. The API therefore does not expose:

- Stack traces
- Internal file-system paths
- Environment values
- JWT secrets
- Certificate paths
- Password hashes
- Database or connection strings

Only recognized client error codes are allowed, any other status gets reported as `500 Internal Server Error`

Error responses are not affected by `NODE_ENV`. Development and production return identical bodies, so a configuration change cannot re-expose internal detail.

Full error details, including the stack, are written to the server log so that failures remain diagnosable:

```text
[error] GET /api/auth/me -> 500
```

The stack is logged rather than the error object. The body parser attaches the rejected request body to parsing errors, and logging that object would write submitted credentials into the log in plain text.

Controllers do not handle unexpected failures themselves. Each one forwards to the error pipeline using:

```text
next(error)
```

This keeps error formatting in a single place and produces consistent responses across every endpoint.

### Environment and Secret Management

Sensitive values are stored in environment variables rather than source code.

The repository includes:

```text
.env.example
```

The real:

```text
.env
```

remains local.

The same rule applies to locally generated certificate and private-key files.

---

## HTTP Status Codes

| Status | Meaning | Current Use |
|---|---|---|
| `200 OK` | Request successful | Health check, login, authenticated user lookup |
| `201 Created` | Resource created | User registration |
| `400 Bad Request` | Invalid request data | Registration/login validation and malformed client input |
| `401 Unauthorized` | Authentication failed | Invalid credentials or invalid/missing JWT |
| `404 Not Found` | Route does not exist | Controlled unknown-route handling |
| `409 Conflict` | Existing state conflicts with request | Duplicate email registration |
| `413 Payload Too Large` | Request body exceeds accepted size | JSON body larger than `10kb` |
| `500 Internal Server Error` | Unexpected internal failure | Controlled server-side error handling |

---

## Part 1 Status

### Backend Foundation

- [x] Express API foundation
- [x] Environment configuration
- [x] Health-check endpoint
- [x] Modular backend structure
- [x] Temporary user-store abstraction
- [x] Controlled unknown-route handling
- [x] Central error handling

### Authentication

- [x] User registration
- [x] Duplicate email prevention
- [x] Password hashing with bcrypt
- [x] Password verification
- [x] User login
- [x] JWT generation
- [x] JWT expiry
- [x] JWT verification
- [x] JWT-protected routes
- [x] Current-user protected endpoint

### Validation and Security

- [x] Registration validation
- [x] Login validation
- [x] Public role allow-list
- [x] Environment-based JWT secret
- [x] Local HTTPS/TLS
- [x] Self-signed development certificate
- [x] Helmet security headers
- [x] Content Security Policy
- [x] Cross-Origin Resource Policy
- [x] Restricted CORS configuration
- [x] Express implementation-header removal
- [x] `10kb` JSON request-body limit
- [x] Controlled oversized-payload handling
- [x] Central error-handling middleware
- [x] Controlled unknown-route handling
- [x] Controlled internal-error handling
- [x] Final backend integration review
- [x] Final security regression review

### Testing

- [x] Registration positive and negative testing
- [x] Login positive and negative testing
- [x] JWT protection testing
- [x] HTTPS regression testing
- [x] Security-header testing
- [x] CORS testing
- [x] Request-body-limit testing
- [x] Unknown-route testing
- [x] Malformed-request review
- [x] Controlled internal-error testing
- [x] Dependency security review
- [x] Full backend integration and regression testing

### Submission Evidence and Documentation

The repository structure reserves locations for final Part 1 evidence and submission artifacts:

```text
docs/architecture/
evidence/part1/
postman/
```

The final submission should include the required architecture diagram, screenshots, Postman artifacts, demonstration material, and any other evidence requested by the module rubric.

---

## Part 1 Limitations

The current implementation deliberately remains within Part 1 scope.

The following functionality is not yet implemented:

- MongoDB persistence
- React frontend
- Gig creation
- Gig browsing
- Bookings
- Transaction records
- Freelancer income tracking
- Tax calculations
- Full Role-Based Access Control
- Docker
- CI/CD
- Static code analysis
- Production deployment
- Logging and monitoring

The temporary user store is intentionally non-persistent. All registered users are removed when the Node.js process restarts.

Client-safe error messages are held in a fixed map inside the error-handling middleware. 
Any status code that is not listed there is reported as `500 Internal Server Error`. 
The map must be extended whenever a new client error response is introduced.

```text
API starts
   |
   v
users = []
   |
   v
Register user
   |
   v
users = [user]
   |
   v
API stops
   |
   v
Memory cleared
   |
   v
API restarts
   |
   v
users = []
```

This is expected Part 1 behaviour.

---

## Part 2 Direction

Part 2 will extend the secure backend foundation into a full MERN application.

Planned progression:

```text
Temporary User Store
        |
        v
MongoDB + Mongoose

Backend API
        +
React Frontend

Authentication
        +
Role-Based Access Control

Users
        +
Gigs
        +
Bookings
        +
Transactions
        +
Income / Tax Information
```

The current backend has been structured so that MongoDB persistence and frontend integration can be introduced without replacing the Part 1 authentication and security contract.

---

## Quick Lecturer Verification Checklist

For a fast review of the completed Part 1 backend:

1. Run `npm install` inside `api`.
2. Copy `.env.example` to `.env`.
3. Generate a local JWT secret.
4. Generate the local self-signed certificate and private key.
5. Confirm `USE_HTTPS=true`.
6. Run `npm start` or `npm run dev`.
7. Open `https://localhost:4000/health` using Postman or `curl -k`.
8. Register a client or freelancer.
9. Log in and copy the returned JWT.
10. Call `/api/auth/me` using `Authorization: Bearer <token>`.
11. Confirm invalid login attempts return the same generic `401` response.
12. Confirm security headers are present and `X-Powered-By` is absent.
13. Confirm CORS uses the configured `CLIENT_ORIGIN`.
14. Confirm an oversized JSON payload returns `413`.
15. Confirm an unknown route returns a controlled `404`.
16. Run `npm audit` and review the dependency-security result.
17. Confirm `.env` and local private-key files are not tracked in Git.
