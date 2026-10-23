# StockPilot AI — Environment & Configuration Guide

## 1. Centralized Configuration Philosophy

StockPilot AI uses a single source of truth for runtime configuration:
`src/config/env.ts` backed by the strict schema in `src/config/env.schema.ts`.

### Key Tenets:

1. **Zero Direct `process.env` Access**: No business logic or controller accesses `process.env` directly. All components import `env` from `src/config/env` or `appConfig` from `src/config/app.config`.
2. **Fail-Fast Startup**: If required variables are missing or invalid, the process terminates immediately on bootstrap with human-readable diagnostic messages.
3. **No Leaked Secrets**: Validation failure outputs list offending field names and violation rules without printing values.
4. **Environment Isolation**: Staging and production modes enforce strict constraints (e.g., minimum 32-character cryptographically secure keys, non-localhost database URIs).

---

## 2. Environment Variables Matrix

| Variable                 | Type             | Allowed Values / Format                                   | Default         | Required in Dev? | Required in Prod? | Description                                       |
| :----------------------- | :--------------- | :-------------------------------------------------------- | :-------------- | :--------------- | :---------------- | :------------------------------------------------ |
| `NODE_ENV`               | Enum             | `development`, `test`, `staging`, `production`            | `development`   | Yes              | Yes               | Runtime execution mode                            |
| `PORT`                   | Integer          | `1024` - `65535`                                          | `5000`          | No               | No                | HTTP server listening port                        |
| `HOST`                   | String           | IPv4 address (e.g. `0.0.0.0`, `127.0.0.1`)                | `0.0.0.0`       | No               | No                | Host network binding                              |
| `LOG_LEVEL`              | Enum             | `fatal`, `error`, `warn`, `info`, `debug`, `trace`        | `info`          | No               | No                | Minimum structured logging level                  |
| `TRUST_PROXY`            | Boolean / String | `true`, `false`, `1`, `0`, `loopback`                     | `false`         | No               | Recommended       | Reverse proxy trust configuration                 |
| `API_PREFIX`             | String           | Valid path (e.g. `/api`)                                  | `/api`          | No               | No                | Base API path prefix                              |
| `API_VERSION`            | String           | Semantic version (e.g. `v1`, `v2`)                        | `v1`            | No               | No                | Major API version identifier                      |
| `FRONTEND_ORIGIN`        | Comma-delimited  | URLs (e.g. `http://localhost:3000,http://localhost:5173`) | Localhost URLs  | No               | **Yes**           | Allowlisted origins for CORS                      |
| `DATABASE_URL`           | String           | PostgreSQL URI                                            | Local dev URI   | No               | **Yes**           | PostgreSQL connection string                      |
| `JWT_ACCESS_SECRET`      | String           | Cryptographic string (>= 32 chars in prod)                | Dev placeholder | No               | **Yes**           | Secret for signing JWT access tokens              |
| `JWT_ACCESS_EXPIRES_IN`  | String           | Time duration (e.g. `15m`, `1h`)                          | `15m`           | No               | No                | Expiration period for access tokens               |
| `JWT_REFRESH_SECRET`     | String           | Cryptographic string (>= 32 chars in prod)                | Dev placeholder | No               | **Yes**           | Secret for signing JWT refresh tokens             |
| `JWT_REFRESH_EXPIRES_IN` | String           | Time duration (e.g. `7d`, `30d`)                          | `7d`            | No               | No                | Expiration period for refresh tokens              |
| `AI_PROVIDER`            | Enum             | `none`, `openai`, `anthropic`, `google`, `mock`           | `none`          | No               | No                | Active AI model provider                          |
| `AI_MODEL`               | String           | Model identifier (e.g. `gpt-4o`)                          | `gpt-4o`        | No               | No                | LLM model identifier                              |
| `AI_API_KEY`             | String           | Vendor API key                                            | `""`            | No               | If AI enabled     | Required only when `AI_PROVIDER` != `none`/`mock` |
| `AI_REQUEST_TIMEOUT_MS`  | Integer          | Positive integer                                          | `30000`         | No               | No                | Maximum duration for an AI workflow step          |
| `AI_MAX_GRAPH_STEPS`     | Integer          | `1` - `100`                                               | `15`            | No               | No                | State-graph transition recursion limit            |
| `REDIS_URL`              | URL String       | `redis://...`                                             | Optional        | No               | No                | Redis connection URI for caching/queues           |
| `RABBITMQ_URL`           | URL String       | `amqp://...`                                              | Optional        | No               | No                | RabbitMQ connection URI for events                |

---

## 3. Boolean String Parsing Rules

In standard JavaScript, `Boolean("false") === true`. To prevent critical misconfigurations where boolean flags (e.g., `TRUST_PROXY=false`) evaluate to truthy, the configuration system applies `booleanStringSchema`:

- **Strictly Evaluated as `false`**: `"false"`, `"0"`, `"off"`, `"no"`, `""`, and `false`.
- **Strictly Evaluated as `true`**: `"true"`, `"1"`, `"on"`, `"yes"`, and `true`.

---

## 4. Execution Mode Configuration

### Local Development (`NODE_ENV=development`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default fallback values allow the server and health checks to run immediately with minimum manual setup.

### Testing Mode (`NODE_ENV=test`)

In test runs, the configuration system suppresses console logging, relaxes production validations to allow isolated unit testing with test doubles, and throws descriptive errors on schema mismatch rather than terminating the process via `process.exit(1)`.

### Staging & Production (`NODE_ENV=production`)

The application refuses to start if:

- `DATABASE_URL` contains `localhost` or default passwords.
- `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is shorter than 32 characters or contains `dev_secret`.
- `FRONTEND_ORIGIN` is empty.
