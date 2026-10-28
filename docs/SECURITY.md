# StockPilot AI — Security Architecture & Hardening Runbook

This document details the multi-layered security architecture, defensive invariants, threat model, and verification runbooks implemented across the StockPilot AI SaaS backend.

---

## 1. Executive Security Architecture & Threat Model

StockPilot AI backend is engineered with **Defense-in-Depth**, adhering to the principle of least privilege, zero trust across tenant boundaries, and strict non-disclosure.

### STRIDE Threat Model & Mitigations

| Threat Category            | Potential Attack Vector                                                                        | StockPilot AI Mitigation                                                                                                                                                                                                                                                         |
| :------------------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | Forged JWT access tokens or stolen refresh tokens                                              | RS256/HS256 cryptographic verification; rotating refresh tokens with SHA-256 hashing in DB; OWASP token family reuse detection with instantaneous family revocation; constant-time password comparison.                                                                          |
| **Tampering**              | Modifying historical stock ledger transactions, inventory balances, or purchase order statuses | Append-only immutable `InventoryTransaction` ledger with no update or delete routes; atomic `$transaction` executions; conditional atomic decrements preventing negative stock.                                                                                                  |
| **Repudiation**            | Denying an unauthorized inventory issue or status change                                       | Comprehensive `AuditLog` subsystem capturing actor UUID, organization UUID, action, resource type, payload metadata (sanitized), correlation `X-Request-Id`, IP address, and user agent.                                                                                         |
| **Information Disclosure** | IDOR probing of competitor tenant UUIDs, leaking stack traces, or disclosing credential hashes | **Anti-IDOR Non-Disclosure Policy**: foreign or non-existent tenant resources return generic `404 Not Found` (never `403` or `500`); production error handler suppresses stack traces and raw SQL errors; Pino redacts sensitive keys (`password`, `token`, `secret`, `apiKey`). |
| **Denial of Service**      | Volumetric brute-force attacks, payload exhaustion, or slow-loris connection holding           | Ingress rate limiting (global 200 req/15min, auth 5 req/15min in prod); request timeout middleware (30s); explicit request body limit (1MB); connection pooling with PostgreSQL.                                                                                                 |
| **Elevation of Privilege** | Normal `MEMBER` users issuing stock, creating POs, or approving orders                         | Granular RBAC middleware (`requirePermission`) validating caller's active role against declarative role-permission maps before routing to controllers.                                                                                                                           |

---

## 2. Multi-Tenant Isolation & Anti-IDOR Defense

Multi-tenancy is enforced natively at the application and data layer without relying solely on client-supplied identifiers.

### Tenant Resolution & Context Attachment

1. Ingress requests to `/api/v1/organizations/:organizationId/*` pass through `requireOrgMember` middleware.
2. The middleware looks up `OrganizationMembership` for `(req.user.id, req.params.organizationId)`.
3. If no active membership exists or the organization is deactivated:
   - **Response**: `404 Not Found` (Error code: `NOT_FOUND`, message: `"Organization not found."`).
   - **Security Reason**: Prevents enumeration attacks where an attacker probes UUIDs to map active organizations.

### Cross-Resource Reference Validation

Mutations that accept nested foreign IDs (e.g. `productId`, `warehouseId`, `locationId`, `supplierId`) validate tenant ownership before taking action:

- **Inventory Receipts, Issues, Adjustments**:
  - `productId` is verified: `where: { id: input.productId, organizationId }` -> returns `404` if absent or belonging to another tenant.
  - `locationId` is verified: `where: { id: input.locationId, organizationId }` -> returns `404` if absent or belonging to another tenant.
- **Inventory Transfers**:
  - Both `sourceLocationId` and `destinationLocationId` are verified to belong to `organizationId`. If either belongs to a different tenant, returns `404`.
  - Ensures stock can never be transferred out of or into an unauthorized tenant's warehouse.
- **Purchase Orders**:
  - `supplierId` is verified against `organizationId` -> returns `404`.
  - All line item `productId`s are verified in bulk against `organizationId` -> returns `404` if count mismatch.
  - Delivery receipt `locationId` is verified against `organizationId` -> returns `404`.
- **Anomaly Detection & Demand Forecasting**:
  - Anomaly finding IDs and detection run IDs are strictly filtered by `organizationId`.
  - Forecast run IDs and evaluation lookups are strictly filtered by `organizationId`.

---

## 3. Authentication & Session Security

Authentication is governed by `AuthService`, utilizing JWT access tokens and stateful rotating refresh tokens.

### Token Rotation & Family Reuse Detection

Refresh tokens use OWASP-recommended **Token Family Invalidation**:

1. When a refresh token is issued, it is assigned a `familyId` (UUID) and stored as a SHA-256 hash (`tokenHash`) in PostgreSQL.
2. During refresh:
   - The token is atomically marked as revoked (`revokedAt = now`) and linked to the new token via `replacedByTokenHash`.
   - A new refresh token is issued with the same `familyId`.
3. **Reuse Detection (Compromised Token)**:
   - If an already-revoked or previously replaced refresh token is submitted, the system flags token reuse.
   - All refresh tokens belonging to the `familyId` are immediately revoked in a single query (`updateMany({ where: { familyId }, data: { revokedAt: new Date() } })`).
   - The caller is rejected with `401 Unauthorized`.
4. Refresh tokens are transmitted strictly via `HttpOnly`, `SameSite=Lax`, `Secure` cookies scoped to `/api/v1/auth`.

### User Lifecycle & Deactivation

- `authenticate` middleware verifies the access token signature, extracts `payload.sub`, and queries `db.user.findUnique({ where: { id: payload.sub } })`.
- If the user account is missing or has `status !== "ACTIVE"`, the request is immediately rejected with `401 Unauthorized`. Deactivated users cannot execute requests even with a valid, unexpired JWT.

### Password Security & Timing Attack Mitigation

- Passwords are hashed using `bcrypt` with cost factor 12 in production (10 in test suite).
- In `login()`, if the requested email is not found, a dummy password comparison is performed using a pre-computed hash. This ensures constant-time execution and prevents timing attacks that attempt to enumerate valid user emails.

---

## 4. Role-Based Access Control (RBAC)

RBAC is enforced via `requirePermission(permission)` middleware.

### Permissions Matrix

| Permission Key                 | OWNER | ADMIN | MEMBER |
| :----------------------------- | :---: | :---: | :----: |
| `org:members:read`             |  Yes  |  Yes  |  Yes   |
| `org:members:role:update`      |  Yes  |  No   |   No   |
| `org:members:remove`           |  Yes  |  Yes  |   No   |
| `org:invitations:create`       |  Yes  |  Yes  |   No   |
| `catalog:products:read`        |  Yes  |  Yes  |  Yes   |
| `catalog:products:write`       |  Yes  |  Yes  |   No   |
| `inventory:balances:read`      |  Yes  |  Yes  |  Yes   |
| `inventory:transactions:read`  |  Yes  |  Yes  |  Yes   |
| `inventory:transactions:write` |  Yes  |  Yes  |   No   |
| `purchase_orders:read`         |  Yes  |  Yes  |  Yes   |
| `purchase_orders:write`        |  Yes  |  Yes  |   No   |
| `audit_logs:read`              |  Yes  |  Yes  |   No   |
| `forecasts:read`               |  Yes  |  Yes  |  Yes   |
| `forecasts:write`              |  Yes  |  Yes  |   No   |
| `anomalies:read`               |  Yes  |  Yes  |  Yes   |
| `anomalies:write`              |  Yes  |  Yes  |   No   |
| `copilot:chat`                 |  Yes  |  Yes  |  Yes   |

---

## 5. Ledger Immutability & Financial Correctness

Inventory tracking is built on an **append-only ledger** model.

### Invariants:

1. **No Mutations to Past Transactions**:
   - `InventoryTransaction` records are write-once.
   - The Express router exposes no `PUT`, `PATCH`, or `DELETE` endpoints for `/inventory/transactions`.
2. **Atomic Ledger-Balance Synchronization**:
   - Every stock movement (receipt, issue, adjustment, transfer) executes inside a single `db.$transaction`.
   - `InventoryBalance` and `InventoryTransaction` are mutated in lockstep.
3. **Concurrency-Safe Decrement**:
   - Stock issues use conditional updates:
     ```ts
     await tx.inventoryBalance.updateMany({
       where: { productId, locationId, quantityOnHand: { gte: qtyDecimal } },
       data: { quantityOnHand: { decrement: qtyDecimal } },
     });
     ```
   - If `count === 0`, the transaction aborts with `400 Bad Request` (`"Insufficient stock at location"`), preventing negative inventory even under concurrent requests.
4. **Idempotency & Replay Prevention**:
   - Clients supply an optional `idempotencyKey`.
   - A deterministic SHA-256 hash of the normalized request payload is computed (`requestHash`).
   - If the same `idempotencyKey` is received with an identical payload, the previous result is returned idempotently without re-executing balance mutations.
   - If the same `idempotencyKey` is received with a differing payload, the request is rejected with `409 Conflict`.

---

## 6. AI Copilot Hardening & Boundary Defense

The AI Inventory Copilot (`src/modules/copilot/`) provides grounded natural language assistance with strict security boundaries:

1. **Server-Bound Tenant Context**:
   - The copilot tools (`CopilotToolFactory`) are instantiated per-request using `req.organization.id`.
   - The LLM and user prompts have zero influence over the target `organizationId`.
2. **Read-Only Prisma Operations**:
   - Tools only perform read queries (`findMany`, `findFirst`, `count`, `aggregate`).
   - No write, update, delete, or raw SQL queries exist in the tool suite.
3. **Prompt Injection Boundaries**:
   - User inputs are delimited within structured prompt wrappers.
   - System prompts contain immutable behavioral instructions prohibiting the copilot from pretending to execute orders or disclosing API keys or system configuration.
4. **Credential Isolation**:
   - Provider API keys (`AI_API_KEY`) are read exclusively from environment variables in `AiProviderFactory`.
   - Keys are never serialized in responses, logged in Pino, or exposed to the frontend.

---

## 7. Network, Infrastructure & Header Hardening

1. **Helmet Security Headers**:
   - `X-Content-Type-Options: nosniff` (prevents MIME type sniffing).
   - `X-Frame-Options: SAMEORIGIN` (mitigates clickjacking).
   - `Content-Security-Policy`: Restricts script and style execution sources.
   - `X-Powered-By` header is explicitly disabled via `app.disable("x-powered-by")`.
2. **Strict CORS Policy**:
   - Allowed origins are restricted strictly to configured domains (`FRONTEND_ORIGIN`).
   - Unauthorized origins receive `403 Forbidden` (`"Cross-origin request blocked by security policy."`).
   - Wildcards are prohibited when `credentials: true`.
3. **Rate Limiting**:
   - Global API: 200 requests per 15 minutes per IP (10,000 in test mode).
   - Sensitive Auth (`/login`, `/register`, `/refresh`): 5 requests per 15 minutes per IP.
4. **Request Body Size Limits**:
   - `express.json` and `express.urlencoded` are capped at `1mb` to prevent resource exhaustion attacks.
5. **Non-Disclosure Error Handling**:
   - `errorMiddleware` sanitizes database errors (`PrismaClientKnownRequestError`).
   - In production and staging, raw SQL strings, query parameters, and stack traces are stripped, returning a generic `"A database error occurred."` or `"An unexpected internal server error occurred."`.

---

## 8. Verification & Regression Testing

The security posture is continuously verified by automated tests:

```bash
# Execute security audit integration test suite
npx vitest run tests/integration/security-audit.test.ts

# Execute full test suite
npm test

# Run strict TypeScript typechecking
npm run typecheck

# Run linter
npm run lint
```

### Verification Checklist:

- [x] All organization endpoints enforce `requireOrgMember` with 404 anti-IDOR non-disclosure.
- [x] Cross-tenant resource IDs in mutation payloads (products, locations, suppliers) return 404.
- [x] Refresh token reuse detection revokes entire token family on replay attempt.
- [x] Inactive/deactivated users are rejected immediately on access token verification.
- [x] Password hashes and secrets are never returned in DTOs.
- [x] Regular `MEMBER` role is blocked from mutation operations across all modules.
- [x] Inventory ledger is append-only with zero update or delete endpoints.
- [x] Overselling is blocked by atomic conditional balance updates.
- [x] Idempotency keys prevent duplicate mutations and reject conflicting payloads with 409.
- [x] Helmet headers and CORS policy are actively enforced.
- [x] AI Copilot tools are read-only and strictly scoped to server-injected `organizationId`.
