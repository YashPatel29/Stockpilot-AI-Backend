# StockPilot AI — API & Health Probes Specification

## 1. Health Probe Architecture

To ensure high availability in production container platforms (Kubernetes, AWS ECS, Google Cloud Run, Docker Swarm), StockPilot AI separates **Liveness** from **Readiness**.

- **Liveness Probe (`/health/live`)**: Answers _"Is the process running and able to process events?"_
  - Fast execution (sub-millisecond).
  - Does NOT check external databases.
  - If it fails, the orchestrator restarts the container.
- **Readiness Probe (`/health/ready`)**: Answers _"Are mandatory dependencies ready to accept traffic?"_
  - Verifies PostgreSQL connectivity via an active ping query (`SELECT 1`).
  - Returns `200 OK` when dependencies are reachable.
  - Returns `503 Service Unavailable` if PostgreSQL is down.
  - If it fails, the load balancer removes the instance from traffic routing until it recovers, without causing destructive crash-loops.

Both probes are mounted at root level (`/health/live`, `/health/ready`) and under the versioned API route (`/api/v1/health/live`, `/api/v1/health/ready`).

---

## 2. Endpoint Contracts

### 1. Liveness Endpoint: `GET /health/live`

- **Status Code**: `200 OK`
- **Response Format**:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": 142,
    "timestamp": "2026-10-23T06:20:00.000Z"
  },
  "timestamp": "2026-10-23T06:20:00.000Z"
}
```

---

### 2. Readiness Endpoint: `GET /health/ready`

#### Successful Readiness (`200 OK`):

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "isReady": true,
    "dependencies": {
      "database": {
        "status": "healthy",
        "latencyMs": 2
      }
    },
    "timestamp": "2026-10-23T06:20:00.000Z"
  },
  "timestamp": "2026-10-23T06:20:00.000Z"
}
```

#### Degraded / Dependency Failure (`503 Service Unavailable`):

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "One or more required dependencies are unavailable.",
    "details": {
      "database": {
        "status": "unhealthy"
      }
    }
  },
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-10-23T06:20:00.000Z"
}
```

---

### 3. Detailed Telemetry Endpoint: `GET /health`

- **Status Code**: `200 OK`
- **Response Format**:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "v1",
    "environment": "development",
    "uptimeSeconds": 300,
    "timestamp": "2026-10-23T06:20:00.000Z",
    "memory": {
      "rssMb": 85.34,
      "heapTotalMb": 42.12,
      "heapUsedMb": 28.75
    },
    "dependencies": {
      "database": {
        "status": "healthy",
        "latencyMs": 3
      }
    }
  },
  "timestamp": "2026-10-23T06:20:00.000Z"
}
```

---

## 3. Orchestration Probe Configurations

### Kubernetes Deployment Spec:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

### AWS Application Load Balancer (ALB) Target Group:

- **Health Check Protocol**: HTTP
- **Health Check Path**: `/health/ready`
- **Success Codes**: `200`
- **Interval**: 15 seconds
- **Timeout**: 5 seconds
- **Healthy Threshold**: 2
- **Unhealthy Threshold**: 3
