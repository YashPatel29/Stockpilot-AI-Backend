# StockPilot AI — Backend Architecture & Developer Guidelines (AGENTS.md)

This document establishes the architecture invariants, conventions, and operational boundaries for engineers and AI agents contributing to the `server` codebase of StockPilot AI.

---

## 1. Core Architectural Paradigm

StockPilot AI backend is designed as a **Production-Ready Modular Monolith**. It prioritizes high cohesion within domain modules and loose coupling across system boundaries.

```
server/
├── src/
│   ├── config/              # Centralized environment & runtime configuration (Zod)
│   ├── common/              # Cross-cutting primitives (Errors, Middleware, Types, Utils)
│   ├── infrastructure/      # External adapters (Prisma/PostgreSQL, Pino Logging, AI Adapter)
│   ├── modules/             # High-cohesion domain modules (Health, and future modules)
│   ├── app.ts               # Express pipeline factory
│   └── server.ts            # Server entrypoint & graceful shutdown lifecycle
├── prisma/                  # Schema, migrations, and seed scripts
├── tests/                   # Isolated unit tests and end-to-end integration tests
└── docs/                    # In-depth architectural & operational runbooks
```

### Layer Responsibilities & Boundaries:
- **Routes (`*.routes.ts`)**: Declare HTTP endpoints, mount URL path parameters, and attach route-specific middleware (validation, rate-limiting, authentication). No business logic.
- **Controllers (`*.controller.ts`)**: Translate HTTP requests to domain arguments, invoke service methods, and format HTTP responses using standard envelopes (`sendSuccess`, `sendError`).
- **Services (`*.service.ts`)**: Contain core business rules, orchestration, calculations, and domain transactions. **Never import Express types (`Request`, `Response`) into core services.**
- **Infrastructure (`infrastructure/`)**: Centralize adapters for external systems (Database, Cache, Message Broker, AI Providers, File Storage).
- **Configuration (`config/`)**: Centralized Zod schema validation. **Never read `process.env` directly in business logic or controllers.**

---

## 2. Inviolable Architectural Invariants

### 1. Environment Configuration
- Every environment variable must be declared and validated in `src/config/env.schema.ts`.
- All modules must import `{ env }` from `src/config/env.ts` or `{ appConfig }` from `src/config/app.config.ts`.
- Booleans must use `booleanStringSchema` to prevent `"false"` evaluating to truthy.
- Never log or expose secrets, passwords, tokens, or connection strings.
- Insecure production defaults are strictly prohibited.

### 2. Database & Multi-Tenancy
- Database access must strictly flow through the centralized `prisma` singleton (`src/infrastructure/database/prisma.client.ts`) or `DatabaseService`.
- Multi-tenancy is enforced at the data layer. Every domain entity must map to a `Tenant` model via `tenantId`.
- Never execute destructive migration commands (`prisma migrate reset`, `prisma db push --force-reset`) against staging or production databases.
- The backend must not pretend the database is connected if connection ping fails at startup.

### 3. Error Handling & Security Responses
- All domain and validation errors must inherit from `AppError` (`src/common/errors/app-error.ts`).
- Never expose internal database errors, raw SQL queries, vendor error payloads, or V8 stack traces to API consumers in production.
- Every API response must adhere to the standard envelope:
  - Success: `{ success: true, data: T, timestamp: string }`
  - Error: `{ success: false, error: { code: string, message: string, details?: unknown }, requestId: string, timestamp: string }`

### 4. Logging & Observability
- All logging must use the structured `logger` (`src/infrastructure/logging/logger.ts`).
- Never use raw `console.log()` in application code.
- Pino is configured to redact `authorization`, `cookie`, `password`, `token`, `secret`, and `apiKey` fields automatically.
- Every request carries an `X-Request-Id` correlation identifier from ingress to response.

### 5. AI Integration Boundary (LangChain & LangGraph)
- Core application must start and run cleanly without requiring an AI API key.
- Provider implementations (OpenAI, Anthropic, Google) must sit behind the `IAiModelProvider` interface in `src/infrastructure/ai/`.
- AI workflow execution duration must be guarded by `AI_REQUEST_TIMEOUT_MS`, and graph step transitions must be capped by `AI_MAX_GRAPH_STEPS`.

---

## 3. TypeScript & Code Standards

- **Strict Mode**: `tsconfig.json` runs in full strict mode (`noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`).
- **Zero Any**: Do not use `any`. Use `unknown`, generic parameters, or explicit interfaces.
- **Dependency Injection**: Services and controllers must accept dependencies in their constructors with sensible defaults to allow seamless testing with test doubles.

---

## 4. Verification Commands

Before committing any code or finalizing work, execute the quality verification suite:

```bash
# 1. Strict TypeScript compilation check
npm run typecheck

# 2. ESLint verification
npm run lint

# 3. Unit and integration tests
npm test

# 4. Code formatting check
npm run format:check

# 5. Production build compilation
npm run build
```

