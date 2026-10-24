# StockPilot AI — Warehouses & Storage Locations Specification

This document details the architectural design, database models, multi-tenancy rules, centralized RBAC policy, deactivation behavior, and API contract for **Feature 5: Warehouses and Stock Locations**.

---

## 1. Centralized Permission Matrix & Authorization Rules

StockPilot AI utilizes an organization-scoped Role-Based Access Control (RBAC) model. Warehouse and storage location permissions are declared centrally in `src/modules/organizations/rbac/permissions.ts`.

### 1.1 Warehouse & Storage Location Permission Matrix

| Action / Permission    |       Allowed Roles        | Invariants & Guard Conditions                                                                                                                                                                        |
| :--------------------- | :------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`warehouses:read`**  | `OWNER`, `ADMIN`, `MEMBER` | Caller must belong to the active organization. Scoped to `organizationId`. Supports search, status filtering, and pagination.                                                                        |
| **`warehouses:write`** |      `OWNER`, `ADMIN`      | - Enforces warehouse code uniqueness per organization (`@@unique([organizationId, code])`).<br>- Deactivating a warehouse atomically cascade-deactivates all child storage locations.                |
| **`locations:read`**   | `OWNER`, `ADMIN`, `MEMBER` | Caller must belong to the active organization. Scoped to both `organizationId` and `warehouseId`.                                                                                                    |
| **`locations:write`**  |      `OWNER`, `ADMIN`      | - Enforces location code uniqueness within its warehouse (`@@unique([warehouseId, code])`).<br>- Cannot create or activate a location in an `INACTIVE` warehouse.<br>- Soft-deactivates on `DELETE`. |

### 1.2 Core Multi-Tenancy & Integrity Invariants

1. **Tenant-Scoped Warehouse Code Uniqueness**: Warehouse codes are unique per organization (`@@unique([organizationId, code])`). Different organizations can utilize identical warehouse codes without conflict.
2. **Warehouse-Scoped Location Code Uniqueness**: Storage location codes are unique within their warehouse (`@@unique([warehouseId, code])`).
3. **Database-Enforced Hierarchy Guard**: `StorageLocation` foreign key `(warehouseId, organizationId)` references `Warehouse (id, organizationId)` with `onDelete: Cascade`. A location can never be orphaned or point to a warehouse in another tenant.
4. **Anti-IDOR Protection**: Accessing or referencing a warehouse or location from another organization or mismatched warehouse returns uniform `404 Not Found`.
5. **Atomic Cascading Deactivation**: Deactivating a warehouse atomically transitions all active child storage locations to `status: INACTIVE` in a single database transaction.
6. **Inactive Warehouse Guard**: Storage locations cannot be created or set to `ACTIVE` within an `INACTIVE` warehouse. Rejection returns `400 Bad Request`.
7. **Audit & Inventory History Retention**: Deletion endpoints perform soft-deactivation (`status = INACTIVE`) rather than hard deletes, preserving historical transactional audit trails for future inventory ledgers.

---

## 2. Database Models (`prisma/schema.prisma`)

```prisma
enum WarehouseStatus {
  ACTIVE
  INACTIVE
}

enum LocationStatus {
  ACTIVE
  INACTIVE
}

model Warehouse {
  id             String          @id @default(uuid())
  organizationId String          @map("organization_id")
  code           String
  name           String
  description    String?
  addressLine1   String?         @map("address_line1")
  addressLine2   String?         @map("address_line2")
  city           String?
  state          String?
  postalCode     String?         @map("postal_code")
  country        String?
  status         WarehouseStatus @default(ACTIVE)
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  locations    StorageLocation[]

  @@unique([organizationId, code])
  @@unique([id, organizationId])
  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, name])
  @@map("warehouses")
}

model StorageLocation {
  id             String         @id @default(uuid())
  organizationId String         @map("organization_id")
  warehouseId    String         @map("warehouse_id")
  code           String
  name           String
  description    String?
  type           String?
  status         LocationStatus @default(ACTIVE)
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  warehouse    Warehouse    @relation(fields: [warehouseId, organizationId], references: [id, organizationId], onDelete: Cascade)

  @@unique([warehouseId, code])
  @@index([warehouseId])
  @@index([organizationId])
  @@index([warehouseId, status])
  @@map("storage_locations")
}
```

---

## 3. API Endpoints Reference

All endpoints require standard Bearer token authentication: `Authorization: Bearer <accessToken>`.

### 3.1 Warehouse Management

#### POST `/api/v1/organizations/:organizationId/warehouses`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "code": "WH-NYC-01",
    "name": "New York Main Fulfillment Hub",
    "description": "Primary Northeast distribution warehouse",
    "addressLine1": "100 Logistics Blvd",
    "city": "Brooklyn",
    "state": "NY",
    "postalCode": "11201",
    "country": "USA"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
      "organizationId": "550e8400-e29b-41d4-a716-446655440001",
      "code": "WH-NYC-01",
      "name": "New York Main Fulfillment Hub",
      "description": "Primary Northeast distribution warehouse",
      "addressLine1": "100 Logistics Blvd",
      "addressLine2": null,
      "city": "Brooklyn",
      "state": "NY",
      "postalCode": "11201",
      "country": "USA",
      "status": "ACTIVE",
      "locationCount": 0,
      "createdAt": "2026-10-24T14:00:00.000Z",
      "updatedAt": "2026-10-24T14:00:00.000Z"
    },
    "timestamp": "2026-10-24T14:00:00.000Z"
  }
  ```

#### GET `/api/v1/organizations/:organizationId/warehouses`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Query Parameters**:
  - `page` (integer, default: 1)
  - `limit` (integer, default: 20, max: 100)
  - `search` (string, case-insensitive substring search on code or name)
  - `status` (`ACTIVE` | `INACTIVE` | `ALL`, default: `ACTIVE`)
  - `sortBy` (`name` | `code` | `createdAt` | `updatedAt`, default: `createdAt`)
  - `sortOrder` (`asc` | `desc`, default: `desc`)
- **Response** (`200 OK`): Paginated warehouse envelope with `locationCount`.

#### GET `/api/v1/organizations/:organizationId/warehouses/:warehouseId`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Response** (`200 OK`): Single warehouse details DTO.

#### PATCH `/api/v1/organizations/:organizationId/warehouses/:warehouseId`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**: Partial update object with fields to change.
- **Response** (`200 OK`): Updated warehouse DTO.

#### DELETE `/api/v1/organizations/:organizationId/warehouses/:warehouseId` (Deactivate)

- **Permissions**: `OWNER`, `ADMIN`
- **Action**: Soft-deactivates the warehouse (`status = INACTIVE`) and atomically cascade-deactivates all child storage locations.
- **Response** (`200 OK`): Deactivated warehouse DTO.

---

### 3.2 Storage Location Management

#### POST `/api/v1/organizations/:organizationId/warehouses/:warehouseId/locations`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "code": "RACK-A-01",
    "name": "Aisle A Heavy Pallet Rack 1",
    "description": "Standard double-deep pallet rack",
    "type": "RACK"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "organizationId": "550e8400-e29b-41d4-a716-446655440001",
      "warehouseId": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
      "code": "RACK-A-01",
      "name": "Aisle A Heavy Pallet Rack 1",
      "description": "Standard double-deep pallet rack",
      "type": "RACK",
      "status": "ACTIVE",
      "createdAt": "2026-10-24T14:00:00.000Z",
      "updatedAt": "2026-10-24T14:00:00.000Z"
    },
    "timestamp": "2026-10-24T14:00:00.000Z"
  }
  ```

#### GET `/api/v1/organizations/:organizationId/warehouses/:warehouseId/locations`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Query Parameters**:
  - `page` (default: 1)
  - `limit` (default: 20, max: 100)
  - `search` (searches across location code and name)
  - `type` (filter by location type)
  - `status` (`ACTIVE` | `INACTIVE` | `ALL`, default: `ACTIVE`)
  - `sortBy` (`code` | `name` | `type` | `createdAt` | `updatedAt`, default: `code`)
  - `sortOrder` (`asc` | `desc`, default: `asc`)
- **Response** (`200 OK`): Paginated storage locations envelope.

#### GET `/api/v1/organizations/:organizationId/warehouses/:warehouseId/locations/:locationId`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Response** (`200 OK`): Storage location DTO.

#### PATCH `/api/v1/organizations/:organizationId/warehouses/:warehouseId/locations/:locationId`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**: Partial update object. Rejects `status: ACTIVE` if warehouse is `INACTIVE`.
- **Response** (`200 OK`): Updated location DTO.

#### DELETE `/api/v1/organizations/:organizationId/warehouses/:warehouseId/locations/:locationId` (Deactivate)

- **Permissions**: `OWNER`, `ADMIN`
- **Action**: Soft-deactivates the location (`status = INACTIVE`).
- **Response** (`200 OK`): Deactivated location DTO.
