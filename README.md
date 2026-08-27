# HustleHub+

**INSY7314 Portfolio of Evidence**

HustleHub+ is a secure freelance marketplace being developed incrementally as part of the INSY7314 Portfolio of Evidence.

The completed platform will allow freelancers to advertise services and clients to browse and book those services. The system will also support transaction tracking, freelancer income information, and estimated tax calculations in later stages of the POE.

## Part 1 — Secure Foundations

Part 1 focuses on establishing a secure backend foundation using **Node.js** and **Express**.

The backend is being designed using a modular structure so that authentication, security controls, MongoDB persistence, and the React frontend can be added progressively in later parts of the project.

### Current Implementation

The current Part 1 implementation includes:

* Node.js backend project
* Express API
* Environment-based configuration using `dotenv`
* JSON request handling
* API health-check endpoint
* Temporary in-memory user store
* UUID-based user identification
* Normalized email storage and lookup
* Separation of backend responsibilities into routes, controllers, middleware, and models
* Public user registration for clients and freelancers
* Duplicate email prevention
* Secure password hashing using bcrypt
* Registration input validation
* Safe registration responses that exclude credentials and password hashes
* User login using registered credentials
* Secure password verification using bcrypt
* JWT generation after successful authentication
* Minimal JWT payload containing user ID and role
* Generic authentication failure responses

Authentication and additional security controls will be added incrementally during Part 1.

## Technology Stack

### Current

* Node.js
* Express.js
* dotenv
* JavaScript
* Git and GitHub
* Postman

### Later POE Stages

* MongoDB
* React
* JWT authentication
* Docker
* GitHub Actions
* Automated testing and security analysis
* Logging and monitoring

## Project Structure

```text
INSY7314POE/
│
├── api/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   │   └── userStore.js
│   ├── routes/
│   ├── certs/
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

> The `.env` file, local certificates, `node_modules`, and other sensitive or generated files are excluded from Git.

## Running the API

### 1. Navigate to the API directory

```bash
cd api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the local environment file

Copy the example configuration:

```bash
cp .env.example .env
```

Environment values must be configured locally and should never be committed to the repository.

### 4. Start the API

For normal execution:

```bash
npm start
```

For development with automatic restart when files change:

```bash
npm run dev
```

The API currently runs on:

```text
http://localhost:4000
```

## Current API Endpoints

| Method | Endpoint  | Description                              |
| ------ | --------- | ---------------------------------------- |
| GET    | `/`       | Returns basic HustleHub+ API information |
| GET    | `/health` | Confirms that the backend API is running |
| POST | `/api/auth/register` | Registers a new client or freelancer |
| POST | `/api/auth/login` | Authenticates a user and returns a signed JWT |

Example health response:

```json
{
  "status": "OK",
  "app": "HustleHubPlusAPI"
}
```

## Temporary User Storage

Part 1 currently uses an in-memory user store.

The store supports:

* Creating users
* Generating unique user IDs
* Looking users up by email
* Looking users up by ID
* Normalising email addresses
* Receiving a `passwordHash` rather than a plaintext password

The temporary store will later be replaced by MongoDB persistence as the application progresses through the POE.

Because the current storage is in memory, user data is reset whenever the Node.js process restarts.

## Security Approach

HustleHub+ is being developed using a **secure-by-design** approach.

Security functionality will be introduced incrementally throughout Part 1, including:

* Input validation
* Secure password hashing
* JWT-based authentication
* Protected API routes
* HTTPS/TLS
* Controlled error handling
* Security-related HTTP headers
* Secure management of environment variables and secrets

### Password Security

HustleHub+ never stores user passwords in plaintext.

Passwords received during registration are passed through bcrypt before reaching the user store. The application uses a configurable bcrypt work factor with a secure default of 12 rounds.

Only the resulting password hash is retained. Passwords and password hashes are never included in registration responses.

Password verification is performed using bcrypt comparison rather than attempting to decrypt stored hashes.

### Input Validation

All registration input is validated by middleware before it reaches the
authentication controller. Invalid requests are rejected with a `400 Bad Request`
response and never reach the password hashing utility or the user store.

Registration input is checked for:

* Presence of all required fields
* Correct data types, so that values such as objects and numbers are rejected
* Full name length, between 2 and 80 characters once whitespace is removed
* Email address structure, with a maximum length of 254 characters
* Password length, between 8 and 72 bytes
* Membership of the public role allow-list

Full name, email address, and role values are trimmed, and email addresses and
roles are normalised to lowercase. Passwords are never trimmed, so that the value
stored at registration is byte-identical to the value supplied at login. The
validated values then replace the original request body, so the controller cannot
receive additional properties supplied by the client.

Password length is measured in bytes rather than characters because bcrypt reads
only the first 72 bytes of a password and discards the remainder without raising
an error. A character-based limit would allow a longer multi-byte password to be
silently truncated. No character composition rules are applied, following NIST
SP 800-63B, which recommends length and screening over composition requirements.

Client and freelancer accounts may be created publicly. The admin role exists in
the system but is excluded from the registration allow-list, so an administrative
account cannot be created by a public request.

Control characters are rejected in the full name and email address. They serve no
legitimate purpose in either field and allow forged entries to be written into log
output once logging is introduced.

The email pattern confirms the structure of an address rather than its
deliverability, and HTML characters are not stripped, because the API returns JSON
and output encoding is the responsibility of the frontend. Both are deliberate
decisions to revisit alongside schema validation in Part 2.

Sensitive configuration such as secrets and local certificate material must never be committed to GitHub.

### JWT Authentication

After successful login, HustleHub+ issues a signed JSON Web Token (JWT).

The token contains only the authenticated user's ID and role. The JWT secret is loaded from environment configuration and is never stored directly in source code.

Tokens have a limited lifetime configured using `JWT_EXPIRES_IN`.

The application returns the same `401 Invalid credentials` response when either the email address is unknown or the password is incorrect. This avoids exposing whether a particular account exists.

## Part 1 Development Status

* [x] Express API foundation
* [x] Environment configuration
* [x] Health-check endpoint
* [x] Temporary user-store abstraction
* [x] User registration
* [x] Password hashing with bcrypt
* [X] Input validation
* [x] User login
* [x] JWT generation
* [x] User login
* [x] JWT generation
* [ ] JWT-protected routes
* [ ] Controlled error handling
* [ ] Local HTTPS
* [ ] Security headers
* [ ] Postman test collection
* [ ] MERN architecture diagram
* [ ] Part 1 evidence and screenshots
* [ ] Demonstration video
* [ ] Final Part 1 security documentation

## Team

HustleHub+ is being developed as a group project for **INSY7314 — Information Systems 3D**.

Further technical and security documentation will be added to this README as Part 1 development progresses.
