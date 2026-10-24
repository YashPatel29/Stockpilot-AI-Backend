# StockPilot AI — Product & Category Management Specification

This document details the architectural design, database models, multi-tenancy rules, centralized RBAC policy, monetary precision guidelines, and API contract for **Feature 4: Product and Category Management**.

---

## 1. Centralized Permission Matrix & Authorization Rules

StockPilot AI utilizes an organization-scoped Role-Based Access Control (RBAC) model. Catalog permissions are declared centrally in `src/modules/organizations/rbac/permissions.ts`.

### 1.1 Catalog Permission Matrix

| Action / Permission            |       Allowed Roles        | Invariants & Guard Conditions                                                                                                                                              |
| :----------------------------- | :------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`catalog:categories:read`**  | `OWNER`, `ADMIN`, `MEMBER` | Caller must belong to the active organization. Scoped to `organizationId`.                                                                                                 |
| **`catalog:categories:write`** |      `OWNER`, `ADMIN`      | - Enforces case-insensitive category name uniqueness per organization.<br>- Safe delete: Cannot delete category assigned to active products (HTTP 409 Conflict).           |
| **`catalog:products:read`**    | `OWNER`, `ADMIN`, `MEMBER` | Caller must belong to the active organization. Scoped to `organizationId`. Default query filters out `ARCHIVED` products unless explicitly requested via `status` filter.  |
| **`catalog:products:write`**   |      `OWNER`, `ADMIN`      | - Enforces SKU uniqueness per organization.<br>- Rejects foreign categories with HTTP 400 Bad Request.<br>- Soft archives products on `DELETE` (sets `status = ARCHIVED`). |

### 1.2 Core Multi-Tenancy Invariants

1. **Tenant-Scoped SKU Uniqueness**: Product SKUs are unique per organization (`@@unique([organizationId, sku])`). Different organizations can utilize identical SKUs without conflict.
2. **Tenant-Scoped Category Uniqueness**: Category names are unique per organization (`@@unique([organizationId, name])`).
3. **Cross-Tenant Category Assignment Guard**: Assigning a category to a product from a different organization is rejected with `400 Bad Request`.
4. **Anti-IDOR Protection**: Accessing or referencing a category or product that belongs to another organization returns `404 Not Found`.
5. **Exact Monetary Precision**: Cost price and selling price are stored using `@db.Decimal(12, 4)` in PostgreSQL to prevent floating-point rounding inaccuracies.
6. **Safe Category Deletion**: A category cannot be deleted if referenced by any products. Returns `409 Conflict`.
7. **Soft-Archival**: Deleting a product sets `status: ARCHIVED`, preserving historical transactions and stock audit trails.

---

## 2. Database Models (`prisma/schema.prisma`)

```prisma
enum ProductStatus {
  ACTIVE
  ARCHIVED
}

model ProductCategory {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  name           String
  description    String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  products     Product[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("product_categories")
}

model Product {
  id                String        @id @default(uuid())
  organizationId    String        @map("organization_id")
  categoryId        String?       @map("category_id")
  sku               String
  name              String
  description       String?
  unitOfMeasure     String        @default("PCS") @map("unit_of_measure")
  costPrice         Decimal       @default(0) @map("cost_price") @db.Decimal(12, 4)
  sellingPrice      Decimal       @default(0) @map("selling_price") @db.Decimal(12, 4)
  lowStockThreshold Int           @default(0) @map("low_stock_threshold")
  status            ProductStatus @default(ACTIVE)
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  organization Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  category     ProductCategory? @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@unique([organizationId, sku])
  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, categoryId])
  @@index([organizationId, name])
  @@map("products")
}
```

---

## 3. API Endpoints Reference

All endpoints require standard Bearer token authentication: `Authorization: Bearer <accessToken>`.

### 3.1 Category Management

#### POST `/api/v1/organizations/:organizationId/categories`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "name": "Industrial Electronics",
    "description": "Sensors and embedded microcontrollers"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
      "organizationId": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Industrial Electronics",
      "description": "Sensors and embedded microcontrollers",
      "productCount": 0,
      "createdAt": "2026-10-24T12:00:00.000Z",
      "updatedAt": "2026-10-24T12:00:00.000Z"
    },
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```

#### GET `/api/v1/organizations/:organizationId/categories`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Query Parameters**:
  - `page` (integer, default: 1)
  - `limit` (integer, default: 20, max: 100)
  - `search` (string, case-insensitive substring search on name)
  - `sortBy` (`name` | `createdAt`, default: `name`)
  - `sortOrder` (`asc` | `desc`, default: `asc`)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
          "organizationId": "550e8400-e29b-41d4-a716-446655440001",
          "name": "Industrial Electronics",
          "description": "Sensors and embedded microcontrollers",
          "productCount": 5,
          "createdAt": "2026-10-24T12:00:00.000Z",
          "updatedAt": "2026-10-24T12:00:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "totalItems": 1,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPrevPage": false
      }
    },
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```

#### GET `/api/v1/organizations/:organizationId/categories/:categoryId`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Response** (`200 OK`): Safe category DTO with product count.

#### PATCH `/api/v1/organizations/:organizationId/categories/:categoryId`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "name": "Consumer & Industrial Electronics",
    "description": "Updated category description"
  }
  ```
- **Response** (`200 OK`): Updated safe category DTO.

#### DELETE `/api/v1/organizations/:organizationId/categories/:categoryId`

- **Permissions**: `OWNER`, `ADMIN`
- **Error if Products Assigned** (`409 Conflict`):
  ```json
  {
    "success": false,
    "error": {
      "code": "CONFLICT",
      "message": "Cannot delete category because it is currently assigned to one or more products. Reassign or remove products first."
    },
    "requestId": "4509fbe7-b358-4523-8611-cf972a9a77ad",
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```
- **Response if Unassigned** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "message": "Category deleted successfully.",
      "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b"
    },
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```

---

### 3.2 Product Management

#### POST `/api/v1/organizations/:organizationId/products`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "sku": "ROB-ARM-001",
    "name": "6-Axis Articulated Robotic Arm",
    "description": "Industrial robotic assembly arm with 5kg payload capacity",
    "categoryId": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
    "unitOfMeasure": "PCS",
    "costPrice": 4500.5,
    "sellingPrice": 8999.99,
    "lowStockThreshold": 3
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "organizationId": "550e8400-e29b-41d4-a716-446655440001",
      "categoryId": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
      "sku": "ROB-ARM-001",
      "name": "6-Axis Articulated Robotic Arm",
      "description": "Industrial robotic assembly arm with 5kg payload capacity",
      "unitOfMeasure": "PCS",
      "costPrice": 4500.5,
      "sellingPrice": 8999.99,
      "lowStockThreshold": 3,
      "status": "ACTIVE",
      "createdAt": "2026-10-24T12:00:00.000Z",
      "updatedAt": "2026-10-24T12:00:00.000Z",
      "category": {
        "id": "76d1e4eb-9dcb-41d1-8288-971c26f0412b",
        "name": "Industrial Electronics"
      }
    },
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```

#### GET `/api/v1/organizations/:organizationId/products`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Query Parameters**:
  - `page` (default: 1)
  - `limit` (default: 20, max: 100)
  - `search` (searches across product name and SKU)
  - `categoryId` (filter by category)
  - `status` (`ACTIVE` | `ARCHIVED` | `ALL`, default: `ACTIVE`)
  - `minPrice` (filter sellingPrice >= minPrice)
  - `maxPrice` (filter sellingPrice <= maxPrice)
  - `sortBy` (`name` | `sku` | `costPrice` | `sellingPrice` | `createdAt` | `updatedAt`, default: `createdAt`)
  - `sortOrder` (`asc` | `desc`, default: `desc`)
- **Response** (`200 OK`): Paginated product envelope.

#### GET `/api/v1/organizations/:organizationId/products/:productId`

- **Permissions**: `OWNER`, `ADMIN`, `MEMBER`
- **Response** (`200 OK`): Single product DTO including category summary.

#### PATCH `/api/v1/organizations/:organizationId/products/:productId`

- **Permissions**: `OWNER`, `ADMIN`
- **Request Body**: Partial update object with fields to change.
- **Response** (`200 OK`): Updated product DTO.

#### DELETE `/api/v1/organizations/:organizationId/products/:productId` (Soft Archival)

- **Permissions**: `OWNER`, `ADMIN`
- **Action**: Soft archives the product by transitioning `status` to `ARCHIVED`.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "status": "ARCHIVED",
      "...": "..."
    },
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```
