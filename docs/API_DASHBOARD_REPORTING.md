# StockPilot AI — Inventory Dashboard and Reporting Specification

This document details the architectural design, metric definitions, aggregation logic, multi-tenancy rules, and API reference for **Feature 8: Inventory Dashboard and Reporting**.

---

## 1. Centralized Permission Matrix & Authorization Rules

StockPilot AI implements organization-scoped Role-Based Access Control (RBAC). Dashboard and report endpoints require the `reports:read` permission declared in `src/modules/organizations/rbac/permissions.ts`.

### 1.1 Reporting Permission Matrix

| Action / Permission |       Allowed Roles        | Invariants & Guard Conditions                                                                                                                                                                         |
| :------------------ | :------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`reports:read`**  | `OWNER`, `ADMIN`, `MEMBER` | Caller must hold an active membership in the target organization. All metrics, counts, and summaries are strictly scoped to `organizationId`. Cross-tenant requests uniformly return `404 Not Found`. |

---

## 2. Metric Definitions & Aggregation Rules

All metrics are computed directly from authoritative PostgreSQL database tables (`products`, `warehouses`, `storage_locations`, `inventory_balances`, `inventory_transactions`, and `purchase_orders`).

### 2.1 Current-State vs. Date-Filtered Metrics

1. **Current Inventory Metrics**:
   - `totalActiveProducts`: Count of active products (`status = 'ACTIVE'`).
   - `totalActiveWarehouses`: Count of active warehouses (`status = 'ACTIVE'`).
   - `totalActiveStorageLocations`: Count of active storage locations (`status = 'ACTIVE'`).
   - `positiveStockBalancesCount`: Count of `InventoryBalance` records where `quantityOnHand > 0`.
   - `zeroStockBalancesCount`: Count of `InventoryBalance` records where `quantityOnHand = 0`.
   - `unitsOnHand`: Total quantity on hand **strictly grouped by `unitOfMeasure`** (`[{ unitOfMeasure: "PCS", totalQuantityOnHand: "150.0000" }]`). Incompatible units (e.g., kilograms, liters, and pieces) are never summed together into a single misleading scalar.

2. **Date-Window Movement Metrics**:
   - Bounded by `startDate` and `endDate` timestamps. Default window: trailing 30 days up to the request time (`Date.now()`).
   - `totalTransactions`: Count of unique ledger entries in `inventory_transactions`.
   - `countsByType`: Breakdown across operation classifications: `RECEIPT`, `ISSUE`, `ADJUSTMENT`, `TRANSFER`.
   - `quantitiesByTypeAndUom`: Total operational quantity per transaction type and unit of measure.
   - **Transfer Semantics**: A stock transfer is recorded as a single logical ledger record (`type = 'TRANSFER'`) linking `sourceLocationId` to `destinationLocationId`. It is counted as **1** transfer operation without double-counting legs.

3. **Procurement Commitments**:
   - `totalCommittedValue`: Sum of `totalAmount` for committed purchase orders in `APPROVED`, `PARTIALLY_RECEIVED`, and `RECEIVED` status.
   - `totalDraftValue`: Sum of `totalAmount` for unapproved orders in `DRAFT` and `PENDING_APPROVAL` status.
   - `totalCancelledValue`: Segregated sum of `totalAmount` for `CANCELLED` orders. Cancelled orders are strictly excluded from committed purchasing totals.
   - `pendingApprovalCount`: Number of orders currently awaiting managerial approval.

4. **Low-Stock Evaluation**:
   - Source threshold: Uses the native `lowStockThreshold` field defined on `Product`.
   - Organization-wide aggregation: Evaluates total quantity on hand across all active locations in the organization (`totalQuantityOnHand = sum(balances.quantityOnHand)`).
   - Low-stock condition: A product is included if `product.lowStockThreshold > 0` and `totalQuantityOnHand <= product.lowStockThreshold`.
   - Deficit: Defined as `product.lowStockThreshold - totalQuantityOnHand`.

---

## 3. API Endpoints Reference

All endpoints require Bearer token authentication: `Authorization: Bearer <accessToken>`.

### 3.1 Inventory Dashboard

#### Get Executive Inventory Dashboard

- **Endpoint**: `GET /api/v1/organizations/:organizationId/dashboard/inventory`
- **Permissions**: `reports:read` (`OWNER`, `ADMIN`, `MEMBER`)
- **Query Parameters**:
  - `startDate` (optional ISO-8601 datetime)
  - `endDate` (optional ISO-8601 datetime)
  - `recentLimit` (optional integer, 1-50, default: `10`)
- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "overview": {
      "totalActiveProducts": 25,
      "totalActiveWarehouses": 3,
      "totalActiveStorageLocations": 18,
      "positiveStockBalancesCount": 14,
      "zeroStockBalancesCount": 4,
      "unitsOnHand": [
        { "unitOfMeasure": "PCS", "totalQuantityOnHand": "150.0000" },
        { "unitOfMeasure": "KG", "totalQuantityOnHand": "12.5000" }
      ]
    },
    "movementsWindow": {
      "startDate": "2026-09-27T10:00:00.000Z",
      "endDate": "2026-10-27T10:00:00.000Z",
      "totalTransactions": 42,
      "countsByType": {
        "RECEIPT": 20,
        "ISSUE": 12,
        "ADJUSTMENT": 4,
        "TRANSFER": 6
      },
      "quantitiesByTypeAndUom": [
        { "type": "RECEIPT", "unitOfMeasure": "PCS", "totalQuantity": "200.0000" },
        { "type": "ISSUE", "unitOfMeasure": "PCS", "totalQuantity": "50.0000" }
      ]
    },
    "purchaseOrdersSummary": {
      "totalOrdersCount": 14,
      "countsByStatus": {
        "DRAFT": 2,
        "PENDING_APPROVAL": 1,
        "APPROVED": 3,
        "PARTIALLY_RECEIVED": 2,
        "RECEIVED": 5,
        "CANCELLED": 1
      },
      "totalCommittedValue": "8500.0000",
      "totalDraftValue": "750.0000",
      "totalCancelledValue": "700.0000",
      "pendingApprovalCount": 1
    },
    "recentTransactions": [
      {
        "id": "e7b0a880-9fa5-455a-935d-efc6248c8bfa",
        "productId": "550e8400-e29b-41d4-a716-446655440301",
        "productSku": "SKU-01",
        "productName": "Steel Bolt",
        "unitOfMeasure": "PCS",
        "type": "RECEIPT",
        "quantity": "100.0000",
        "quantityDelta": "100.0000",
        "warehouseId": "550e8400-e29b-41d4-a716-446655440101",
        "warehouseName": "Central Hub",
        "sourceLocationId": null,
        "sourceLocationCode": null,
        "destinationLocationId": "550e8400-e29b-41d4-a716-446655440201",
        "destinationLocationCode": "A-01",
        "reference": "PO-1001",
        "notes": "Delivered via freight",
        "performedByUserId": "550e8400-e29b-41d4-a716-446655440010",
        "performedByUserName": "Alice",
        "createdAt": "2026-10-27T10:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-10-27T10:00:00.000Z"
}
```

---

### 3.2 Inventory Reports

#### 1. Inventory by Warehouse

- **Endpoint**: `GET /api/v1/organizations/:organizationId/reports/inventory-by-warehouse`
- **Query Parameters**: `warehouseId` (UUID), `categoryId` (UUID)
- **Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "warehouses": [
      {
        "warehouseId": "550e8400-e29b-41d4-a716-446655440101",
        "warehouseCode": "WH-NORTH",
        "warehouseName": "North Hub",
        "status": "ACTIVE",
        "locationCount": 5,
        "positiveStockLocationsCount": 3,
        "distinctProductsCount": 2,
        "stockByUom": [
          { "unitOfMeasure": "PCS", "totalQuantityOnHand": "80.0000" },
          { "unitOfMeasure": "KG", "totalQuantityOnHand": "10.5000" }
        ]
      }
    ]
  },
  "timestamp": "2026-10-27T10:00:00.000Z"
}
```

#### 2. Inventory Movements Report

- **Endpoint**: `GET /api/v1/organizations/:organizationId/reports/inventory-movements`
- **Query Parameters**: `page`, `limit`, `startDate`, `endDate`, `type`, `productId`, `warehouseId`, `locationId`, `sortBy`, `sortOrder`
- **Response** (`200 OK`): Paginated movement list with summary counts by type and quantities by type and UOM.

#### 3. Product Inventory Report

- **Endpoint**: `GET /api/v1/organizations/:organizationId/reports/product-inventory`
- **Query Parameters**: `page`, `limit`, `productId`, `search`, `categoryId`, `warehouseId`, `locationId`, `sortBy`, `sortOrder`
- **Response** (`200 OK`): Paginated product list guaranteeing 1 row per product without duplicate product rows, including location breakdown.

#### 4. Low-Stock Report

- **Endpoint**: `GET /api/v1/organizations/:organizationId/reports/low-stock`
- **Query Parameters**: `page`, `limit`, `categoryId`, `thresholdOverride`, `includeZeroThreshold`, `sortBy`, `sortOrder`
- **Response** (`200 OK`): List of products where organization-wide stock is less than or equal to `lowStockThreshold`, displaying current stock and replenishment deficit.

#### 5. Purchase Order Report

- **Endpoint**: `GET /api/v1/organizations/:organizationId/reports/purchase-orders`
- **Query Parameters**: `page`, `limit`, `startDate`, `endDate`, `supplierId`, `status`, `sortBy`, `sortOrder`
- **Response** (`200 OK`): Status breakdown, committed purchasing value, and line-level fulfillment progress (`totalQuantityOrdered`, `totalQuantityReceived`, `totalQuantityOutstanding`).

#### 6. Recent Activity Report

- **Endpoint**: `GET /api/v1/organizations/:organizationId/reports/recent-activity`
- **Query Parameters**: `limit` (integer, 1-100, default: `20`)
- **Response** (`200 OK`): Flat array of recent inventory transactions with actor and location metadata.
