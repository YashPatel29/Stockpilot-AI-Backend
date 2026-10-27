# StockPilot AI — Database & Prisma ORM Guide

## 1. Overview & Setup

StockPilot AI uses **Prisma ORM** (v7+) with **PostgreSQL**.
In accordance with Prisma 7, connection URLs are defined in `prisma.config.ts` and runtime connections use `@prisma/adapter-pg`.

### Foundational Multi-Tenant Model:

```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  status    String   @default("ACTIVE")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([slug])
  @@map("tenants")
}
```

---

## 2. Local PostgreSQL Setup

### Option A: Using Docker (Recommended for Local Dev)

A standalone PostgreSQL container can be launched with Docker:

```bash
docker run -d \
  --name stockpilot-postgres \
  -e POSTGRES_USER=stockpilot_user \
  -e POSTGRES_PASSWORD=stockpilot_pass \
  -e POSTGRES_DB=stockpilot_dev \
  -p 5432:5432 \
  postgres:16-alpine
```

### Option B: Local Native PostgreSQL

1. Create a database user and database:

```sql
CREATE USER stockpilot_user WITH PASSWORD 'stockpilot_pass';
CREATE DATABASE stockpilot_dev OWNER stockpilot_user;
GRANT ALL PRIVILEGES ON DATABASE stockpilot_dev TO stockpilot_user;
```

2. Verify connectivity:

```bash
psql -U stockpilot_user -d stockpilot_dev -h localhost
```

---

## 3. Prisma Workflows & Commands

### Generate Prisma Client

Generates TypeScript types and client binaries in `node_modules/@prisma/client`:

```bash
npm run prisma:generate
```

### Development Migrations

Creates a new migration file and applies it to your local database:

```bash
npm run prisma:migrate -- --name init_tenants
```

### Production Migrations

Applies pending migrations without generating new ones or resetting the database:

```bash
npm run prisma:deploy
```

### Prisma Studio

Inspect database tables in an interactive GUI:

```bash
npm run prisma:studio
```

---

## 4. Production Connection Pooling Considerations

In high-concurrency production environments (e.g. AWS ECS, Kubernetes, Cloud Run), direct database connections from multiple Node.js instances can quickly exhaust PostgreSQL's `max_connections` limit.

### Recommended Best Practices:

1. **Connection String Sizing**:
   Append `connection_limit` and `pool_timeout` parameters to `DATABASE_URL`:
   ```
   DATABASE_URL="postgresql://user:pass@pg-bouncer-host:6432/stockpilot_prod?pgbouncer=true&connection_limit=5&pool_timeout=10"
   ```
2. **PgBouncer or Supabase/AWS RDS Proxy**:
   - Use transaction-mode connection pooling (e.g., PgBouncer or AWS RDS Proxy).
   - When using PgBouncer, add `?pgbouncer=true` to ensure Prisma uses prepared statement modes compatible with connection pooling.
3. **Application Singleton**:
   PrismaClient is instantiated once in `src/infrastructure/database/prisma.client.ts`. Multiple imports reuse this single client, preventing connection leaks.
4. **Graceful Draining**:
   On `SIGTERM`/`SIGINT`, `databaseService.disconnect()` cleanly releases pooled sockets back to the PostgreSQL server.

---

## 5. Migration Safety Rules

- **NEVER** run `prisma migrate reset` or `prisma db push --force-reset` on staging or production.
- **NEVER** commit plain-text credentials or production database URLs into repository files.
- Always apply schema changes via versioned migration files in `prisma/migrations/`.
- Ensure column additions on large production tables provide non-blocking defaults or are added via expandable migration patterns.

---

## 6. Demand Forecasting Schema (Feature 10)

Feature 10 introduces organization-scoped demand forecasting models:

```prisma
enum ForecastRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  INSUFFICIENT_HISTORY
}

model DemandForecastRun {
  id                String            @id @default(uuid())
  organizationId    String            @map("organization_id")
  status            ForecastRunStatus @default(PENDING)
  modelName         String            @map("model_name")
  modelVersion      String            @map("model_version")
  horizonDays       Int               @map("horizon_days")
  lookbackDays      Int               @map("lookback_days")
  granularity       String            @default("DAILY")
  startedAt         DateTime?         @map("started_at")
  completedAt       DateTime?         @map("completed_at")
  initiatedByUserId String?           @map("initiated_by_user_id")
  errorCode         String?           @map("error_code")
  errorMessage      String?           @map("error_message")
  metadata          Json?             @map("metadata")
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  organization    Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  initiatedByUser User?                 @relation(fields: [initiatedByUserId], references: [id], onDelete: SetNull)
  points          DemandForecastPoint[]

  @@index([organizationId, createdAt])
  @@index([organizationId, status])
  @@map("demand_forecast_runs")
}

model DemandForecastPoint {
  id              String   @id @default(uuid())
  forecastRunId   String   @map("forecast_run_id")
  productId       String   @map("product_id")
  periodStart     DateTime @map("period_start")
  periodEnd       DateTime @map("period_end")
  predictedDemand Decimal  @map("predicted_demand") @db.Decimal(18, 4)
  lowerBound      Decimal? @map("lower_bound") @db.Decimal(18, 4)
  upperBound      Decimal? @map("upper_bound") @db.Decimal(18, 4)
  unitOfMeasure   String   @map("unit_of_measure")
  createdAt       DateTime @default(now()) @map("created_at")

  forecastRun DemandForecastRun @relation(fields: [forecastRunId], references: [id], onDelete: Cascade)
  product     Product           @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([forecastRunId, productId, periodStart])
  @@index([forecastRunId])
  @@index([productId])
  @@index([periodStart])
  @@map("demand_forecast_points")
}
```

---

## 7. Inventory Anomaly Detection Schema (Feature 11)

Feature 11 introduces organization-scoped inventory anomaly findings and detection run tracking:

```prisma
enum AnomalyCategory {
  UNUSUALLY_LARGE_MOVEMENT
  UNUSUAL_ADJUSTMENT
  REPEATED_ADJUSTMENTS
  UNUSUAL_FREQUENCY
  UNUSUAL_TRANSFER_PATTERN
}

enum AnomalySeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum AnomalyStatus {
  OPEN
  ACKNOWLEDGED
  RESOLVED
  DISMISSED
}

enum DetectionRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  INSUFFICIENT_DATA
}

model InventoryAnomaly {
  id                   String          @id @default(uuid())
  organizationId       String          @map("organization_id")
  category             AnomalyCategory
  severity             AnomalySeverity
  status               AnomalyStatus   @default(OPEN)
  productId            String?         @map("product_id")
  warehouseId          String?         @map("warehouse_id")
  locationId           String?         @map("location_id")
  transactionId        String?         @map("transaction_id")
  strategyName         String          @map("strategy_name")
  strategyVersion      String          @map("strategy_version")
  score                Decimal?        @map("score") @db.Decimal(10, 4)
  explanation          String          @map("explanation")
  evidence             Json            @map("evidence")
  dedupKey             String          @map("dedup_key")
  detectionWindowStart DateTime        @map("detection_window_start")
  detectionWindowEnd   DateTime        @map("detection_window_end")
  detectedAt           DateTime        @default(now()) @map("detected_at")
  acknowledgedAt       DateTime?       @map("acknowledged_at")
  acknowledgedByUserId String?         @map("acknowledged_by_user_id")
  resolvedAt           DateTime?       @map("resolved_at")
  resolvedByUserId     String?         @map("resolved_by_user_id")
  resolutionNote       String?         @map("resolution_note")
  dismissedAt          DateTime?       @map("dismissed_at")
  dismissedByUserId    String?         @map("dismissed_by_user_id")
  detectionRunId       String?         @map("detection_run_id")
  createdAt            DateTime        @default(now()) @map("created_at")
  updatedAt            DateTime        @updatedAt @map("updated_at")

  organization       Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  product            Product?              @relation(fields: [productId], references: [id], onDelete: SetNull)
  warehouse          Warehouse?            @relation(fields: [warehouseId], references: [id], onDelete: SetNull)
  location           StorageLocation?      @relation(fields: [locationId], references: [id], onDelete: SetNull)
  transaction        InventoryTransaction? @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  acknowledgedByUser User?                 @relation("AnomalyAcknowledgedBy", fields: [acknowledgedByUserId], references: [id], onDelete: SetNull)
  resolvedByUser     User?                 @relation("AnomalyResolvedBy", fields: [resolvedByUserId], references: [id], onDelete: SetNull)
  dismissedByUser    User?                 @relation("AnomalyDismissedBy", fields: [dismissedByUserId], references: [id], onDelete: SetNull)
  detectionRun       AnomalyDetectionRun?  @relation(fields: [detectionRunId], references: [id], onDelete: SetNull)

  @@unique([organizationId, dedupKey])
  @@index([organizationId, status])
  @@index([organizationId, category])
  @@index([organizationId, severity])
  @@index([organizationId, productId])
  @@index([organizationId, warehouseId])
  @@index([organizationId, detectedAt])
  @@map("inventory_anomalies")
}

model AnomalyDetectionRun {
  id                String             @id @default(uuid())
  organizationId    String             @map("organization_id")
  status            DetectionRunStatus @default(PENDING)
  windowDays        Int                @map("window_days")
  startedAt         DateTime?          @map("started_at")
  completedAt       DateTime?          @map("completed_at")
  initiatedByUserId String?            @map("initiated_by_user_id")
  findingsCount     Int                @default(0) @map("findings_count")
  summary           Json?              @map("summary")
  errorCode         String?            @map("error_code")
  errorMessage      String?            @map("error_message")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  organization    Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  initiatedByUser User?              @relation(fields: [initiatedByUserId], references: [id], onDelete: SetNull)
  findings        InventoryAnomaly[]

  @@index([organizationId, createdAt])
  @@index([organizationId, status])
  @@map("anomaly_detection_runs")
}
```
