# StockPilot AI — Team Members, Invitations & RBAC Specification

This document details the architectural design, database models, centralized RBAC policy, invitation token delivery approach, and API contract for **Feature 3: Team Members, Invitations, and Role-Based Access Control**.

---

## 1. Centralized Permission Matrix & Authorization Rules

StockPilot AI utilizes an organization-scoped Role-Based Access Control (RBAC) model. Permissions are defined centrally in `src/modules/organizations/rbac/` rather than hardcoded into controllers.

### 1.1 Permission Catalog

| Action / Permission           |       Allowed Roles        | Invariants & Guard Conditions                                                                                                                                                                                                                   |
| :---------------------------- | :------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`org:members:read`**        | `OWNER`, `ADMIN`, `MEMBER` | Caller must belong to the active organization.                                                                                                                                                                                                  |
| **`org:members:role:update`** |        `OWNER` only        | - Permitted new roles: `ADMIN`, `MEMBER`.<br>- Direct promotion to `OWNER` is rejected.<br>- Modifying or demoting the `OWNER`'s role is prohibited.                                                                                            |
| **`org:members:remove`**      |      `OWNER`, `ADMIN`      | - Removing the `OWNER` is prohibited under all circumstances.<br>- `ADMIN` can only remove regular `MEMBER`s (cannot remove other `ADMIN`s or `OWNER`).<br>- `OWNER` can remove any non-OWNER member (`ADMIN` or `MEMBER`).                     |
| **`org:invitations:create`**  |      `OWNER`, `ADMIN`      | - Can invite users as `ADMIN` or `MEMBER` (invitations as `OWNER` are prohibited).<br>- Recipient cannot already be an active member of the organization.                                                                                       |
| **`org:invitations:read`**    |      `OWNER`, `ADMIN`      | Returns only pending (unaccepted, unrevoked, unexpired) invitations. Token hashes are omitted from API responses.                                                                                                                               |
| **`org:invitations:revoke`**  |      `OWNER`, `ADMIN`      | Sets `revokedAt = NOW()` atomically. Cannot revoke an already accepted invitation.                                                                                                                                                              |
| **`org:invitations:accept`**  |     Authenticated User     | - Authenticated user's normalized email MUST match the invitation's recipient email.<br>- Rejects expired, revoked, or reused invitation tokens.<br>- Rejects if user is already a member.<br>- Executes inside an atomic database transaction. |
| **`org:settings:manage`**     |        `OWNER` only        | Organization lifecycle, rename, slug mutation, deactivation.                                                                                                                                                                                    |

### 1.2 Inviolable RBAC Rules

1. **Continuous Ownership**: No active organization can ever be left without an OWNER.
2. **Promoting to OWNER is Forbidden**: Member role update endpoints reject `role: "OWNER"`.
3. **Admin Boundaries**: Administrators cannot self-promote to OWNER, promote others to OWNER, or remove other administrators.
4. **Tenant Isolation (Anti-IDOR)**: Route parameters (`:organizationId`, `:membershipId`, `:invitationId`) are cross-validated. Accessing a resource belonging to another organization returns a uniform `404 Not Found`.

---

## 2. Database Models (`prisma/schema.prisma`)

```prisma
enum OrganizationRole {
  OWNER
  ADMIN
  MEMBER
}

model OrganizationInvitation {
  id             String           @id @default(uuid())
  organizationId String           @map("organization_id")
  email          String
  role           OrganizationRole @default(MEMBER)
  tokenHash      String           @unique @map("token_hash")
  invitedById    String           @map("invited_by_id")
  expiresAt      DateTime         @map("expires_at")
  acceptedAt     DateTime?        @map("accepted_at")
  revokedAt      DateTime?        @map("revoked_at")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invitedBy    User         @relation("InvitedByUser", fields: [invitedById], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([email])
  @@index([tokenHash])
  @@index([invitedById])
  @@map("organization_invitations")
}
```

---

## 3. Cryptographic Token Design & Delivery Adapter

1. **High-Entropy Token Generation**:
   - Invitation tokens are generated via `crypto.randomBytes(32).toString('hex')` (256-bit entropy).
2. **Deterministic Token Hashing**:
   - Only the SHA-256 cryptographic hash (`hashToken(rawToken)`) is stored in the database.
   - Raw tokens are never logged or stored.
3. **Pluggable Delivery Architecture**:
   - The `IInvitationDeliveryService` interface abstracts email dispatching from domain logic.
   - In development/testing, `DevInvitationDeliveryAdapter` records invitations in-memory for testing and local development.
   - In non-production environments, the raw token is made available in the creation response (`devRawToken`) for rapid local verification.

---

## 4. API Endpoints

### 4.1 Team Members

#### `GET /api/v1/organizations/:organizationId/members`

- **Access**: `OWNER`, `ADMIN`, `MEMBER`
- **Query**: `page` (default 1), `limit` (default 20, max 100)
- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440000",
        "userId": "usr-alice-111",
        "organizationId": "550e8400-e29b-41d4-a716-446655440000",
        "role": "OWNER",
        "createdAt": "2026-10-24T00:00:00.000Z",
        "updatedAt": "2026-10-24T00:00:00.000Z",
        "user": {
          "id": "usr-alice-111",
          "name": "Alice Smith",
          "email": "alice@stockpilot.io"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2026-10-24T10:00:00.000Z"
}
```

#### `PATCH /api/v1/organizations/:organizationId/members/:membershipId/role`

- **Access**: `OWNER` only
- **Request Body**:

```json
{
  "role": "ADMIN"
}
```

- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "userId": "usr-bob-222",
    "organizationId": "550e8400-e29b-41d4-a716-446655440000",
    "role": "ADMIN",
    "createdAt": "2026-10-24T00:00:00.000Z",
    "updatedAt": "2026-10-24T10:05:00.000Z",
    "user": {
      "id": "usr-bob-222",
      "name": "Bob Jones",
      "email": "bob@stockpilot.io"
    }
  },
  "timestamp": "2026-10-24T10:05:00.000Z"
}
```

#### `DELETE /api/v1/organizations/:organizationId/members/:membershipId`

- **Access**: `OWNER` (can remove ADMIN or MEMBER), `ADMIN` (can only remove MEMBER)
- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "message": "Member removed successfully."
  },
  "timestamp": "2026-10-24T10:10:00.000Z"
}
```

---

### 4.2 Invitations

#### `POST /api/v1/organizations/:organizationId/invitations`

- **Access**: `OWNER`, `ADMIN`
- **Rate Limit**: 30 requests per 15 minutes
- **Request Body**:

```json
{
  "email": "candidate@example.com",
  "role": "MEMBER"
}
```

- **Response** (`201 Created`):

```json
{
  "success": true,
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "organizationId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "candidate@example.com",
    "role": "MEMBER",
    "expiresAt": "2026-10-31T10:00:00.000Z",
    "createdAt": "2026-10-24T10:00:00.000Z",
    "devRawToken": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  "timestamp": "2026-10-24T10:00:00.000Z"
}
```

#### `GET /api/v1/organizations/:organizationId/invitations`

- **Access**: `OWNER`, `ADMIN`
- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440000",
        "organizationId": "550e8400-e29b-41d4-a716-446655440000",
        "email": "candidate@example.com",
        "role": "MEMBER",
        "expiresAt": "2026-10-31T10:00:00.000Z",
        "createdAt": "2026-10-24T10:00:00.000Z",
        "invitedBy": {
          "id": "usr-alice-111",
          "name": "Alice Smith",
          "email": "alice@stockpilot.io"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2026-10-24T10:00:00.000Z"
}
```

#### `DELETE /api/v1/organizations/:organizationId/invitations/:invitationId`

- **Access**: `OWNER`, `ADMIN`
- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "message": "Invitation revoked successfully."
  },
  "timestamp": "2026-10-24T10:15:00.000Z"
}
```

#### `POST /api/v1/invitations/accept`

- **Access**: Authenticated user matching the invited email
- **Rate Limit**: 30 requests per 15 minutes
- **Request Body**:

```json
{
  "token": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
}
```

- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "membership": {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "organizationId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "MEMBER",
      "createdAt": "2026-10-24T10:20:00.000Z"
    },
    "organization": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "StockPilot Supply Chain",
      "slug": "stockpilot-supply-chain",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T10:00:00.000Z",
      "updatedAt": "2026-01-01T10:00:00.000Z"
    }
  },
  "timestamp": "2026-10-24T10:20:00.000Z"
}
```
