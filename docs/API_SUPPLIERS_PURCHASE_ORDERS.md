# StockPilot AI — Suppliers & Purchase Orders Specification

This document details the architectural design, database models, multi-tenancy rules, centralized RBAC policy, status workflow, and API contract for **Feature 7: Suppliers and Purchase Orders**.

---

## 1. Centralized Permission Matrix & Authorization Rules

StockPilot AI implements organization-scoped Role-Based Access Control (RBAC). Supplier and purchase order permissions are declared centrally in `src/modules/organizations/rbac/permissions.ts`.

### 1.1 Procurement Permission Matrix

| Action / Permission         |       Allowed Roles        | Invariants & Guard Conditions                                                                                                                                                                                  |
| :-------------------------- | :------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`suppliers:read`**        | `OWNER`, `ADMIN`, `MEMBER` | Caller must belong to the active organization. Scoped to `organizationId`. Supports search, `isActive` filtering, and pagination.                                                                              |
| **`suppliers:write`**       |      `OWNER`, `ADMIN`      | - Normalized uppercase supplier code uniqueness per organization (`@@unique([organizationId, code])`).<br>- Soft-deactivation on `DELETE` (`isActive: false`) to preserve historical procurement audit trails. |
| **`purchase_orders:read`**  | `OWNER`, `ADMIN`, `MEMBER` | Scoped to `organizationId`. Supports search, filtering by `supplierId`, `status`, date ranges, and pagination. Includes line items, supplier metadata, and receipt history.                                    |
| **`purchase_orders:write`** |      `OWNER`, `ADMIN`      | - Manages creation, drafting, submissions, approvals, cancellations, and stock delivery receipts.<br>- Enforces state machine transitions, over-receiving guards, and concurrency-safe idempotency keys.       |

### 1.2 Core Multi-Tenancy & Integrity Invariants

1. **Normalized Supplier Code Uniqueness**: Supplier codes are optional. When provided, they are normalized to uppercase and trimmed, guaranteed unique per organization via `@@unique([organizationId, code])`.
2. **Order Number Generation**: Follows `PO-YYYYMMDD-XXXX` pattern with random alphanumeric entropy, enforced unique per tenant via `@@unique([organizationId, orderNumber])` and collision retry loops.
3. **Anti-IDOR Protection**: Accessing suppliers, purchase orders, products, warehouses, or storage locations from another tenant uniformly returns `404 Not Found`.
4. **Draft-Only Mutation Invariant**: Purchase order header fields and line items can only be updated while in `DRAFT` status. Once submitted or approved, order lines are immutable.
5. **Approval Segregation & Audit**: Orders can only transition from `DRAFT` -> `PENDING_APPROVAL` -> `APPROVED`. Approver ID and timestamp are recorded upon approval.
6. **Cancellation Safeguard**: Orders can only be cancelled from `DRAFT`, `PENDING_APPROVAL`, or `APPROVED` status if zero quantities have been received (`quantityReceived == 0`). Orders with delivered items cannot be cancelled.
7. **Over-Delivery Guard**: Receiving quantities must be strictly positive and cannot exceed the line item's outstanding balance (`quantityOrdered - quantityReceived`).
8. **Unified Inventory Ledger Integration**: Receiving purchase order items automatically updates `InventoryBalance` and appends an `InventoryTransaction` of type `RECEIPT` using the Feature 6 stock service, committing atomically in a single database transaction.
9. **Mutation Idempotency**: Receiving endpoints accept an optional `idempotencyKey`. Repeated requests with the identical payload return the existing receipt without duplicate stock adjustments; conflicting payloads return `409 Conflict`.
10. **Zero Floating-Point Precision Loss**: Monetary amounts use `Decimal(14, 4)` and stock quantities use `Decimal(18, 4)`. Responses return precise string-formatted decimals.

---

## 2. Purchase Order Workflow State Machine

```
              ┌─────────┐
              │  DRAFT  │◀────── Created by Buyer
              └────┬────┘
                   │
                   ▼ (submit)
         ┌───────────────────┐
         │ PENDING_APPROVAL  │
         └─────────┬─────────┘
                   │
                   ▼ (approve)
              ┌──────────┐
              │ APPROVED │
              └────┬─────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼ (partial receipt)   ▼ (full receipt)
┌────────────────────┐   ┌──────────┐
│ PARTIALLY_RECEIVED │   │ RECEIVED │
└─────────┬──────────┘   └──────────┘
          │                   ▲
          └───────────────────┘
              (final receipt)

* Cancellation: Allowed from DRAFT, PENDING_APPROVAL, or APPROVED (only if quantityReceived == 0).
```

---

## 3. Database Models (`prisma/schema.prisma`)

```prisma
enum PurchaseOrderStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

model Supplier {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  name           String
  code           String?
  email          String?
  phone          String?
  contactPerson  String?  @map("contact_person")
  address        String?
  taxIdentifier  String?  @map("tax_identifier")
  notes          String?
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  purchaseOrders PurchaseOrder[]

  @@unique([organizationId, code])
  @@index([organizationId])
  @@index([organizationId, isActive])
  @@index([organizationId, name])
  @@map("suppliers")
}

model PurchaseOrder {
  id                   String              @id @default(uuid())
  organizationId       String              @map("organization_id")
  supplierId           String              @map("supplier_id")
  orderNumber          String              @map("order_number")
  status               PurchaseOrderStatus @default(DRAFT)
  orderDate            DateTime            @default(now()) @map("order_date")
  expectedDeliveryDate DateTime?           @map("expected_delivery_date")
  currency             String              @default("USD")
  subtotal             Decimal             @default(0) @db.Decimal(14, 4)
  taxAmount            Decimal             @default(0) @map("tax_amount") @db.Decimal(14, 4)
  totalAmount          Decimal             @default(0) @map("total_amount") @db.Decimal(14, 4)
  notes                String?
  createdByUserId      String              @map("created_by_user_id")
  approvedByUserId     String?             @map("approved_by_user_id")
  approvedAt           DateTime?           @map("approved_at")
  cancelledAt          DateTime?           @map("cancelled_at")
  createdAt            DateTime            @default(now()) @map("created_at")
  updatedAt            DateTime            @updatedAt @map("updated_at")

  organization   Organization           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  supplier       Supplier               @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  createdByUser  User                   @relation("CreatedPurchaseOrders", fields: [createdByUserId], references: [id], onDelete: Restrict)
  approvedByUser User?                  @relation("ApprovedPurchaseOrders", fields: [approvedByUserId], references: [id], onDelete: Restrict)
  items          PurchaseOrderItem[]
  receipts       PurchaseOrderReceipt[]

  @@unique([organizationId, orderNumber])
  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, supplierId])
  @@index([organizationId, orderDate])
  @@map("purchase_orders")
}

model PurchaseOrderItem {
  id               String   @id @default(uuid())
  purchaseOrderId  String   @map("purchase_order_id")
  productId        String   @map("product_id")
  quantityOrdered  Decimal  @map("quantity_ordered") @db.Decimal(18, 4)
  quantityReceived Decimal  @default(0) @map("quantity_received") @db.Decimal(18, 4)
  unitCost         Decimal  @map("unit_cost") @db.Decimal(14, 4)
  lineTotal        Decimal  @map("line_total") @db.Decimal(14, 4)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  product       Product       @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@index([purchaseOrderId])
  @@index([productId])
  @@map("purchase_order_items")
}

model PurchaseOrderReceipt {
  id               String   @id @default(uuid())
  organizationId   String   @map("organization_id")
  purchaseOrderId  String   @map("purchase_order_id")
  locationId       String   @map("location_id")
  reference        String?  @map("reference")
  notes            String?  @map("notes")
  idempotencyKey   String?  @map("idempotency_key")
  requestHash      String?  @map("request_hash")
  receivedByUserId String   @map("received_by_user_id")
  createdAt        DateTime @default(now()) @map("created_at")

  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  purchaseOrder  PurchaseOrder   @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  location       StorageLocation @relation(fields: [locationId], references: [id], onDelete: Restrict)
  receivedByUser User            @relation("ReceivedPurchaseOrders", fields: [receivedByUserId], references: [id], onDelete: Restrict)

  @@unique([organizationId, idempotencyKey])
  @@index([organizationId])
  @@index([purchaseOrderId])
  @@index([locationId])
  @@map("purchase_order_receipts")
}
```

---

## 4. API Endpoints Reference

All endpoints require standard Bearer token authentication: `Authorization: Bearer <accessToken>`.

### 4.1 Suppliers

#### Create Supplier

- **Endpoint**: `POST /api/v1/organizations/:organizationId/suppliers`
- **Permissions**: `suppliers:write` (`OWNER`, `ADMIN`)
- **Request Body**:

```json
{
  "name": "Global Steel Inc.",
  "code": "SUP-STEEL-01",
  "email": "orders@globalsteel.com",
  "phone": "+1-555-0199",
  "contactPerson": "Jane Doe",
  "address": "100 Industrial Pkwy",
  "taxIdentifier": "US-987654321",
  "notes": "Primary structural metal supplier"
}
```

- **Response** (`201 Created`):

```json
{
  "success": true,
  "data": {
    "id": "e4f8b9b2-3e2b-4d4a-9b1b-4f8b9b23e2b4",
    "organizationId": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Global Steel Inc.",
    "code": "SUP-STEEL-01",
    "email": "orders@globalsteel.com",
    "phone": "+1-555-0199",
    "contactPerson": "Jane Doe",
    "address": "100 Industrial Pkwy",
    "taxIdentifier": "US-987654321",
    "notes": "Primary structural metal supplier",
    "isActive": true,
    "createdAt": "2026-10-27T10:00:00.000Z",
    "updatedAt": "2026-10-27T10:00:00.000Z"
  },
  "timestamp": "2026-10-27T10:00:00.000Z"
}
```

#### List Suppliers

- **Endpoint**: `GET /api/v1/organizations/:organizationId/suppliers`
- **Permissions**: `suppliers:read` (`OWNER`, `ADMIN`, `MEMBER`)
- **Query Parameters**: `page`, `limit`, `search`, `isActive`, `sortBy`, `sortOrder`

#### Get Supplier by ID

- **Endpoint**: `GET /api/v1/organizations/:organizationId/suppliers/:supplierId`
- **Permissions**: `suppliers:read` (`OWNER`, `ADMIN`, `MEMBER`)

#### Update Supplier

- **Endpoint**: `PATCH /api/v1/organizations/:organizationId/suppliers/:supplierId`
- **Permissions**: `suppliers:write` (`OWNER`, `ADMIN`)

#### Soft-Deactivate Supplier

- **Endpoint**: `DELETE /api/v1/organizations/:organizationId/suppliers/:supplierId`
- **Permissions**: `suppliers:write` (`OWNER`, `ADMIN`)

---

### 4.2 Purchase Orders

#### Create Purchase Order Draft

- **Endpoint**: `POST /api/v1/organizations/:organizationId/purchase-orders`
- **Permissions**: `purchase_orders:write` (`OWNER`, `ADMIN`)
- **Request Body**:

```json
{
  "supplierId": "e4f8b9b2-3e2b-4d4a-9b1b-4f8b9b23e2b4",
  "currency": "USD",
  "taxAmount": 50,
  "notes": "Q4 Replenishment",
  "items": [
    {
      "productId": "550e8400-e29b-41d4-a716-446655440101",
      "quantityOrdered": 100,
      "unitCost": 15.5
    },
    {
      "productId": "550e8400-e29b-41d4-a716-446655440102",
      "quantityOrdered": 50,
      "unitCost": 10
    }
  ]
}
```

- **Response** (`201 Created`):

```json
{
  "success": true,
  "data": {
    "id": "7b9c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
    "organizationId": "550e8400-e29b-41d4-a716-446655440001",
    "supplierId": "e4f8b9b2-3e2b-4d4a-9b1b-4f8b9b23e2b4",
    "supplierName": "Global Steel Inc.",
    "supplierCode": "SUP-STEEL-01",
    "orderNumber": "PO-20261027-A8K2",
    "status": "DRAFT",
    "orderDate": "2026-10-27T10:00:00.000Z",
    "expectedDeliveryDate": null,
    "currency": "USD",
    "subtotal": "2050.0000",
    "taxAmount": "50.0000",
    "totalAmount": "2100.0000",
    "notes": "Q4 Replenishment",
    "createdByUserId": "550e8400-e29b-41d4-a716-446655440010",
    "createdByUserEmail": "buyer@stockpilot.io",
    "approvedByUserId": null,
    "approvedByUserEmail": null,
    "approvedAt": null,
    "cancelledAt": null,
    "createdAt": "2026-10-27T10:00:00.000Z",
    "updatedAt": "2026-10-27T10:00:00.000Z",
    "items": [
      {
        "id": "item-uuid-1",
        "productId": "550e8400-e29b-41d4-a716-446655440101",
        "productSku": "PROD-STEEL-01",
        "productName": "Industrial Steel Bolt",
        "quantityOrdered": "100.0000",
        "quantityReceived": "0.0000",
        "quantityOutstanding": "100.0000",
        "unitCost": "15.5000",
        "lineTotal": "1550.0000",
        "createdAt": "2026-10-27T10:00:00.000Z",
        "updatedAt": "2026-10-27T10:00:00.000Z"
      },
      {
        "id": "item-uuid-2",
        "productId": "550e8400-e29b-41d4-a716-446655440102",
        "productSku": "PROD-BRASS-02",
        "productName": "Heavy Brass Nut",
        "quantityOrdered": "50.0000",
        "quantityReceived": "0.0000",
        "quantityOutstanding": "50.0000",
        "unitCost": "10.0000",
        "lineTotal": "500.0000",
        "createdAt": "2026-10-27T10:00:00.000Z",
        "updatedAt": "2026-10-27T10:00:00.000Z"
      }
    ],
    "receipts": []
  },
  "timestamp": "2026-10-27T10:00:00.000Z"
}
```

#### List Purchase Orders

- **Endpoint**: `GET /api/v1/organizations/:organizationId/purchase-orders`
- **Permissions**: `purchase_orders:read` (`OWNER`, `ADMIN`, `MEMBER`)
- **Query Parameters**: `page`, `limit`, `supplierId`, `status`, `search`, `startDate`, `endDate`, `sortBy`, `sortOrder`

#### Get Purchase Order by ID

- **Endpoint**: `GET /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId`
- **Permissions**: `purchase_orders:read` (`OWNER`, `ADMIN`, `MEMBER`)

#### Update Draft Purchase Order

- **Endpoint**: `PATCH /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId`
- **Permissions**: `purchase_orders:write` (`OWNER`, `ADMIN`)
- **Note**: Only eligible when order is in `DRAFT` status.

#### Submit Purchase Order for Approval

- **Endpoint**: `POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/submit`
- **Permissions**: `purchase_orders:write` (`OWNER`, `ADMIN`)
- **Transitions**: `DRAFT` -> `PENDING_APPROVAL`

#### Approve Purchase Order

- **Endpoint**: `POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/approve`
- **Permissions**: `purchase_orders:write` (`OWNER`, `ADMIN`)
- **Transitions**: `PENDING_APPROVAL` -> `APPROVED`

#### Cancel Purchase Order

- **Endpoint**: `POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/cancel`
- **Permissions**: `purchase_orders:write` (`OWNER`, `ADMIN`)
- **Requirement**: Allowed only when `quantityReceived == 0`.

#### Record Delivery Receipt and Sync Stock

- **Endpoint**: `POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/receipts`
- **Permissions**: `purchase_orders:write` (`OWNER`, `ADMIN`)
- **Request Body**:

```json
{
  "locationId": "550e8400-e29b-41d4-a716-446655440301",
  "reference": "BOL-987654",
  "notes": "Delivered via freight carrier",
  "idempotencyKey": "rcpt-bol-987654-pallet-1",
  "items": [
    {
      "productId": "550e8400-e29b-41d4-a716-446655440101",
      "quantity": 100
    },
    {
      "productId": "550e8400-e29b-41d4-a716-446655440102",
      "quantity": 25
    }
  ]
}
```

- **Response** (`200 OK`): Order details with updated lines (`status`: `PARTIALLY_RECEIVED`), receipt audit record, and stock balances incremented in `inventory_balances` and ledger entries created in `inventory_transactions`.
