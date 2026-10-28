# StockPilot AI — Feature 12: AI Inventory Copilot (API Specification)

## Overview

The AI Inventory Copilot provides organization members, managers, and administrators with an intelligent conversational assistant capable of answering complex inventory, procurement, and operations questions.

All interactions are strictly **read-only**, ground answers in verified business records via allowlisted tools, and return structured source citations (`CopilotSourceDto`) for complete auditability.

---

## Security & Architectural Invariants

1. **Strictly Read-Only Guarantee**:
   The Copilot agent is strictly prohibited from mutating application state. Zero tools exist to create or update products, adjust stock balances, approve purchase orders, or resolve anomalies. Any modification must be performed by human operators through standard UI workflows.

2. **Multi-Tenant Isolation**:
   Every tool operation and conversation thread is scoped strictly to the caller's verified `organizationId`. A user cannot query, inspect, or delete conversations belonging to other organizations or other users.

3. **Prompt Injection & Data Sanitization**:
   User input is treated strictly as untrusted data within `<user_query>` boundaries. System prompts instruct the LLM to ignore meta-instructions attempting to override system behavior, access unauthorized endpoints, or bypass RBAC safeguards.

4. **Resource Bounds & Graceful Degradation**:
   - `AI_REQUEST_TIMEOUT_MS`: Caps overall LangGraph workflow duration (default: 30 seconds).
   - `AI_MAX_GRAPH_STEPS`: Caps the recursion step limit of the ReAct agent (default: 10 steps).
   - Fallback when AI is unconfigured or disabled: returns standard 503 Service Unavailable error envelope.

---

## Endpoints

Base path: `/api/v1/organizations/:organizationId/copilot`

### 1. Submit Query (`POST /chat`)

Submits a conversational message to the Copilot assistant and receives a grounded response with source citations.

- **Permission**: `copilot:chat` (assigned to `OWNER`, `ADMIN`, `MEMBER`)
- **Headers**:
  - `Authorization: Bearer <jwt_access_token>`
  - `Content-Type: application/json`

#### Request Body:

```json
{
  "message": "Which products are currently low in stock in the central warehouse?",
  "conversationId": "cuid_or_uuid_optional"
}
```

#### Response (200 OK):

```json
{
  "success": true,
  "data": {
    "conversationId": "clv1234567890",
    "message": {
      "id": "clvmsg987654321",
      "conversationId": "clv1234567890",
      "role": "ASSISTANT",
      "content": "There are currently 2 products below their configured safety stock thresholds in the Central Warehouse: 1) Industrial Drill (SKU: WGT-ALPHA) has 3 units on hand against a threshold of 10. 2) Safety Goggles (SKU: SFT-002) has 1 unit against a threshold of 5.",
      "sources": [
        {
          "type": "low_stock",
          "id": "prod-1",
          "name": "Industrial Drill",
          "summary": "Low Stock Alert: Industrial Drill (WGT-ALPHA) - On Hand: 3, Threshold: 10, Deficit: 7",
          "metadata": { "sku": "WGT-ALPHA", "deficit": 7 }
        }
      ],
      "tokensUsed": 340,
      "createdAt": "2026-10-28T10:30:00.000Z"
    }
  },
  "timestamp": "2026-10-28T10:30:00.123Z"
}
```

---

### 2. List Conversations (`GET /conversations`)

Retrieves a paginated list of conversational threads belonging to the authenticated user within the organization.

- **Permission**: `copilot:chat`
- **Query Parameters**:
  - `page` (optional integer, default: 1)
  - `limit` (optional integer, default: 20, max: 100)

#### Response (200 OK):

```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "clv1234567890",
        "organizationId": "550e8400-e29b-41d4-a716-446655440001",
        "userId": "550e8400-e29b-41d4-a716-446655440010",
        "title": "Which products are currently low in stock in...",
        "createdAt": "2026-10-28T10:25:00.000Z",
        "updatedAt": "2026-10-28T10:30:00.000Z",
        "messageCount": 2,
        "lastMessage": {
          "id": "clvmsg987654321",
          "conversationId": "clv1234567890",
          "role": "ASSISTANT",
          "content": "There are currently 2 products below their configured safety stock...",
          "sources": [],
          "tokensUsed": 340,
          "createdAt": "2026-10-28T10:30:00.000Z"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "timestamp": "2026-10-28T10:30:05.000Z"
}
```

---

### 3. Get Conversation (`GET /conversations/:conversationId`)

Retrieves a single conversation thread with its paginated message history.

- **Permission**: `copilot:chat`
- **Query Parameters**:
  - `page` (optional integer, default: 1)
  - `limit` (optional integer, default: 50, max: 100)

#### Response (200 OK):

```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "clv1234567890",
      "organizationId": "550e8400-e29b-41d4-a716-446655440001",
      "userId": "550e8400-e29b-41d4-a716-446655440010",
      "title": "Low stock inquiries",
      "createdAt": "2026-10-28T10:25:00.000Z",
      "updatedAt": "2026-10-28T10:30:00.000Z",
      "messageCount": 2
    },
    "messages": [
      {
        "id": "msg-1",
        "conversationId": "clv1234567890",
        "role": "USER",
        "content": "Which products are currently low in stock?",
        "sources": [],
        "tokensUsed": null,
        "createdAt": "2026-10-28T10:25:00.000Z"
      },
      {
        "id": "msg-2",
        "conversationId": "clv1234567890",
        "role": "ASSISTANT",
        "content": "There are currently 2 products below their safety threshold...",
        "sources": [],
        "tokensUsed": 340,
        "createdAt": "2026-10-28T10:25:05.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 2,
      "totalPages": 1
    }
  },
  "timestamp": "2026-10-28T10:30:10.000Z"
}
```

---

### 4. Delete Conversation (`DELETE /conversations/:conversationId`)

Permanently deletes a conversational thread and its messages.

- **Permission**: `copilot:chat`

#### Response (200 OK):

```json
{
  "success": true,
  "data": {
    "id": "clv1234567890",
    "organizationId": "550e8400-e29b-41d4-a716-446655440001",
    "userId": "550e8400-e29b-41d4-a716-446655440010",
    "title": "Low stock inquiries",
    "createdAt": "2026-10-28T10:25:00.000Z",
    "updatedAt": "2026-10-28T10:30:00.000Z"
  },
  "timestamp": "2026-10-28T10:30:15.000Z"
}
```
