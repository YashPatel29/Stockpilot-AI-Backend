# StockPilot AI — Backend Service

> Independent, production-ready backend service for **StockPilot AI**, a multi-tenant inventory management SaaS platform. Built as a high-cohesion, loosely coupled modular monolith using Node.js LTS, Express, TypeScript (strict), Prisma ORM, and PostgreSQL.

---

## 1. Tech Stack & Architectural Foundation

- **Runtime**: Node.js (>= 20.0.0 LTS)
- **Framework**: Express.js (v4.21+)
- **Language**: TypeScript (strict type-checking, `zero-any` policy)
- **Database & ORM**: PostgreSQL with Prisma ORM (v6.19.3)
- **Validation**: Zod (v3.24+) with safe boolean string coercion & fail-fast startup
- **Logging**: Pino structured JSON logger with correlation IDs (`X-Request-Id`) and automatic credential redaction
- **Security Baseline**: Helmet, strict CORS allowlist, rate limiting, request timeouts, and 1MB payload limits
- **AI Integration Boundary**: LangChain.js & LangGraph.js prepared behind vendor-agnostic adapter interfaces
- **Test Suite**: Vitest & Supertest with test doubles for database and AI isolation

---

## 2. Prerequisites

- **Node.js**: `v20.0.0` or higher (tested on LTS v22)
- **npm**: `v10.0.0` or higher
- **PostgreSQL**: Local PostgreSQL instance OR Docker (optional)

*Note: The backend is fully decoupled from the frontend repository. You do not need the frontend to build, run, or test the backend.*

---

## 3. Quick Start & Local Setup

### 1. Environment Configuration
Copy the documented environment template to `.env`:
```bash
cp .env.example .env
```
*The default development values in `.env.example` allow the server and health checks to start immediately.*

### 2. Install Dependencies
```bash
npm install
```

### 3. Generate Prisma Client
```bash
npm run prisma:generate
```

### 4. (Optional) Start Local PostgreSQL
If you use Docker, start the pre-configured PostgreSQL container:
```bash
docker compose up -d postgres
```
Alternatively, point `DATABASE_URL` in `.env` to your existing PostgreSQL instance.

### 5. Start Development Server
```bash
npm run dev
```
The server will boot and listen on `http://0.0.0.0:5000`:
- **Interactive Swagger UI**: `http://localhost:5000/docs` (or `/api-docs`)
- **OpenAPI 3.0 Specification**: `http://localhost:5000/docs.json`
- **Liveness Probe**: `http://localhost:5000/health/live`
- **Readiness Probe**: `http://localhost:5000/health/ready`
- **System Telemetry**: `http://localhost:5000/health`
- **Versioned API Root**: `http://localhost:5000/api/v1`

---

## 4. Verification & Quality Scripts

Every script is verified and operational:

```bash
# Typecheck TypeScript codebase with strict flags
npm run typecheck

# Lint with ESLint (zero warnings allowed)
npm run lint

# Auto-fix lintable issues
npm run lint:fix

# Run unit and integration test suite
npm test

# Run tests with coverage report
npm run test:coverage

# Verify code formatting with Prettier
npm run format:check

# Format codebase with Prettier
npm run format

# Compile TypeScript to production bundle (dist/)
npm run build

# Start production server from dist/
npm start
```

---

## 5. API Response Contracts

All responses follow a predictable JSON envelope:

### Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-10-23T06:20:00.000Z"
}
```

### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Resource validation failed",
    "details": [ ... ]
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-10-23T06:20:00.000Z"
}
```

---

## 6. Project Architecture & Documentation Index

For in-depth architectural decisions, guides, and runbooks:

- [AGENTS.md](./AGENTS.md) — Architectural invariants, boundaries, and conventions for AI and human contributors.
- [Architecture Guide](./docs/ARCHITECTURE.md) — Modular monolith structure, SOLID design, and request lifecycle.
- [Configuration Guide](./docs/CONFIGURATION.md) — Environment variables matrix, boolean string parsing, and fail-fast validation.
- [Database Guide](./docs/DATABASE.md) — Prisma setup, multi-tenant schema, migrations, and connection pooling.
- [Authentication API Guide](./docs/API_AUTH.md) — Authentication endpoints, JWT rotation, HttpOnly cookies, and security model.
- [Organizations & Multi-Tenancy API Guide](./docs/API_ORGANIZATIONS.md) — Organization lifecycle, member isolation, slug generation, and tenancy guard middleware.
- [Team Members & RBAC API Guide](./docs/API_MEMBERS_INVITATIONS.md) — Role-based access control, team member management, and secure cryptographic invitations.
- [Product & Category Management Guide](./docs/API_PRODUCTS_CATEGORIES.md) — Multi-tenant product categories, SKU tracking, exact monetary precision, safe deletion, and soft-archiving.
- [Warehouse & Location Management Guide](./docs/API_WAREHOUSES_LOCATIONS.md) — Multi-tenant warehouses, storage locations, cascade deactivation, and inactive warehouse guard.
- [API & Health Probes](./docs/API_HEALTH.md) — Liveness vs. readiness probes, response schemas, and orchestrator configs.
- [Deployment Guide](./docs/DEPLOYMENT.md) — Production checklist, Docker multi-stage build, and graceful shutdown.

