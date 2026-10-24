# StockPilot AI — Inventory Balances & Transactions Specification

This document details the architectural design, database models, decimal precision rules, concurrency control strategy, idempotency guarantees, RBAC policy, and API contract for **Feature 6: Inventory Transactions and Stock Balances**.

---

## 1. Centralized Permission Matrix & Authorization Rules

StockPilot AI utilizes an organization-scoped Role-Based Access Control (RBAC) model. Inventory permissions are declared centrally in `src/modules/organizations/rbac/permissions.ts`.

### 1.1 Permission Matrix

| Action / Permission                |       Allowed Roles        | Invariants & Guard Conditions                                                                                                                                        |
| :--------------------------------- | :------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`inventory:balances:read`**      | `OWNER`, `ADMIN`, `MEMBER` | Scoped to caller's active organization. Supports filtering by product, warehouse, location, and search (SKU/name) with pagination.                                   |
| **`inventory:transactions:read`**  | `OWNER`, `ADMIN`, `MEMBER` | Scoped to caller's active organization. Returns append-only audit ledger with filters by product, warehouse, location, transaction type, date range, and pagination. |
| **`inventory:transactions:write`** |      `OWNER`, `ADMIN`      | Permits stock mutations (`receipts`, `issues`, `adjustments`, `transfers`). Enforces atomic updates, strict decimal validation, concurrency safety, and idempotency. |

### 1.2 Core Inventory Invariants

1. **No Direct Balance Overwrites**: Inventory balances can never be directly set, updated, or deleted via arbitrary balance endpoints. Every quantity modification must flow through an authenticated, validated, and logged inventory transaction.
2. **Strict Non-Negative Stock**: Stock quantities on hand cannot drop below zero (`quantityOnHand >= 0`). Issues, transfers, and negative adjustments are rejected atomically with `400 Bad Request` if requested stock exceeds available stock.
3. **Exact Decimal Arithmetic**: Decimal quantities are modeled as `Decimal @db.Decimal(18, 4)` in PostgreSQL. All validation, arithmetic calculations, and serialized API responses strictly preserve 4-decimal precision without JavaScript floating-point errors.
4. **Append-Only Audit Ledger**: Historical inventory transactions are immutable. They cannot be edited or deleted. Corrections must be applied through new audit-logged adjustment transactions.
5. **Single Logical Transfer Transaction**: A stock transfer between locations updates source and destination balances atomically in a single database transaction and generates exactly ONE logical `TRANSFER` ledger entry referencing both locations.
6. **Cross-Tenant Anti-IDOR Protection**: Attempting to receive, issue, adjust, or transfer stock referencing products, warehouses, or storage locations belonging to another organization returns uniform `404 Not Found`.
7. **Inactive Resource Guard**: Operations against `ARCHIVED` or `INACTIVE` products, warehouses, or storage locations are rejected with `400 Bad Request`.
8. **Deterministic Idempotency**: Supplying an optional `idempotencyKey` guarantees that duplicate requests replay the original transaction without double-counting stock. Conflicting reuse of a key with a modified payload returns `409 Conflict`.
9. **Concurrency & Deadlock Safety**: Interactive database transactions utilize row-level conditional updates (`quantityOnHand >= quantity`) and bounded exponential backoff retries for transient serialization failures.

---

## 2. Database Models (`prisma/schema.prisma`)

```prisma
enum InventoryTransactionType {
  RECEIPT
  ISSUE
  ADJUSTMENT
  TRANSFER
}

model InventoryBalance {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  productId      String   @map("product_id")
  warehouseId    String   @map("warehouse_id")
  locationId     String   @map("location_id")
  quantityOnHand Decimal  @default(0) @map("quantity_on_hand") @db.Decimal(18, 4)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  product      Product         @relation(fields: [productId], references: [id], onDelete: Restrict)
  warehouse    Warehouse       @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  location     StorageLocation @relation(fields: [locationId], references: [id], onDelete: Restrict)

  @@unique([productId, locationId])
  @@index([organizationId])
  @@index([productId])
  @@index([warehouseId])
  @@index([locationId])
  @@index([organizationId, productId])
  @@index([organizationId, warehouseId])
  @@map("inventory_balances")
}

model InventoryTransaction {
  id                    String                   @id @default(uuid())
  organizationId        String                   @map("organization_id")
  productId             String                   @map("product_id")
  warehouseId           String?                  @map("warehouse_id")
  type                  InventoryTransactionType
  quantity              Decimal                  @map("quantity") @db.Decimal(18, 4)
  quantityDelta         Decimal                  @map("quantity_delta") @db.Decimal(18, 4)
  sourceLocationId      String?                  @map("source_location_id")
  destinationLocationId String?                  @map("destination_location_id")
  reason                String?                  @map("reason")
  reference             String?                  @map("reference")
  notes                 String?                  @map("notes")
  idempotencyKey        String?                  @map("idempotency_key")
  requestHash           String?                  @map("request_hash")
  performedByUserId     String                   @map("performed_by_user_id")
  createdAt             DateTime                 @default(now()) @map("created_at")

  organization        Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  product             Product          @relation(fields: [productId], references: [id], onDelete: Restrict)
  warehouse           Warehouse?       @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  sourceLocation      StorageLocation? @relation("SourceLocationTransactions", fields: [sourceLocationId], references: [id], onDelete: Restrict)
  destinationLocation StorageLocation? @relation("DestinationLocationTransactions", fields: [destinationLocationId], references: [id], onDelete: Restrict)
  performedByUser     User             @relation(fields: [performedByUserId], references: [id], onDelete: Restrict)

  @@unique([organizationId, idempotencyKey])
  @@index([organizationId])
  @@index([productId])
  @@index([warehouseId])
  @@index([sourceLocationId])
  @@index([destinationLocationId])
  @@index([organizationId, createdAt])
  @@index([type])
  @@index([organizationId, type])
  @@index([performedByUserId])
  @@map("inventory_transactions")
}
```

---

## 3. Concurrency Strategy & Idempotency Architecture

### 3.1 Concurrency Control

- **Conditional Atomic Decrements**: Decrements on `quantityOnHand` are executed with `where: { quantityOnHand: { gte: requestedQuantity } }`. If concurrent requests attempt to oversell stock, the database update matches 0 rows and triggers an immediate rollback and `400 Bad Request`.
- **Atomic Upsert**: Initial stock receipt creates the balance row or increments existing stock atomically (`ON CONFLICT (product_id, location_id) DO UPDATE SET quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand`).
- **Bounded Retry Loop**: Transient concurrency conflicts (Prisma `P2034`, Postgres `40001` serialization failure, `40P01` deadlock) are retried up to 3 times with exponential jittered backoff.

### 3.2 Idempotency Architecture

- Clients can send an optional `idempotencyKey` (UUID or client-generated token).
- A deterministic SHA-256 hash of the normalized request payload is computed.
- If the key was previously processed with an **identical** payload, the original transaction and balance are returned without modifying stock.
- If the key was previously used with a **different** payload, the system rejects the operation with `409 Conflict`.
- Database constraint `@@unique([organizationId, idempotencyKey])` prevents race conditions between concurrent requests with the same key.

---

## 4. API Reference

All routes are mounted under:
`/api/v1/organizations/:organizationId/inventory`

### 4.1 List Balances

- **`GET /balances`**
- **Query Params**: `page`, `limit`, `productId`, `warehouseId`, `locationId`, `search`
- **Response**: `200 OK` with paginated balance items and product/warehouse/location summaries.

### 4.2 Receive Stock

- **`POST /receipts`**
- **Body**:
  ```json
  {
    "productId": "550e8400-e29b-41d4-a716-446655440101",
    "locationId": "550e8400-e29b-41d4-a716-446655440301",
    "quantity": "25.0000",
    "reference": "PO-1001",
    "notes": "Initial delivery",
    "idempotencyKey": "unique-client-key-01"
  }
  ```
- **Response**: `201 Created` with `{ transaction, balance }`.

### 4.3 Issue Stock

- **`POST /issues`**
- **Body**:
  ```json
  {
    "productId": "550e8400-e29b-41d4-a716-446655440101",
    "locationId": "550e8400-e29b-41d4-a716-446655440301",
    "quantity": "5.0000",
    "reason": "DAMAGED",
    "reference": "ISSUE-1001",
    "idempotencyKey": "unique-client-key-02"
  }
  ```
- **Response**: `201 Created` with `{ transaction, balance }`.

### 4.4 Adjust Stock

- **`POST /adjustments`**
- **Body**:
  ```json
  {
    "productId": "550e8400-e29b-41d4-a716-446655440101",
    "locationId": "550e8400-e29b-41d4-a716-446655440301",
    "quantityDelta": "-2.0000",
    "reason": "STOCK_COUNT",
    "reference": "AUDIT-2026-Q1",
    "notes": "Physical count reconciliation",
    "idempotencyKey": "unique-client-key-03"
  }
  ```
- **Response**: `201 Created` with `{ transaction, balance }`.

### 4.5 Transfer Stock

- **`POST /transfers`**
- **Body**:
  ```json
  {
    "productId": "550e8400-e29b-41d4-a716-446655440101",
    "sourceLocationId": "550e8400-e29b-41d4-a716-446655440301",
    "destinationLocationId": "550e8400-e29b-41d4-a716-446655440302",
    "quantity": "8.0000",
    "reference": "TRANSFER-1001",
    "notes": "Aisle replenishment",
    "idempotencyKey": "unique-client-key-04"
  }
  ```
- **Response**: `201 Created` with `{ transaction, sourceBalance, destinationBalance }`.

### 4.6 List Transaction History

- **`GET /transactions`**
- **Query Params**: `page`, `limit`, `productId`, `warehouseId`, `locationId`, `type`, `startDate`, `endDate`, `search`
- **Response**: `200 OK` with paginated transactions and actor information.
