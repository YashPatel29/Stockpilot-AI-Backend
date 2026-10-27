# StockPilot AI — Notifications and Audit Logs Specification

This document details the architectural design, security invariants, event coverage, metadata redaction rules, multi-tenancy guarantees, and API reference for **Feature 9: Notifications and Audit Logs**.

---

## 1. Centralized Permission Matrix & Security Controls

StockPilot AI isolates personal notification streams to individual users while enforcing strict organization-scoped Role-Based Access Control (RBAC) on audit log inspection.

### 1.1 Permission Matrix

| Subsystem / Endpoint                                    |      Required Permission / Scope      |  Allowed Roles / Principals  | Invariants & Anti-IDOR Guarantees                                                                                                                                             |
| :------------------------------------------------------ | :-----------------------------------: | :--------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Notifications** (`/api/v1/notifications/*`)           |      Authenticated User Session       | Any valid authenticated user | Queries and mutations are strictly scoped to `req.user.id`. Users can never query, read, or modify notifications belonging to another user.                                   |
| **Audit Logs** (`/api/v1/organizations/:id/audit-logs`) | `audit_logs:read` (`audit_logs:read`) |       `OWNER`, `ADMIN`       | Caller must hold an active membership in the organization with an administrative role. `MEMBER` users are rejected with `403 Forbidden`. Non-members receive `404 Not Found`. |
| **Audit Modifications** (POST / PUT / PATCH / DELETE)   |          _None_ (Immutable)           |    _No ordinary clients_     | The audit subsystem is strictly append-only. No HTTP mutation or deletion endpoints exist for audit records.                                                                  |

---

## 2. Notifications Subsystem

### 2.1 Notification Types (`NotificationType`)

| Type                       | Intended Recipients                    | Trigger Event                                                                                       |
| :------------------------- | :------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `INFO`                     | Individual User                        | General informational system notice.                                                                |
| `WARNING`                  | Individual User / Admins               | General operational warning.                                                                        |
| `PURCHASE_ORDER_SUBMITTED` | Organization `OWNER` & `ADMIN` members | A purchase order has been submitted for approval by a team member.                                  |
| `PURCHASE_ORDER_APPROVED`  | Purchase Order Creator                 | The submitted purchase order has been reviewed and approved by an administrator.                    |
| `PURCHASE_ORDER_CANCELLED` | Purchase Order Creator                 | The purchase order was cancelled before inventory receipt.                                          |
| `PURCHASE_ORDER_RECEIVED`  | Purchase Order Creator                 | Items for the purchase order have been received and booked into inventory.                          |
| `LOW_STOCK_ALERT`          | Organization `OWNER` & `ADMIN` members | Stock issuance, adjustment, or transfer caused available balance to drop below `lowStockThreshold`. |
| `INVITATION_RECEIVED`      | Registered User matching Invitee Email | An invitation to join an organization was issued for the user's email.                              |
| `ROLE_UPDATED`             | Target Organization Member             | The member's role was changed (e.g. promoted to `ADMIN`).                                           |
| `SECURITY_EVENT`           | Targeted User / Security Admins        | Security-relevant authentication event or credential change.                                        |

### 2.2 Anti-Spam & Recipient Resolution Rules

- Notifications are recipient-targeted; organization-wide mass broadcasts are strictly avoided.
- Managerial notifications (`PURCHASE_ORDER_SUBMITTED`, `LOW_STOCK_ALERT`) are routed only to active `OWNER` and `ADMIN` members.
- Operational status updates (`PURCHASE_ORDER_APPROVED`, `ROLE_UPDATED`) are routed directly to the author or target user.
- Read operations (`PATCH /api/v1/notifications/:id/read`, `PATCH /api/v1/notifications/read-all`) are completely idempotent.
- Marking an already-read notification as read returns the existing state without mutating timestamps.

---

## 3. Audit Logs Subsystem

### 3.1 Standard Action Catalog

Audit action strings follow a structured `<domain>.<event>` naming convention:

| Action Identifier          | Resource Type            | Trigger Description                                         |
| :------------------------- | :----------------------- | :---------------------------------------------------------- |
| `auth.registered`          | `User`                   | New user account created.                                   |
| `auth.login`               | `User`                   | User successfully authenticated and session issued.         |
| `organization.created`     | `Organization`           | New organization tenant created.                            |
| `organization.updated`     | `Organization`           | Organization name or slug updated.                          |
| `organization.deactivated` | `Organization`           | Organization safely deactivated.                            |
| `invitation.created`       | `OrganizationInvitation` | Member invitation dispatched (tokens are never logged).     |
| `invitation.accepted`      | `OrganizationInvitation` | Invitee accepted invitation and joined organization.        |
| `invitation.revoked`       | `OrganizationInvitation` | Administrator revoked an active invitation.                 |
| `membership.role_updated`  | `OrganizationMembership` | Member promoted or demoted.                                 |
| `membership.removed`       | `OrganizationMembership` | Member removed from organization.                           |
| `category.created`         | `ProductCategory`        | Product catalog category created.                           |
| `category.updated`         | `ProductCategory`        | Product category details updated.                           |
| `product.created`          | `Product`                | Product created with SKU, UOM, and pricing.                 |
| `product.updated`          | `Product`                | Product details updated.                                    |
| `product.archived`         | `Product`                | Product soft-archived.                                      |
| `product.reactivated`      | `Product`                | Product restored to active status.                          |
| `warehouse.created`        | `Warehouse`              | Warehouse facility created.                                 |
| `warehouse.updated`        | `Warehouse`              | Warehouse facility updated.                                 |
| `warehouse.deactivated`    | `Warehouse`              | Warehouse deactivated with cascading location deactivation. |
| `location.created`         | `StorageLocation`        | Storage location created in warehouse.                      |
| `location.updated`         | `StorageLocation`        | Storage location details updated.                           |
| `location.deactivated`     | `StorageLocation`        | Storage location deactivated.                               |
| `inventory.received`       | `InventoryTransaction`   | Stock received into location and ledger entry created.      |
| `inventory.issued`         | `InventoryTransaction`   | Stock issued from location and ledger entry created.        |
| `inventory.adjusted`       | `InventoryTransaction`   | Stock adjusted and ledger entry created.                    |
| `inventory.transferred`    | `InventoryTransaction`   | Stock transferred between locations (1 logical record).     |
| `supplier.created`         | `Supplier`               | Vendor record created.                                      |
| `supplier.updated`         | `Supplier`               | Vendor record updated.                                      |
| `supplier.deactivated`     | `Supplier`               | Vendor deactivated.                                         |
| `purchase_order.created`   | `PurchaseOrder`          | Purchase order draft created with calculated lines.         |
| `purchase_order.submitted` | `PurchaseOrder`          | Purchase order submitted for managerial approval.           |
| `purchase_order.approved`  | `PurchaseOrder`          | Purchase order approved by administrator.                   |
| `purchase_order.cancelled` | `PurchaseOrder`          | Unfulfilled purchase order cancelled.                       |
| `purchase_order.received`  | `PurchaseOrderReceipt`   | Delivery receipt recorded and stock synced into inventory.  |

### 3.2 Metadata Redaction & Integrity Rules

1. **Recursive Redaction**: All metadata payloads pass through `sanitizeAuditMetadata()`. Any key matching sensitive patterns (`/password/i`, `/token/i`, `/secret/i`, `/hash/i`, `/cookie/i`, `/authorization/i`, `/apikey/i`, `/credential/i`) is recursively replaced with `"[REDACTED]"`.
2. **Transaction Consistency**: In-transaction audit logging (`recordAuditInTx(tx, ...)`) ensures that if a business mutation rolls back, its audit entry rolls back atomically. Failed operations never generate false success audit entries.
3. **Retention & Referencing**: Foreign keys from `AuditLog` to `User` and `Organization` use `onDelete: SetNull`. Historical audit entries persist even if an actor is removed or an organization is deactivated.

---

## 4. API Endpoints Reference

### 4.1 Notifications API

#### 1. List Notifications

`GET /api/v1/notifications`

**Query Parameters:**

- `page` (optional integer, default `1`)
- `limit` (optional integer, default `20`, max `100`)
- `unreadOnly` (optional boolean: `true` / `false`)
- `type` (optional enum `NotificationType`)
- `organizationId` (optional UUID)

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440111",
        "organizationId": "550e8400-e29b-41d4-a716-446655440001",
        "recipientUserId": "550e8400-e29b-41d4-a716-446655440010",
        "type": "PURCHASE_ORDER_SUBMITTED",
        "title": "Purchase Order Submitted",
        "message": "Purchase order PO-20261027-A1B2 has been submitted for approval.",
        "data": {
          "purchaseOrderId": "po-uuid-1",
          "orderNumber": "PO-20261027-A1B2",
          "totalAmount": "1450.0000"
        },
        "readAt": null,
        "createdAt": "2026-10-27T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "timestamp": "2026-10-27T10:00:01.000Z"
}
```

#### 2. Get Unread Notifications Count

`GET /api/v1/notifications/unread-count`

**Query Parameters:**

- `organizationId` (optional UUID)

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "count": 4
  },
  "timestamp": "2026-10-27T10:00:01.000Z"
}
```

#### 3. Mark Single Notification as Read

`PATCH /api/v1/notifications/:notificationId/read`

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440111",
    "organizationId": "550e8400-e29b-41d4-a716-446655440001",
    "recipientUserId": "550e8400-e29b-41d4-a716-446655440010",
    "type": "PURCHASE_ORDER_SUBMITTED",
    "title": "Purchase Order Submitted",
    "message": "Purchase order PO-20261027-A1B2 has been submitted for approval.",
    "data": { "orderNumber": "PO-20261027-A1B2" },
    "readAt": "2026-10-27T10:05:00.000Z",
    "createdAt": "2026-10-27T10:00:00.000Z"
  },
  "timestamp": "2026-10-27T10:05:00.000Z"
}
```

#### 4. Mark All Notifications as Read

`PATCH /api/v1/notifications/read-all`

**Query Parameters:**

- `organizationId` (optional UUID to scope mark-all to a specific organization)

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "updatedCount": 4
  },
  "timestamp": "2026-10-27T10:05:00.000Z"
}
```

---

### 4.2 Audit Logs API

#### List Organization Audit Logs

`GET /api/v1/organizations/:organizationId/audit-logs`

**Headers:**

- `Authorization: Bearer <accessToken>`

**Query Parameters:**

- `page` (optional integer, default `1`)
- `limit` (optional integer, default `20`, max `100`)
- `action` (optional string, e.g. `inventory.received`)
- `resourceType` (optional string, e.g. `Product`, `PurchaseOrder`)
- `resourceId` (optional string)
- `actorUserId` (optional UUID)
- `startDate` (optional ISO 8601 string)
- `endDate` (optional ISO 8601 string)

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "auditLogs": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440999",
        "organizationId": "550e8400-e29b-41d4-a716-446655440001",
        "actorUserId": "550e8400-e29b-41d4-a716-446655440010",
        "actor": {
          "id": "550e8400-e29b-41d4-a716-446655440010",
          "name": "Alice Smith",
          "email": "alice@stockpilot.io"
        },
        "action": "inventory.received",
        "resourceType": "InventoryTransaction",
        "resourceId": "tx-uuid-1",
        "metadata": {
          "productId": "prod-uuid-1",
          "warehouseId": "wh-uuid-1",
          "destinationLocationId": "loc-uuid-1",
          "quantity": "50.0000",
          "reference": "PO-20261027-A1B2"
        },
        "requestId": "550e8400-e29b-41d4-a716-446655440088",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0",
        "createdAt": "2026-10-27T10:10:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "timestamp": "2026-10-27T10:10:01.000Z"
}
```

---

## 5. Administrative Operational Guidelines

1. **Tamper Resistance**: The application layer prevents ordinary clients from updating, inserting, or deleting audit logs. Database administrators retain raw SQL privileges, but application connections should operate under least-privilege credentials.
2. **Retention Policy**: Audit logs are designed for permanent storage. If compliance archiving is configured, older partitions should be offloaded to cold object storage (S3 Glacier/GCS Coldline) via dedicated maintenance scripts, never by routine application DELETE queries.
