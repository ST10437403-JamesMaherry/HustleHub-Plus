# HustleHub+

**INSY7314 Portfolio of Evidence**

HustleHub+ is a secure freelance marketplace being developed incrementally as part of the INSY7314 Portfolio of Evidence.

The completed platform will allow freelancers to advertise services and clients to browse and book those services. Later stages of the POE will extend the platform with MongoDB persistence, marketplace functionality, bookings, transaction tracking, freelancer income information, estimated tax calculations, DevSecOps practices, containerisation, logging, and monitoring.

---

## Part 1 — Secure Foundations

Part 1 focuses on establishing a secure backend foundation using **Node.js** and **Express**.

The backend is designed using a modular structure so that authentication, security controls, MongoDB persistence, and the React frontend can be introduced progressively without requiring the existing authentication flow to be rewritten.

The current Part 1 implementation includes:

- Node.js backend project
- Express API
- Environment-based configuration using `dotenv`
- JSON request handling
- API health-check endpoint
- Temporary in-memory user storage
- UUID-based user identification
- Normalised email storage and lookup
- Separation of routes, controllers, middleware, models, and utilities
- Public registration for clients and freelancers
- Duplicate email prevention
- Secure password hashing using bcrypt
- Configurable bcrypt work factor
- Registration input validation
- Safe registration responses that exclude credentials and password hashes
- User login using registered credentials
- Secure password verification using bcrypt
- JWT generation after successful authentication
- Minimal JWT payload containing only user ID and role
- Generic authentication failure responses
- JWT verification middleware
- Bearer-token authentication
- Protected current-user endpoint
- Rejection of missing, malformed, invalid, tampered, and expired JWTs
- Local HTTPS/TLS using a self-signed development certificate
- Environment-controlled HTTP/HTTPS startup
- HTTPS protection for registration, login, and protected routes

Additional security controls, testing, evidence, and documentation will continue to be added during Part 1.

---

# Technology Stack

## Current

- Node.js
- Express.js
- JavaScript
- dotenv
- bcrypt
- jsonwebtoken
- Node.js Crypto
- HTTPS/TLS
- Git
- GitHub
- Postman

## Later POE Stages

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

# Project Structure

```text
INSY7314POE/
│
├── api/
│   ├── controllers/
│   │   └── authController.js
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── validateLogin.js
│   │   └── validateRegistration.js
│   │
│   ├── models/
│   │   └── userStore.js
│   │
│   ├── routes/
│   │   └── authRoutes.js
│   │
│   ├── utils/
│   │   ├── password.js
│   │   └── token.js
│   │
│   ├── certs/
│   │   ├── localhost-cert.pem
│   │   └── localhost-key.pem
│   │
│   ├── .env
│   ├── .env.example
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── docs/
│   └── architecture/
│
├── evidence/
│   └── part1/
│
├── postman/
│
├── .gitignore
└── README.md
```

> `.env`, `node_modules`, local certificate files, private keys, logs, and other local or generated files are excluded from Git.

---

# Backend Architecture

The backend follows a modular structure with responsibilities separated between different layers.

```text
HTTP Request
     │
     ▼
Routes
     │
     ▼
Validation / Authentication Middleware
     │
     ▼
Controllers
     │
     ├── Password Utilities
     ├── JWT Utilities
     │
     ▼
Temporary User Store
     │
     ▼
HTTP Response
```

### Routes

Routes define the API endpoints and determine which middleware and controller functions handle each request.

### Middleware

Middleware performs reusable request-processing tasks before controller logic executes.

Current middleware includes:

- Registration validation
- Login validation
- JWT authentication

### Controllers

Controllers contain application workflows such as:

- User registration
- User login
- Retrieving the authenticated user's account

### Models

Part 1 uses an in-memory user-store abstraction rather than MongoDB.

The store is intentionally separated from controller logic so that it can later be replaced with MongoDB and Mongoose without redesigning the authentication API.

### Utilities

Security-specific functionality is separated into reusable utilities:

- `password.js` handles password hashing and verification.
- `token.js` handles JWT creation and verification.

---

# Running the API

## 1. Clone the repository

```bash
git clone <repository-url>
cd INSY7314POE
```

---

## 2. Navigate to the API directory

```bash
cd api
```

---

## 3. Install dependencies

```bash
npm install
```

---

## 4. Create the local environment file

Copy the supplied example configuration:

```bash
cp .env.example .env
```

The actual `.env` file must remain local and must never be committed to GitHub.

A local environment may contain:

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

Generate a secure JWT secret locally rather than using the placeholder value.

For example:

```bash
openssl rand -hex 32
```

The generated value must only be placed in the local `.env` file.

---

# Local HTTPS Setup

Part 1 runs over HTTPS using a self-signed development certificate.

From inside the `api` directory:

```bash
mkdir -p certs
```

Generate the certificate and private key:

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

These files are for **local development only** and must not be committed to GitHub.

Because the certificate is self-signed, browsers and Postman may not trust it automatically.

For local Postman testing, SSL certificate verification may need to be disabled.

This should only be done for the local self-signed development certificate and is not appropriate production behaviour.

---

# Starting the API

## Normal execution

```bash
npm start
```

## Development mode

```bash
npm run dev
```

Development mode automatically restarts the Node.js application when source files change.

With HTTPS enabled, the API runs at:

```text
https://localhost:4000
```

HTTP mode remains available for local troubleshooting by setting:

```env
USE_HTTPS=false
```

Normal Part 1 testing and demonstration should use HTTPS.

---

# API Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| GET | `/` | Public | Returns basic HustleHub+ API information |
| GET | `/health` | Public | Confirms that the API is running |
| POST | `/api/auth/register` | Public | Registers a new client or freelancer |
| POST | `/api/auth/login` | Public | Authenticates a user and returns a signed JWT |
| GET | `/api/auth/me` | Bearer JWT | Returns the authenticated user's safe account information |

---

# Health Check

Request:

```http
GET https://localhost:4000/health
```

Example response:

```json
{
  "status": "OK",
  "app": "HustleHubPlusAPI",
  "protocol": "HTTPS"
}
```

---

# User Registration

Users may register as either:

- `client`
- `freelancer`

Public requests cannot create administrator accounts.

Example request:

```http
POST https://localhost:4000/api/auth/register
```

```json
{
  "fullName": "James Maherry",
  "email": "james@example.com",
  "password": "Password123",
  "role": "client"
}
```

Example successful response:

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "generated-user-id",
    "fullName": "James Maherry",
    "email": "james@example.com",
    "role": "client"
  }
}
```

The API never returns:

- plaintext passwords
- password hashes
- JWT secrets
- private certificate material

Duplicate email addresses return:

```text
409 Conflict
```

---

# User Login

Example request:

```http
POST https://localhost:4000/api/auth/login
```

```json
{
  "email": "james@example.com",
  "password": "Password123"
}
```

Example successful response:

```json
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": "generated-user-id",
    "fullName": "James Maherry",
    "email": "james@example.com",
    "role": "client"
  }
}
```

The same external authentication failure is used for:

- unknown email addresses
- incorrect passwords

Example:

```json
{
  "error": "Invalid credentials"
}
```

with:

```text
401 Unauthorized
```

This reduces the amount of information exposed about whether a specific account exists.

---

# Protected Routes

Protected HustleHub+ routes require a JWT in the HTTP `Authorization` header using the Bearer scheme.

```text
Authorization: Bearer <token>
```

Authentication middleware performs the following process:

```text
Authorization Header
        │
        ▼
Bearer Token Extraction
        │
        ▼
JWT Signature Verification
        │
        ▼
JWT Expiry Verification
        │
        ▼
Verified User ID + Role
        │
        ▼
Protected Controller
```

Missing, malformed, invalid, tampered, and expired JWTs are rejected with controlled `401 Unauthorized` responses.

---

# Current User Endpoint

Request:

```http
GET https://localhost:4000/api/auth/me
```

Header:

```text
Authorization: Bearer <token>
```

Example response:

```json
{
  "user": {
    "id": "generated-user-id",
    "fullName": "James Maherry",
    "email": "james@example.com",
    "role": "client"
  }
}
```

The stored password hash is never returned.

---

# Temporary User Storage

Part 1 currently uses an in-memory user store.

The user structure contains:

```text
id
fullName
email
passwordHash
role
```

It deliberately does not contain a plaintext password field.

The store supports:

- Creating users
- Generating unique UUID identifiers
- Looking users up by email
- Looking users up by ID
- Normalising email addresses
- Retaining password hashes rather than plaintext credentials

Because the store exists only in Node.js process memory, users are removed whenever the API restarts.

For example:

```text
API starts
   ↓
users = []

Register user
   ↓
users = [user]

API stops
   ↓
memory cleared

API restarts
   ↓
users = []
```

This limitation is intentional for Part 1.

MongoDB persistence will replace the temporary store during a later POE stage.

---

# Security Approach

HustleHub+ is being developed using a **secure-by-design** approach.

Security controls are introduced as part of the backend architecture rather than being added only after application functionality has been completed.

Current security controls include:

- Input validation
- Password hashing
- Password verification
- JWT authentication
- JWT expiry
- Protected API routes
- HTTPS/TLS
- Environment-based secret handling
- Public role restrictions
- Safe authentication responses
- Controlled handling of invalid authentication tokens

Further Part 1 controls will include:

- Central error handling
- Security-related HTTP headers
- Content Security Policy
- Restricted CORS
- Request-body limits

---

# Password Security

HustleHub+ never stores user passwords in plaintext.

During registration:

```text
Plaintext Password
       │
       ▼
bcrypt
       │
       ▼
Password Hash
       │
       ▼
User Store
```

The password is passed through bcrypt before reaching the user store.

The application uses a configurable bcrypt work factor:

```env
BCRYPT_SALT_ROUNDS=12
```

A secure fallback of 12 rounds is used when the configured value is invalid.

Only the resulting password hash is retained.

Passwords and password hashes are never included in authentication responses.

During login, bcrypt performs a secure comparison:

```text
Submitted Password
       │
       ▼
bcrypt.compare()
       │
       ├── match    → authentication continues
       │
       └── no match → 401 Invalid credentials
```

Stored password hashes are never decrypted.

---

# Input Validation

Registration input is validated before it reaches the authentication controller.

Invalid requests are rejected with:

```text
400 Bad Request
```

and do not reach password hashing or user storage logic.

## Registration Validation

Registration input is checked for:

- Presence of all required fields
- Correct data types
- Full-name length
- Email structure
- Email length
- Password byte length
- Public role allow-list membership
- Control characters

### Full Name

Full names must contain between:

```text
2 and 80 characters
```

after surrounding whitespace is removed.

Names containing legitimate characters such as accented characters and apostrophes remain supported.

### Email

Email addresses are:

- trimmed
- converted to lowercase
- limited to 254 characters
- checked for a valid email-like structure

The validation confirms address structure rather than whether the mailbox actually exists.

### Password

Passwords must contain between:

```text
8 and 72 bytes
```

Password length is measured using UTF-8 bytes rather than only JavaScript character count.

This prevents input from exceeding bcrypt's supported password input size.

Passwords are deliberately **not trimmed**.

A password entered during login must therefore be byte-identical to the password originally submitted during registration.

No mandatory uppercase, lowercase, number, or special-character composition rules are currently imposed.

The current policy prioritises password length while allowing users to choose longer passphrases.

### Role

Public registration accepts only:

```text
client
freelancer
```

The `admin` role cannot be assigned through the public registration endpoint.

This prevents a user from creating their own administrative account.

### Control Characters

Control characters are rejected in:

- full names
- email addresses

These values serve no legitimate purpose in those fields and could interfere with future logging or structured output.

### Request Filtering

After validation, the middleware replaces the original request body with only the validated fields:

```text
fullName
email
password
role
```

Unexpected additional properties supplied by the client therefore do not reach the authentication controller.

Backend validation remains authoritative and does not rely on frontend validation.

Context-specific sanitisation and safe frontend output handling will continue to be introduced as the application grows.

---

# JWT Authentication

After successful login, HustleHub+ issues a signed JSON Web Token.

The JWT contains only:

```text
id
role
issued-at timestamp
expiry timestamp
```

Sensitive data is not placed inside the token.

The token does not contain:

- password
- password hash
- JWT secret
- certificate material

JWTs are **signed rather than encrypted**.

The payload can therefore be decoded, but it cannot be modified without invalidating the signature.

The JWT secret is loaded from:

```env
JWT_SECRET
```

and must never be hardcoded into source files.

Token lifetime is configured using:

```env
JWT_EXPIRES_IN=1h
```

A limited token lifetime reduces the amount of time in which a compromised token could be reused.

---

# JWT Verification

Protected routes do not trust a token simply because it can be decoded.

The authentication middleware verifies:

- token format
- JWT signature
- token expiry

Only after successful verification are the authenticated user's ID and role attached to the request.

```text
JWT
 │
 ▼
Signature Verification
 │
 ▼
Expiry Verification
 │
 ▼
Verified Claims
 │
 ▼
req.auth
```

A modified or expired JWT is rejected.

---

# HTTPS and TLS

HustleHub+ runs over HTTPS during normal Part 1 development.

HTTPS protects information travelling between API clients and the backend, including:

- registration credentials
- login credentials
- JWT access tokens
- protected API responses

The local development environment uses a self-signed certificate.

Because this certificate is not issued by a publicly trusted Certificate Authority, browsers and API clients may display certificate warnings.

This is expected for local development.

Production deployments must use certificates issued by a trusted Certificate Authority or managed by the hosting environment.

HTTP remains available only as an explicit local troubleshooting mode.

---

# Environment and Secret Management

Configuration is separated from source code using environment variables.

Sensitive values must never be hardcoded.

Examples include:

```text
JWT_SECRET
certificate paths
environment-specific configuration
```

The repository contains:

```text
.env.example
```

to document required environment variables.

The real:

```text
.env
```

file remains local and is excluded by `.gitignore`.

Local certificates and private keys are also excluded from source control.

---

# Postman Testing

Postman is used to test API functionality and security behaviour.

The final Part 1 collection will include positive, negative, and security-focused scenarios.

Current test scenarios include:

## Registration

- Valid client registration
- Valid freelancer registration
- Missing registration field
- Invalid data types
- Whitespace-only values
- Malformed email
- Invalid full-name length
- Password below 8 bytes
- Password above 72 bytes
- Multi-byte password exceeding 72 bytes
- Admin registration attempt
- Duplicate email
- Control characters
- Normalised email
- Additional request properties

## Login

- Valid login
- Incorrect password
- Unknown email
- Missing email
- Missing password
- Invalid field types
- Case-insensitive email lookup

## JWT Protection

- Protected route without token
- Malformed Authorization header
- Invalid JWT
- Tampered JWT
- Expired JWT
- Valid JWT

## HTTPS

- Health endpoint over HTTPS
- Registration over HTTPS
- Login over HTTPS
- Protected route over HTTPS

---

# Current HTTP Status Codes

| Status | Meaning | Current Use |
|---|---|---|
| `200 OK` | Request successful | Login, health check, protected user lookup |
| `201 Created` | Resource successfully created | User registration |
| `400 Bad Request` | Invalid request data | Registration/login validation |
| `401 Unauthorized` | Authentication failed | Invalid login or JWT |
| `409 Conflict` | Resource conflicts with existing state | Duplicate email |

Additional controlled error responses will be added with the central error-handling implementation.

---

# Development Workflow

The project uses GitHub issues and pull requests to track development.

Work is completed using short-lived branches and merged into the `dev` integration branch through reviewed pull requests.

Examples:

```text
feature/3-user-registration
security/4-password-security
feature/5-login-jwt
security/6-jwt-protection
security/7-local-https
```

Each major feature or security control is linked to a GitHub issue.

Pull requests use issue-closing references such as:

```text
Closes #6
```

so completed issues are automatically closed when their implementation is merged.

The `main` branch remains the stable release branch.

---

# Part 1 Development Status

## Backend Foundation

- [x] Express API foundation
- [x] Environment configuration
- [x] Health-check endpoint
- [x] Modular backend structure
- [x] Temporary user-store abstraction

## Authentication

- [x] User registration
- [x] Duplicate email prevention
- [x] Password hashing with bcrypt
- [x] Password verification
- [x] User login
- [x] JWT generation
- [x] JWT verification
- [x] JWT-protected routes
- [x] Current-user protected endpoint

## Validation and Security

- [x] Registration validation
- [x] Login validation
- [x] Public role allow-list
- [x] Environment-based JWT secret
- [x] Local HTTPS/TLS
- [x] Self-signed development certificate
- [ ] Central controlled error handling
- [ ] Helmet security headers
- [ ] Content Security Policy
- [ ] Restricted CORS configuration
- [ ] JSON request-body limit

## Testing and Evidence

- [ ] Final Postman collection
- [ ] Final Postman environment
- [ ] Security-header tests
- [ ] MERN architecture diagram
- [ ] Part 1 screenshots
- [ ] Demonstration video
- [ ] Final rubric review

## Documentation

- [x] Project overview
- [x] Backend architecture
- [x] Setup instructions
- [x] Authentication explanation
- [x] Password-security explanation
- [x] Input-validation explanation
- [x] JWT explanation
- [x] HTTPS explanation
- [ ] Security-header documentation
- [ ] Final evidence links
- [ ] Final demonstration link

---

# Part 1 Limitations

The current implementation deliberately remains within Part 1 scope.

The following are not yet implemented:

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

These features will be introduced progressively during later POE stages.

---

# Part 2 Direction

Part 2 will extend the secure backend foundation into a full MERN application.

Planned changes include:

```text
Temporary User Store
        ↓
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
Bookings
Transactions
Income
```

The current backend structure has been designed so that these additions can be introduced without replacing the existing authentication contract.
