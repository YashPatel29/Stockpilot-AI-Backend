# StockPilot AI — Feature 11: Inventory Anomaly Detection API Specification

## 1. Overview & Safety Principles

The Inventory Anomaly Detection subsystem provides multi-tenant, statistical surveillance over inventory ledger movements (`InventoryTransaction`) to surface unusual stock patterns for operational review.

### Core Invariants & Safety Principles

1. **Operational Review Signals, Never Proof of Fraud**:
   - Anomaly findings are probabilistic flags indicating statistical deviation from typical operations.
   - Findings must **never** be interpreted as automatic evidence of theft, fraud, employee misconduct, or grounds for disciplinary action.
   - System explanations are transparent, factual, and strictly grounded in historical baseline numbers.
2. **Strictly Non-Destructive**:
   - The anomaly detection engine **never** modifies stock balances, reverses ledger transactions, blocks user transactions, or deletes historical records.
   - All reviews and reconciliations remain under human administrative authority.
3. **Multi-Tenancy & Zero Data Leakage**:
   - Every detection run and finding is hard-scoped to `organizationId`.
   - Idempotency deduplication (`dedupKey`) is scoped by `[organizationId, dedupKey]`.

---

## 2. Detection Strategies & Mathematical Grounding

The engine executes 4 modular statistical strategies:

### 1. `UNUSUALLY_LARGE_MOVEMENT`

- **Focus**: Evaluates receipts, issues, and adjustments.
- **Algorithm**:
  - Collects historical transactions for `(productId, transactionType)` over a lookback baseline (up to 90 days).
  - Requires a minimum baseline sample size of $\ge 4$ transactions.
  - Computes Median $\tilde{x} = \text{median}(X)$ and Median Absolute Deviation $\text{MAD} = \text{median}(|x_i - \tilde{x}|)$.
  - Calculates modified Z-score $M_i = \frac{0.6745 \cdot (x_i - \tilde{x})}{\text{MAD}}$ when $\text{MAD} > 0$.
  - Flags transaction if $M_i \ge 3.5$ and $x_i > \tilde{x}$.
  - Fallback: If $\text{MAD} = 0$ (constant batch sizing), flags if $x_i \ge 3 \cdot \tilde{x}$ and $x_i - \tilde{x} \ge 10$.
- **Severity**:
  - `CRITICAL`: $M_i \ge 7.0$ or $x_i \ge 10 \cdot \tilde{x}$.
  - `HIGH`: $M_i \ge 5.0$ or $x_i \ge 5 \cdot \tilde{x}$.
  - `MEDIUM`: $M_i \ge 3.5$.
  - `LOW`: Otherwise.
- **Dedup Key**: `{organizationId}:large_movement:{transactionId}`.

### 2. `UNUSUAL_ADJUSTMENT`

- **Focus**: Evaluates `ADJUSTMENT` transactions for sudden large shrinkage (stock loss) or uncharacteristic adjustments.
- **Algorithm**:
  - Evaluates absolute delta $|q_\Delta|$ against historical cycle-count adjustments for the product.
  - Flags negative shrinkage or uncharacteristically large positive discrepancies.
- **Severity**:
  - `CRITICAL`: Negative shrinkage with $|q_\Delta| \ge 100$ or modified Z-score $\ge 6.0$.
  - `HIGH`: Negative shrinkage with $|q_\Delta| \ge 50$ or modified Z-score $\ge 4.5$.
  - `MEDIUM`: Moderate adjustment discrepancy $|q_\Delta| \ge 15$.
- **Dedup Key**: `{organizationId}:unusual_adjustment:{transactionId}`.

### 3. `REPEATED_ADJUSTMENTS`

- **Focus**: Evaluates frequency surges of adjustments on the same product and location.
- **Algorithm**:
  - Groups adjustments by `(productId, locationId)`.
  - Flags when $\ge 3$ adjustments occur within a short span (e.g. $\le 7$ days) or $\ge 4$ adjustments within the window.
- **Severity**:
  - `HIGH`: $\ge 6$ adjustments in span.
  - `MEDIUM`: $3 - 5$ adjustments in span.
- **Dedup Key**: `{organizationId}:repeated_adj:{productId}:{locationId}:{dateBucket}`.

### 4. `UNUSUAL_TRANSFER_PATTERN`

- **Focus**: Evaluates lateral warehouse movements (`TRANSFER`).
- **Algorithm**:
  - Analyzes pairwise transfers for the same product to detect rapid rebound transfers (Location A $\to$ B, followed by B $\to$ A within 7 days).
  - Safety Invariant: Lateral transfers are internal movements and are never treated as customer demand.
- **Severity**:
  - `HIGH`: Rebound quantity $\ge 50$ units.
  - `MEDIUM`: Rebound quantity $\ge 10$ units.
- **Dedup Key**: `{organizationId}:rebound_transfer:{transferOutId}:{transferBackId}`.

---

## 3. RBAC & Review Permissions

| Role       | Permissions                         | Allowed Actions                                                                                               |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **OWNER**  | `anomalies:read`, `anomalies:write` | Initiate detection runs, view runs & findings, update review status (`ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`) |
| **ADMIN**  | `anomalies:read`, `anomalies:write` | Initiate detection runs, view runs & findings, update review status (`ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`) |
| **MEMBER** | `anomalies:read`                    | View detection runs, list findings, view finding detail & evidence                                            |

---

## 4. API Endpoints

All endpoints are mounted under `/api/v1/organizations/:organizationId/anomalies`.

### 1. Initiate Detection Run

- **Route**: `POST /detection-runs`
- **Permission**: `ANOMALIES_WRITE` (`OWNER`, `ADMIN`)
- **Request Body**:
  ```json
  {
    "windowDays": 30,
    "productId": "550e8400-e29b-41d4-a716-446655440101",
    "warehouseId": "550e8400-e29b-41d4-a716-446655440201",
    "categories": ["UNUSUALLY_LARGE_MOVEMENT", "UNUSUAL_ADJUSTMENT"],
    "minSeverity": "HIGH"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "id": "550e8400-e29b-41d4-a716-446655440901",
      "organizationId": "550e8400-e29b-41d4-a716-446655440001",
      "status": "COMPLETED",
      "windowDays": 30,
      "startedAt": "2026-10-27T10:00:00.000Z",
      "completedAt": "2026-10-27T10:00:01.500Z",
      "initiatedByUserId": "550e8400-e29b-41d4-a716-446655440020",
      "findingsCount": 2,
      "summary": {
        "evaluatedWindowTransactions": 142,
        "historicalBaselineTransactions": 510,
        "totalCandidatesEmitted": 2,
        "newFindingsPersisted": 2,
        "executedStrategies": ["UNUSUALLY_LARGE_MOVEMENT", "UNUSUAL_ADJUSTMENT"]
      },
      "findings": [ ... ]
    },
    "timestamp": "2026-10-27T10:00:01.500Z"
  }
  ```

### 2. List Detection Runs

- **Route**: `GET /detection-runs`
- **Permission**: `ANOMALIES_READ`
- **Query Parameters**: `page` (default: 1), `limit` (default: 20), `status`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "runs": [ ... ],
      "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
    },
    "timestamp": "2026-10-27T10:00:00.000Z"
  }
  ```

### 3. Get Detection Run Detail

- **Route**: `GET /detection-runs/:runId`
- **Permission**: `ANOMALIES_READ`
- **Response** (`200 OK`): Single run with findings array.

### 4. List Anomalies

- **Route**: `GET /`
- **Permission**: `ANOMALIES_READ`
- **Query Parameters**:
  - `page`, `limit`
  - `category`: `UNUSUALLY_LARGE_MOVEMENT` | `UNUSUAL_ADJUSTMENT` | `REPEATED_ADJUSTMENTS` | `UNUSUAL_TRANSFER_PATTERN`
  - `severity`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
  - `status`: `OPEN` | `ACKNOWLEDGED` | `RESOLVED` | `DISMISSED`
  - `productId`, `warehouseId`, `detectionRunId`
  - `startDate`, `endDate`
  - `sortBy`: `createdAt` | `detectedAt` | `severity` | `score`
  - `sortOrder`: `asc` | `desc`
- **Response** (`200 OK`): Paginated findings list.

### 5. Get Anomaly Detail

- **Route**: `GET /:anomalyId`
- **Permission**: `ANOMALIES_READ`
- **Response** (`200 OK`): Complete finding record with attached relations and JSON evidence payload.

### 6. Update Anomaly Status

- **Route**: `PATCH /:anomalyId/status`
- **Permission**: `ANOMALIES_WRITE` (`OWNER`, `ADMIN`)
- **Request Body**:
  ```json
  {
    "status": "RESOLVED",
    "resolutionNote": "Physical stock count conducted on Bay 4. Missing 50 units located in staging area and reconciled."
  }
  ```
- **Lifecycle Invariants**:
  - Allowed transitions: `OPEN` $\to$ `ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`; `ACKNOWLEDGED` $\to$ `RESOLVED`, `DISMISSED`.
  - Terminal statuses (`RESOLVED`, `DISMISSED`) cannot be transitioned back to `OPEN`.
- **Response** (`200 OK`): Updated anomaly finding DTO with reviewer and timestamp metadata.
