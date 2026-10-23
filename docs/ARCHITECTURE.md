# StockPilot AI — Backend Architecture Documentation

## 1. System Overview

StockPilot AI is a production-grade multi-tenant inventory management SaaS platform. The backend is designed as an independent, loosely coupled **Modular Monolith** built with Node.js LTS, Express, TypeScript, and Prisma ORM on PostgreSQL.

The application serves API requests under versioned prefixes (e.g., `/api/v1`) while exposing root-level health probes (`/health/live`, `/health/ready`) for cloud orchestrators (Kubernetes, AWS ALB, GCP Cloud Run).

```
                      +---------------------------------------+
                      |       Client / External Consumer      |
                      +---------------------------------------+
                                          |
                                          v  [HTTPS, JSON]
+-----------------------------------------------------------------------------------+
| Express Application Pipeline (app.ts)                                             |
|                                                                                   |
|  [Reverse Proxy Trust] -> [Helmet] -> [CORS Allowlist] -> [X-Request-Id]           |
|  -> [Request Timeout (30s)] -> [Pino Structured HTTP Logger]                      |
|  -> [Body Parsers (1mb Limit)] -> [Rate Limiter (Public Routes)]                  |
+-----------------------------------------------------------------------------------+
                                          |
                     +--------------------+--------------------+
                     |                                         |
                     v                                         v
   +------------------------------------+    +------------------------------------+
   | Orchestration Probes (/health)     |    | Versioned API Routes (/api/v1)     |
   | - /health/live (Liveness)          |    | - /api/v1/health                   |
   | - /health/ready (Readiness)        |    | - (Future Business Modules)        |
   +------------------------------------+    +------------------------------------+
                     |                                         |
                     +--------------------+--------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Domain Modules (src/modules/*)                                                    |
|                                                                                   |
|  +--------------------+     +------------------------+     +-------------------+  |
|  |    Health Routes   | --> |    Health Controller   | --> |   Health Service  |  |
|  +--------------------+     +------------------------+     +-------------------+  |
|                                                                      |            |
+----------------------------------------------------------------------|------------+
                                                                       v
+-----------------------------------------------------------------------------------+
| Infrastructure Layer (src/infrastructure/*)                                       |
|                                                                                   |
|  +---------------------------+  +------------------------+  +------------------+  |
|  |     Database Service      |  |   Structured Logger    |  |  AI Model Adapter|  |
|  | (PrismaClient Connection) |  |   (Pino Redacted)      |  |  (LangChain/Core)|  |
|  +---------------------------+  +------------------------+  +------------------+  |
|                |                                                     |            |
+----------------|-----------------------------------------------------|------------+
                 v                                                     v
   +--------------------------+                           +-------------------------+
   |   PostgreSQL Database    |                           | AI Providers (Optional) |
   |  (Multi-Tenant Isolation)|                           | (OpenAI/Anthropic/Mock) |
   +--------------------------+                           +-------------------------+
```

---

## 2. SOLID Design Principles Applied

1. **Single Responsibility Principle (SRP)**:
   - `Routes`: Declare path signatures, HTTP verbs, and middleware bindings.
   - `Controllers`: Parse and validate incoming HTTP payload and headers; invoke services; return standard API responses.
   - `Services`: Encapsulate business rules, transaction boundaries, and orchestration without knowing about Express HTTP objects (`req`, `res`).
   - `Infrastructure Adapters`: Wrap third-party systems (Prisma, Pino, LangChain) so changes in external libraries do not ripple through domain services.

2. **Open/Closed Principle (OCP)**:
   - The AI subsystem uses `IAiModelProvider`. New vendors (e.g., Anthropic, Google Gemini, Ollama) can be introduced via the `AiProviderFactory` without altering existing business services.

3. **Liskov Substitution Principle (LSP)**:
   - All errors derive from `AppError` and preserve standard fields (`statusCode`, `code`, `isOperational`, `details`).
   - `MockAiProvider` and `NullAiProvider` can be substituted for real providers in testing or local setups without unexpected runtime exceptions.

4. **Interface Segregation Principle (ISP)**:
   - Small, focused interfaces (e.g., `IAiModelProvider`, `DatabaseHealthResult`, `RequestValidationSchema`) avoid bloated contracts.

5. **Dependency Inversion Principle (DIP)**:
   - Higher-level modules (e.g., `HealthService`, `HealthController`) accept dependencies via constructor injection (e.g., `constructor(private readonly dbService: DatabaseService = databaseService)`), allowing easy substitution with test doubles during unit testing.

---

## 3. Request Lifecycle & Global Middleware

1. **Proxy Trust**: Reads and validates `TRUST_PROXY` to ensure accurate client IP resolution behind reverse proxies.
2. **Security Headers**: `Helmet` sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, and removes `X-Powered-By`.
3. **CORS Validation**: Cross-Origin Resource Sharing is validated against the parsed `FRONTEND_ORIGIN` allowlist. Wildcard origins with credentials are explicitly prohibited in production.
4. **Correlation Tracing**: `requestIdMiddleware` inspects incoming `X-Request-Id` or `X-Correlation-Id`. If missing, an RFC 4122 v4 UUID is generated and set on `req.id` and the response header.
5. **Request Timeout**: Requests exceeding 30,000ms are terminated with a `504 Gateway Timeout` error, protecting socket pools.
6. **Logging**: `httpLogger` records requests and responses with execution duration and status codes, redacting passwords, tokens, cookies, and secret keys.
7. **Body Size Limits**: Request bodies are capped at 1MB to prevent Denial of Service (DoS) attacks via memory exhaustion.
8. **Rate Limiting**: `apiRateLimiter` restricts excessive requests on public API paths (default: 200 requests per 15 minutes per IP).
9. **404 Interceptor**: Unmatched routes pass to `notFoundMiddleware`, producing a structured `NotFoundError`.
10. **Error Handler**: `errorMiddleware` intercepts all exceptions, classifies them, logs with full correlation metadata, and returns clean, redacted JSON responses.

---

## 4. Multi-Tenancy Foundation

The architecture is multi-tenant by design.

- The root schema defines a `Tenant` model in `prisma/schema.prisma`.
- Every domain model introduced in future modules (warehouses, products, purchase orders, inventory counts) will maintain a mandatory foreign key `tenantId` indexed on the tenant table.
- Future authentication and authorization middleware will decode the tenant context from JWT claims and inject it into request state for transparent query isolation.

---

## 5. LangChain & LangGraph AI Integration Boundary

The AI boundary is designed to ensure the server starts and operates cleanly without mandatory LLM provider credentials.

- Located in `src/infrastructure/ai/`.
- Governed by `IAiModelProvider` interface.
- Factory pattern (`AiProviderFactory`) creates:
  - `NullAiProvider`: Returned when `AI_PROVIDER=none` or when no API key is supplied.
  - `MockAiProvider`: Available for deterministic testing and local development.
  - Vendor Adapters (OpenAI, Anthropic): Instantiated only when explicitly configured.
- Execution boundaries enforce `AI_REQUEST_TIMEOUT_MS` (default: 30,000ms) and `AI_MAX_GRAPH_STEPS` (default: 15) to safeguard against runaway loops in state graphs.
