# StockPilot AI — Production Deployment & Operations Guide

## 1. Production Deployment Checklist

Before deploying StockPilot AI backend to production or staging:

- [ ] **Node.js LTS**: Verify environment runs Node.js >= 20.0.0 LTS.
- [ ] **Secure `DATABASE_URL`**: Ensure PostgreSQL connection points to a secured, pooled database instance (SSL enabled, e.g., `sslmode=require`).
- [ ] **Cryptographic Secrets**: Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to random, minimum 32-character strings.
- [ ] **CORS Allowlist**: Set `FRONTEND_ORIGIN` strictly to authorized production domains (e.g. `https://app.stockpilot.ai`).
- [ ] **Reverse Proxy Trust**: Set `TRUST_PROXY=true` (or appropriate hop count) when operating behind an ALB, Cloudflare, or Ingress.
- [ ] **Prisma Migrations**: Execute `npm run prisma:deploy` during the deployment pipeline before routing traffic.
- [ ] **Health Probes**: Configure orchestrator liveness probe to `/health/live` and readiness probe to `/health/ready`.
- [ ] **Graceful Shutdown**: Ensure container orchestrator termination grace period is at least 15 seconds (matching `shutdownTimeoutMs: 10000`).

---

## 2. Containerization (Dockerfile)

A production-optimized, multi-stage Dockerfile is provided at the repository root:

- **Stage 1 (Builder)**: Installs development dependencies, compiles TypeScript to JavaScript (`dist/`), and generates the Prisma Client.
- **Stage 2 (Runner)**: Minimal Node.js Alpine base image, installs production dependencies only, copies compiled `dist/` and Prisma binaries, and runs as an unprivileged `node` user.

```bash
# Build the production image
docker build -t stockpilot-backend:latest .

# Run the container
docker run -p 5000:5000 --env-file .env.production stockpilot-backend:latest
```

---

## 3. Graceful Shutdown & Lifecycle Management

StockPilot AI implements a two-phase graceful shutdown:

1. **Signal Interception**: Catches `SIGTERM` (sent by Kubernetes / AWS ECS on scale-down or deployment) and `SIGINT` (Ctrl+C).
2. **Stop Ingress Traffic**: Calls `server.close()`, refusing new HTTP connections while allowing in-flight requests up to 10 seconds to finish processing.
3. **Database Draining**: Calls `databaseService.disconnect()`, releasing active connection pool sockets cleanly to PostgreSQL.
4. **Hard Timeout Safeguard**: A 10-second unref'd timer guarantees the process will forcefully terminate if a hanging socket or promise refuses to drain.

---

## 4. Structured Logging & Monitoring

- **Engine**: Pino high-performance structured JSON logger.
- **Correlation ID**: Every HTTP log includes `requestId` to trace requests across microservices and database operations.
- **Automatic Redaction**: Headers (`authorization`, `cookie`), request bodies (`password`, `token`, `secret`, `apiKey`), and internal credentials are automatically censored with `[REDACTED]`.
- **Log Levels**:
  - `fatal`: Critical unrecoverable crashes initiating emergency shutdowns.
  - `error`: Unhandled exceptions, 500 server errors, database connectivity losses.
  - `warn`: Degraded dependencies, operational warnings, 4xx client errors.
  - `info`: Normal lifecycle events (boot, shutdown, route requests).
  - `debug`: Detailed diagnostics (safe parameters, query metrics).
