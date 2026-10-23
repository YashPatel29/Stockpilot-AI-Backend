# StockPilot AI — Organizations & Multi-Tenancy Specification

This document details the architectural design, database models, security policy, and API contract for **Feature 2: Organizations and Multi-Tenancy**.

---

## 1. Multi-Tenancy Architecture & Security Policy

StockPilot AI implements a **Logical Multi-Tenancy Architecture** at the data layer. Every future domain resource (warehouses, inventory items, stock movements) is strictly scoped to an `Organization`.

### Key Security & Isolation Invariants:

1. **Authenticated Context**:
   - The user identity is extracted strictly from `req.user.id` (set by the verified JWT in `authenticate` middleware).
   - Client-supplied tenant IDs or roles in headers/body are never trusted.
2. **Anti-Enumeration & IDOR Defense**:
   - Accessing an `:organizationId` that does not exist **or** that the caller is not an active member of returns a generic `404 Not Found` (`Organization not found.`).
   - This prevents malicious actors from probing valid organization UUIDs in the database.
3. **Owner-Restricted Operations**:
   - Mutation endpoints (`PATCH /api/v1/organizations/:organizationId` and `DELETE /api/v1/organizations/:organizationId`) enforce that the caller holds the `OWNER` role.
   - Non-owners receive `403 Forbidden` (`Only organization owners can perform this action.`).
4. **Atomic Provisioning**:
   - Creation of the organization and the owner's initial membership executes inside a Prisma `$transaction`. If either step fails, the entire transaction rolls back.
5. **Safe Deactivation Policy**:
   - Organization deletion updates status to `DEACTIVATED` rather than performing destructive cascades, preserving historical records and audit logs.
6. **Reusable Authorization Guards**:
   - `requireOrgMember`: Validates UUID, checks active membership, and binds `req.organization` and `req.membership`.
   - `requireOrgOwner`: Ensures caller holds the `OWNER` role.
   - These middlewares are exported for future tenant-scoped modules.

---

## 2. Database Models (`prisma/schema.prisma`)

```prisma
enum OrganizationRole {
  OWNER
  MEMBER
}

model Organization {
  id          String                   @id @default(uuid())
  name        String
  slug        String                   @unique
  status      String                   @default("ACTIVE") // ACTIVE, SUSPENDED, DEACTIVATED
  createdAt   DateTime                 @default(now()) @map("created_at")
  updatedAt   DateTime                 @updatedAt @map("updated_at")
  memberships OrganizationMembership[]

  @@index([slug])
  @@map("organizations")
}

model OrganizationMembership {
  id             String           @id @default(uuid())
  userId         String           @map("user_id")
  organizationId String           @map("organization_id")
  role           OrganizationRole @default(MEMBER)
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
  @@index([userId])
  @@index([organizationId])
  @@map("organization_memberships")
}
```

---

## 3. API Contract (`/api/v1/organizations`)

All routes require a valid bearer access token:
`Authorization: Bearer <accessToken>`

### 1. `POST /api/v1/organizations`

Creates a new organization and atomically assigns the caller as `OWNER`.

- **Request Body**:
  ```json
  {
    "name": "Acme Global Logistics"
  }
  ```
- **Validation Rules**:
  - `name`: String, trimmed, min 2, max 100 characters.
  - Generates a URL-friendly slug automatically with collision avoidance.
  - Rejects unsupported fields strictly (`.strict()`).
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "organization": {
        "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
        "name": "Acme Global Logistics",
        "slug": "acme-global-logistics",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T15:00:00.000Z",
        "updatedAt": "2026-10-23T15:00:00.000Z"
      },
      "role": "OWNER"
    },
    "timestamp": "2026-10-23T15:00:00.000Z"
  }
  ```

---

### 2. `GET /api/v1/organizations`

Returns a paginated list of organizations the authenticated user belongs to.

- **Query Parameters**:
  - `page`: Integer, minimum 1 (default `1`).
  - `limit`: Integer, minimum 1, maximum 100 (default `20`).
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
        "name": "Acme Global Logistics",
        "slug": "acme-global-logistics",
        "status": "ACTIVE",
        "role": "OWNER",
        "createdAt": "2026-10-23T15:00:00.000Z",
        "updatedAt": "2026-10-23T15:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    },
    "timestamp": "2026-10-23T15:00:00.000Z"
  }
  ```

---

### 3. `GET /api/v1/organizations/:organizationId`

Retrieves organization details if the caller is an active member.

- **URL Parameters**:
  - `organizationId`: Valid UUID.
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "organization": {
        "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
        "name": "Acme Global Logistics",
        "slug": "acme-global-logistics",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T15:00:00.000Z",
        "updatedAt": "2026-10-23T15:00:00.000Z"
      },
      "role": "OWNER"
    },
    "timestamp": "2026-10-23T15:00:00.000Z"
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Organization does not exist or caller is not a member.

---

### 4. `PATCH /api/v1/organizations/:organizationId`

Updates organization details. Restricted to organization `OWNER`s.

- **URL Parameters**:
  - `organizationId`: Valid UUID.
- **Request Body**:
  ```json
  {
    "name": "Acme Supply Chain Solutions"
  }
  ```
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "organization": {
        "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
        "name": "Acme Supply Chain Solutions",
        "slug": "acme-supply-chain-solutions",
        "status": "ACTIVE",
        "createdAt": "2026-10-23T15:00:00.000Z",
        "updatedAt": "2026-10-23T15:05:00.000Z"
      }
    },
    "timestamp": "2026-10-23T15:05:00.000Z"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: `Only organization owners can modify organization details.`
  - `404 Not Found`: Organization does not exist or caller is not a member.
  - `422 Unprocessable Entity`: Invalid UUID or unsupported fields in request body.

---

### 5. `DELETE /api/v1/organizations/:organizationId`

Safely deactivates an organization. Restricted to organization `OWNER`s.

- **URL Parameters**:
  - `organizationId`: Valid UUID.
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "message": "Organization deactivated successfully.",
      "organizationId": "76d1e4eb-9dcb-41d1-8288-971c26f0412b"
    },
    "timestamp": "2026-10-23T15:10:00.000Z"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: `Only organization owners can deactivate an organization.`
  - `404 Not Found`: Organization does not exist or caller is not a member.
