# StockPilot AI — AI Demand Forecasting Specification

This document details the architectural design, mathematical foundations, data extraction semantics, walk-forward backtesting framework, multi-tenancy guarantees, and API reference for **Feature 10: AI Demand Forecasting**.

---

## 1. Architectural Paradigm & Design Invariants

StockPilot AI backend implements deterministic statistical demand forecasting directly grounded in historical inventory ledger records.

### Core Invariants:

1. **Zero LLM Hallucination for Numerical Forecasts**:
   - Numerical quantity forecasts are computed via deterministic, explainable mathematical algorithms (`WeightedMovingAverageModel`).
   - Large Language Models are never used to synthesize raw numeric predictions.
2. **Accurate Ledger Demand Semantics**:
   - Demand extraction queries append-only `InventoryTransaction` records where `type = "ISSUE"`.
   - The metric is accurately labeled as **observed consumption** (stock disbursed from warehouse storage locations) rather than point-of-sale retail invoices.
   - Inbound receipts (`RECEIPT`), lateral location movements (`TRANSFER`), and reconciliations (`ADJUSTMENT`) are strictly excluded to prevent distorting demand curves.
3. **Contiguous Calendar Handling & Zero-Filling**:
   - The historical timeline is partitioned into contiguous calendar days in UTC.
   - Days with zero transactions are preserved as `0.0000` consumption rather than omitted, preventing timeline compression and artificial inflation of consumption averages.
4. **Non-Negative Bounded Predictions**:
   - All predicted quantities and prediction bounds satisfy $\hat{y} \ge 0$.
   - Prediction intervals represent mathematical 95% confidence bounds derived from in-sample residual standard deviation ($z = 1.96$).
5. **Walk-Forward Temporal Evaluation**:
   - Backtesting strictly avoids future-data leakage by partitioning the lookback window into train and test horizons.
   - Accuracy is evaluated via Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), and Weighted Absolute Percentage Error (WAPE).
   - Division-by-zero is mathematically guarded when handling intermittent zero-demand datasets.

---

## 2. Mathematical Forecasting Model

### Baseline Algorithm: `WeightedMovingAverage-DoW` (v1.0.0)

The default forecasting model implements a Recency-Weighted Moving Average augmented with Day-of-Week Seasonality indices and empirical residual standard error bounds.

#### Mathematical Steps:

1. **Recency Weighting**:
   Given chronological daily observations $y_1, y_2, \dots, y_N$:
   $$L = \frac{\sum_{i=1}^N i \cdot y_i}{\sum_{i=1}^N i}$$
   Linear weighting $w_i = i$ assigns higher priority to recent weeks while accounting for baseline trends.

2. **Day-of-Week Seasonality**:
   For each day of the week $d \in \{0 \dots 6\}$ (Sunday through Saturday):
   $$\bar{y}_d = \frac{1}{|I_d|} \sum_{i \in I_d} y_i, \quad \bar{y} = \frac{1}{N} \sum_{i=1}^N y_i$$
   $$s_d = \text{clamp}\left(\frac{\bar{y}_d}{\bar{y}}, 0.2, 3.0\right)$$
   If $\bar{y} = 0$, $s_d = 1.0$.

3. **In-Sample Residual Variance & 95% Prediction Intervals**:
   $$e_i = y_i - (L \cdot s_{d(i)})$$
   $$\sigma = \sqrt{\frac{1}{N} \sum_{i=1}^N e_i^2}$$
   For future step $t$ on day-of-week $d(t)$:
   $$\hat{y}_t = \max(0, L \cdot s_{d(t)})$$
   $$\text{LowerBound}_t = \max(0, \hat{y}_t - 1.96 \cdot \sigma)$$
   $$\text{UpperBound}_t = \max(\hat{y}_t, \hat{y}_t + 1.96 \cdot \sigma)$$

---

## 3. Walk-Forward Backtesting Framework

To evaluate forecast reliability without data leakage:

1. **Partitioning**:
   Given a lookback series of length $N$:
   $$\text{Test Size } H = \max(3, \min(\text{horizonDays}, \lfloor N / 3 \rfloor))$$
   $$\text{Train Partition} = [y_1 \dots y_{N - H}], \quad \text{Test Partition} = [y_{N - H + 1} \dots y_N]$$
2. **Metrics**:
   - **MAE (Mean Absolute Error)**: $\frac{1}{H} \sum_{t=1}^H |y_t - \hat{y}_t|$
   - **RMSE (Root Mean Squared Error)**: $\sqrt{\frac{1}{H} \sum_{t=1}^H (y_t - \hat{y}_t)^2}$
   - **WAPE (Weighted Absolute Percentage Error)**:
     $$\text{WAPE} = \frac{\sum_{t=1}^H |y_t - \hat{y}_t|}{\sum_{t=1}^H y_t}$$
     _Zero-Demand Safety_: If $\sum y_t = 0$, $\text{WAPE} = 0.0$ when errors are 0, or $1.0$ when errors are non-zero. Never returns `NaN` or `Infinity`.

---

## 4. RBAC Permission Matrix

| Endpoint                                                     | Method |    Permission     |      Permitted Roles       | Behavior                                                            |
| :----------------------------------------------------------- | :----: | :---------------: | :------------------------: | :------------------------------------------------------------------ |
| `/organizations/:id/forecasts/demand`                        | `POST` | `forecasts:write` |      `OWNER`, `ADMIN`      | Initiates demand forecast calculation and persists run/points.      |
| `/organizations/:id/forecasts/demand`                        | `GET`  | `forecasts:read`  | `OWNER`, `ADMIN`, `MEMBER` | Lists historical forecast runs with pagination and status filters.  |
| `/organizations/:id/forecasts/demand/:forecastId`            | `GET`  | `forecasts:read`  | `OWNER`, `ADMIN`, `MEMBER` | Retrieves detailed run view with all time-series prediction points. |
| `/organizations/:id/forecasts/demand/:forecastId/evaluation` | `GET`  | `forecasts:read`  | `OWNER`, `ADMIN`, `MEMBER` | Retrieves walk-forward backtesting metrics and point comparisons.   |

---

## 5. API Reference

### 5.1 Initiate Demand Forecast Run

`POST /api/v1/organizations/:organizationId/forecasts/demand`

**Request Body**:

```json
{
  "productId": "550e8400-e29b-41d4-a716-446655440101",
  "horizonDays": 14,
  "lookbackDays": 30,
  "granularity": "DAILY"
}
```

**Success Response (`201 Created`)**:

```json
{
  "success": true,
  "data": {
    "id": "c1f7b9e8-4b92-4f32-8416-092f392f41b2",
    "organizationId": "550e8400-e29b-41d4-a716-446655440001",
    "status": "COMPLETED",
    "modelName": "WeightedMovingAverage-DoW",
    "modelVersion": "1.0.0",
    "horizonDays": 14,
    "lookbackDays": 30,
    "granularity": "DAILY",
    "startedAt": "2026-10-27T10:00:00.000Z",
    "completedAt": "2026-10-27T10:00:00.045Z",
    "totalPoints": 14,
    "productCount": 1,
    "points": [
      {
        "id": "pt-1",
        "forecastRunId": "c1f7b9e8-4b92-4f32-8416-092f392f41b2",
        "productId": "550e8400-e29b-41d4-a716-446655440101",
        "productName": "Alpha Industrial Widget",
        "productSku": "WGT-ALPHA",
        "periodStart": "2026-10-28T00:00:00.000Z",
        "periodEnd": "2026-10-28T23:59:59.999Z",
        "predictedDemand": "12.5000",
        "lowerBound": "9.2000",
        "upperBound": "15.8000",
        "unitOfMeasure": "PIECE"
      }
    ],
    "evaluation": {
      "forecastRunId": "c1f7b9e8-4b92-4f32-8416-092f392f41b2",
      "modelName": "WeightedMovingAverage-DoW",
      "modelVersion": "1.0.0",
      "evaluationWindow": {
        "startDate": "2026-10-21",
        "endDate": "2026-10-27",
        "periods": 7
      },
      "aggregateMetrics": {
        "mae": 1.25,
        "rmse": 1.85,
        "wape": 0.12
      }
    }
  },
  "timestamp": "2026-10-27T10:00:00.050Z"
}
```

### 5.2 List Historical Demand Forecast Runs

`GET /api/v1/organizations/:organizationId/forecasts/demand?page=1&limit=20&status=COMPLETED`

**Success Response (`200 OK`)**:

```json
{
  "success": true,
  "data": {
    "runs": [
      {
        "id": "c1f7b9e8-4b92-4f32-8416-092f392f41b2",
        "organizationId": "550e8400-e29b-41d4-a716-446655440001",
        "status": "COMPLETED",
        "modelName": "WeightedMovingAverage-DoW",
        "modelVersion": "1.0.0",
        "horizonDays": 14,
        "lookbackDays": 30,
        "granularity": "DAILY",
        "startedAt": "2026-10-27T10:00:00.000Z",
        "completedAt": "2026-10-27T10:00:00.045Z",
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
  "timestamp": "2026-10-27T10:00:00.050Z"
}
```

### 5.3 Get Run Detail with Points

`GET /api/v1/organizations/:organizationId/forecasts/demand/:forecastId`

### 5.4 Get Walk-Forward Backtesting Evaluation

`GET /api/v1/organizations/:organizationId/forecasts/demand/:forecastId/evaluation`
