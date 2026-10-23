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
