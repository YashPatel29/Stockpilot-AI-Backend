# StockPilot AI — Authentication & Account Management Specification

This document details the architectural design, security model, database schema, and API contracts for Feature 1: Authentication and Account Management.

---

## 1. Security Architecture & Threat Model

StockPilot AI implements a dual-token authentication session model designed specifically for high-security browser SaaS environments.

### Key Safeguards:

1. **Short-Lived JWT Access Tokens**:
   - Access tokens have a default lifetime of 15 minutes (`JWT_ACCESS_EXPIRES_IN=15m`).
   - Signed using HMAC-SHA256 with strong secrets (`JWT_ACCESS_SECRET`).
   - Carried in standard `Authorization: Bearer <token>` HTTP headers.
   - Decoded and verified in memory by `authenticate` middleware without querying the database for every lightweight operation.

2. **Server-Side Persisted Refresh Tokens & Cryptographic Hashing**:
   - Refresh tokens are signed JWTs containing unique `sub`, `familyId`, and `jti` claims.
   - **Never stored in plaintext**: The database only stores a deterministic SHA-256 hash (`crypto.createHash('sha256')`).
   - Database compromises never expose usable session tokens to attackers.

3. **Strict HttpOnly, Secure, SameSite Cookies**:
   - Refresh tokens are dispatched in `HttpOnly` cookies (`stockpilot_refresh_token`).
   - Path-restricted to `/api/v1/auth`, ensuring browsers never transmit refresh credentials on arbitrary application data requests.
   - Configured with `SameSite: Lax` (or `Strict` / `None` via `COOKIE_SAME_SITE`) and `Secure: true` in production (`COOKIE_SECURE`).
   - Prevents client-side JavaScript access (complete immunity to XSS credential extraction).

4. **OWASP Refresh Token Rotation & Reuse Detection**:
   - Every refresh request invalidates the presenting refresh token and issues a new replacement within the same rotation `familyId`.
   - **Reuse Detection Policy**: If an already-rotated or revoked token is presented, the system detects a replay/token-theft attack, logs a security alert, and immediately revokes all active sessions in that `familyId`.

5. **Bcrypt Password Hashing**:
   - Passwords hashed using bcrypt with salt rounds (12 in production, 10 in test suite).
   - Constant-time comparison prevents timing side-channel attacks during credential verification.
   - API responses strictly exclude `password` and `passwordHash` fields.

6. **Dedicated Brute-Force Rate Limiting**:
   - Authentication endpoints (`/register`, `/login`, `/refresh`) are protected by a dedicated rate limiter (`authRateLimiter`) capping attempts per IP per 15-minute window (`AUTH_RATE_LIMIT_MAX`).

---

## 2. Database Schema (Prisma)

### `User` Model

Represents an authenticated account entity.

```prisma
model User {
  id           String         @id @default(uuid())
  name         String
  email        String         @unique
  passwordHash String
  status       String         @default("ACTIVE") // ACTIVE, SUSPENDED, INACTIVE
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  refreshTokens RefreshToken[]

  @@index([email])
  @@map("users")
}
```

### `RefreshToken` Model

Represents a persisted refresh token rotation family.

```prisma
model RefreshToken {
  id                  String    @id @default(uuid())
  tokenHash           String    @unique
  userId              String
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId            String
  expiresAt           DateTime
  revokedAt           DateTime?
  createdAt           DateTime  @default(now())
  replacedByTokenHash String?

  @@index([userId])
  @@index([tokenHash])
  @@index([familyId])
  @@map("refresh_tokens")
}
```

---

## 3. API Contract (`/api/v1/auth`)

### 1. `POST /api/v1/auth/register`

Creates a new user account and establishes an authenticated session.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Alex Mercer",
    "email": "alex@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Validation Rules**:
  - `name`: String, trimmed, 2–100 characters.
  - `email`: String, valid email format, trimmed, normalized to lowercase, max 255 characters.
  - `password`: String, minimum 8 characters, maximum 128 characters.
- **Success Response (`201 Created`)**:
  - `Set-Cookie`: `stockpilot_refresh_token=<token>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7b029-798c-4a35-866f-427902d18408",
        "name": "Alex Mercer",
        "email": "alex@example.com",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T12:00:00.000Z",
        "updatedAt": "2026-10-23T12:00:00.000Z"
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    },
    "timestamp": "2026-10-23T12:00:00.000Z"
  }
  ```
- **Error Responses**:
  - `409 Conflict`: `An account with this email address already exists.`
  - `422 Unprocessable Entity`: Field validation failures.

---

### 2. `POST /api/v1/auth/login`

Authenticates user credentials and issues session tokens.

- **Request Body**:
  ```json
  {
    "email": "alex@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Success Response (`200 OK`)**:
  - `Set-Cookie`: `stockpilot_refresh_token=<token>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7b029-798c-4a35-866f-427902d18408",
        "name": "Alex Mercer",
        "email": "alex@example.com",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T12:00:00.000Z",
        "updatedAt": "2026-10-23T12:00:00.000Z"
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    },
    "timestamp": "2026-10-23T12:00:00.000Z"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: `Invalid email or password.` (Generic error message preventing email enumeration).

---

### 3. `POST /api/v1/auth/refresh`

Rotates the session refresh token and issues a new access token.

- **Request**: Cookie `stockpilot_refresh_token` or JSON `{ "refreshToken": "<token>" }`.
- **Success Response (`200 OK`)**:
  - `Set-Cookie`: Updated rotated `stockpilot_refresh_token`.
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7b029-798c-4a35-866f-427902d18408",
        "name": "Alex Mercer",
        "email": "alex@example.com",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T12:00:00.000Z",
        "updatedAt": "2026-10-23T12:00:00.000Z"
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    },
    "timestamp": "2026-10-23T12:05:00.000Z"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Token missing, expired, or compromised reuse detected.

---

### 4. `POST /api/v1/auth/logout`

Revokes active session and invalidates the HttpOnly cookie.

- **Request**: Cookie `stockpilot_refresh_token`.
- **Success Response (`200 OK`)**:
  - Clears cookie `stockpilot_refresh_token`.
  ```json
  {
    "success": true,
    "data": {
      "message": "Logged out successfully."
    },
    "timestamp": "2026-10-23T12:10:00.000Z"
  }
  ```

---

### 5. `GET /api/v1/auth/me`

Retrieves the authenticated user's profile.

- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7b029-798c-4a35-866f-427902d18408",
        "name": "Alex Mercer",
        "email": "alex@example.com",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T12:00:00.000Z",
        "updatedAt": "2026-10-23T12:00:00.000Z"
      }
    },
    "timestamp": "2026-10-23T12:15:00.000Z"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Token missing, malformed, or expired.

---

## 4. Environment Variables Configuration

| Variable                 | Type    | Default                       | Description                                                         |
| :----------------------- | :------ | :---------------------------- | :------------------------------------------------------------------ |
| `JWT_ACCESS_SECRET`      | String  | _Dev default_                 | HMAC secret for signing 15-min access tokens (min 32 chars in prod) |
| `JWT_ACCESS_EXPIRES_IN`  | String  | `15m`                         | Lifetime duration for access tokens                                 |
| `JWT_REFRESH_SECRET`     | String  | _Dev default_                 | HMAC secret for signing refresh tokens (min 32 chars in prod)       |
| `JWT_REFRESH_EXPIRES_IN` | String  | `7d`                          | Lifetime duration for refresh tokens                                |
| `COOKIE_SECURE`          | Boolean | `false` (dev) / `true` (prod) | Sets `Secure` flag on cookies                                       |
| `COOKIE_SAME_SITE`       | Enum    | `lax`                         | `lax` \| `strict` \| `none`                                         |
| `COOKIE_DOMAIN`          | String  | _None_                        | Optional cross-subdomain cookie scope                               |
| `AUTH_RATE_LIMIT_MAX`    | Number  | `10`                          | Maximum auth attempts per IP per 15 minutes                         |

---

## 5. Local Setup & Migration Instructions

### Applying Database Migrations

```bash
# Apply pending migrations locally
npm run prisma:deploy

# In development mode when modifying schemas
npm run prisma:migrate
```

### Verification Commands

```bash
npm run typecheck    # Strict TypeScript check
npm run lint         # ESLint verification
npm test             # Run 69 unit and integration tests
npm run format:check # Prettier code style check
npm run build        # Production compilation
```
