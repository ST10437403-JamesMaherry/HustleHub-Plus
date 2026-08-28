# HustleHub+ System Architecture

This document records the HustleHub+ MERN architecture, its security controls,
and its trust boundaries. Components marked **PART 2** are planned rather than
implemented, and are drawn with a dashed outline.

The diagram source is also available as
[`hustlehub-architecture.mmd`](hustlehub-architecture.mmd).

---

## System Architecture and Trust Boundaries

```mermaid
flowchart TB

    subgraph UNTRUSTED["UNTRUSTED ZONE : Public Internet"]
        direction TB

        subgraph ACTORS["System Actors"]
            CLIENT["Client<br/>browses and books gigs"]
            FREELANCER["Freelancer<br/>advertises gigs, views income"]
            ADMIN["Admin<br/>assigned server side only"]
        end

        subgraph CLIENTS["Client Applications"]
            REACT["React Frontend<br/>PART 2"]
            TOOLS["Postman / curl<br/>Part 1 test client"]
        end
    end

    TLS{{"TRUST BOUNDARY<br/>HTTPS / TLS<br/>self signed certificate, local development"}}

    subgraph TRUSTED["TRUSTED ZONE : Application Server"]
        subgraph RUNTIME["Node.js Runtime"]
            subgraph API["Express API"]
                HEADERS["Security Headers<br/>Helmet, CSP, CORS allow list<br/>x-powered-by removed"]
                LIMIT["Request Body Limit<br/>10kb JSON"]
                VALIDATE["Input Validation Middleware<br/>presence, type, length, format<br/>public role allow list"]
                JWTMW["JWT Verification Middleware<br/>protected routes only"]
                CTRL["Controllers<br/>register, login, profile"]
                ERRORS["Controlled Error Handling<br/>fixed safe messages<br/>404 and 500, no internal detail"]
            end
            BCRYPT["bcrypt Password Hashing<br/>12 salt rounds"]
            JWTGEN["JWT Issuing<br/>signed with server secret<br/>id and role claims"]
        end
    end

    subgraph DATA["DATA ZONE"]
        STORE["Temporary User Store<br/>in memory, non persistent<br/>PART 1"]
        MONGO[("MongoDB Atlas<br/>PART 2")]
    end

    ACTORS --> CLIENTS
    CLIENTS -->|"HTTPS request"| TLS
    TLS --> HEADERS
    HEADERS --> LIMIT
    LIMIT --> VALIDATE
    VALIDATE --> JWTMW
    JWTMW --> CTRL
    CTRL --> BCRYPT
    CTRL --> JWTGEN
    BCRYPT --> STORE
    CTRL --> STORE
    CTRL -.->|"replaces the store in Part 2"| MONGO
    CTRL --> ERRORS
    ERRORS -->|"controlled JSON response"| TLS
    JWTGEN -->|"signed token returned to client"| TLS

    classDef future fill:#f1f1f1,stroke:#9a9a9a,stroke-width:1px,stroke-dasharray:5 4,color:#4a4a4a
    classDef security fill:#fff3e0,stroke:#c26a00,stroke-width:1px,color:#5a3000
    classDef boundary fill:#ffe9e9,stroke:#c0392b,stroke-width:2px,color:#6b1b12
    classDef store fill:#e8f2ff,stroke:#2a6fb5,stroke-width:1px,color:#123a63
    classDef actor fill:#eef7ee,stroke:#3d7a3d,stroke-width:1px,color:#1e3d1e

    class REACT,MONGO future
    class HEADERS,LIMIT,VALIDATE,JWTMW,ERRORS,BCRYPT,JWTGEN security
    class TLS boundary
    class STORE store
    class CLIENT,FREELANCER,ADMIN,TOOLS actor
```

---

## Legend

| Style | Meaning |
|---|---|
| Green | System actor or client tool |
| Orange | Security control implemented in Part 1 |
| Red | Trust boundary crossing |
| Blue | Data storage |
| Grey, dashed | Planned for Part 2, not yet implemented |

---

## Trust Boundaries

| Boundary | Separates | Control applied at the crossing |
|---|---|---|
| Network boundary | Public internet from the application server | HTTPS/TLS encrypts all traffic. Helmet applies security headers and CORS restricts which browser origin may read responses. |
| Request boundary | Untrusted request data from application logic | Body size limit, then input validation middleware. Malformed or oversized requests are rejected before any controller runs. |
| Identity boundary | Anonymous requests from authenticated ones | JWT verification middleware. Protected routes require a valid signed token before the controller executes. |
| Storage boundary | Application logic from stored credentials | bcrypt hashes every password before storage. Plaintext passwords are never written or returned. |
| Response boundary | Internal failures from client responses | Central error handler replaces every error with a fixed client-safe message. |

---

## Components

### Actors

| Component | Status | Notes |
|---|---|---|
| Client | Part 1 | Registers publicly. Browses and books gigs in later parts. |
| Freelancer | Part 1 | Registers publicly. Advertises gigs and views income in later parts. |
| Admin | Part 1 | Recognised by the system but excluded from the public registration allow-list. Assigned server side only. |

### Presentation

| Component | Status | Notes |
|---|---|---|
| React frontend | Part 2 | Will consume the API over HTTPS. The CORS allow-list and CSP `connect-src` are already configured for its origin. |
| Postman / curl | Part 1 | Current client for functional, negative and security testing. |

### Application

| Component | Status | Notes |
|---|---|---|
| Node.js | Part 1 | Server runtime. |
| Express | Part 1 | Routing, middleware pipeline and request handling. |
| Security headers | Part 1 | Helmet with a Content Security Policy, Cross-Origin Resource Policy, restricted CORS, and removal of the `x-powered-by` header. |
| Request body limit | Part 1 | JSON bodies limited to 10kb. |
| Input validation | Part 1 | Presence, type, length, format and role allow-list checks. Runs before controller logic. |
| JWT | Part 1 | Signed on successful login with id and role claims. Verified on protected routes. |
| bcrypt | Part 1 | Password hashing with 12 salt rounds. |
| Controlled errors | Part 1 | Central error middleware and a controlled unknown-route handler. |

### Data

| Component | Status | Notes |
|---|---|---|
| Temporary user store | Part 1 | In-memory. Non-persistent by design. Cleared when the process restarts. |
| MongoDB Atlas | Part 2 | Will replace the temporary store. Mongoose schemas will add a second validation layer behind the existing middleware. |

---

## Request Pipeline

The order of the middleware chain is itself a security control. Each stage
rejects invalid requests before the next stage runs, so untrusted input never
reaches password hashing or storage.

```mermaid
sequenceDiagram
    autonumber
    participant U as Client / Freelancer
    participant T as HTTPS / TLS
    participant H as Security Headers
    participant V as Input Validation
    participant J as JWT Middleware
    participant C as Controller
    participant B as bcrypt
    participant S as User Store
    participant E as Error Handler

    U->>T: POST /api/auth/register
    T->>H: decrypted request
    H->>V: headers applied, body limit checked
    V-->>U: 400 controlled validation error
    V->>C: normalised request body
    C->>B: hash password
    B->>S: store user record
    S-->>C: created user
    C-->>U: 201 without password or hash

    U->>T: GET /api/auth/me
    T->>H: decrypted request
    H->>J: Bearer token present
    J-->>U: 401 controlled auth error
    J->>C: verified id and role claims
    C-->>U: 200 safe account fields

    Note over E: any unhandled failure is<br/>converted to a controlled<br/>404 or 500 response
    C->>E: next(error)
    E-->>U: 500 Internal server error
```
