import type { SwaggerUiOptions } from "swagger-ui-express";
import { appConfig } from "./app.config";

/**
 * OpenAPI 3.0.3 specification for StockPilot AI Backend.
 */
export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "StockPilot AI — Backend API",
    version: "1.0.0",
    description:
      "Production-ready modular monolith backend for StockPilot AI SaaS platform. Features secure multi-tenant foundation, RBAC, dual-token rotation authentication with HttpOnly cookies, system telemetry, and container probes.",
    contact: {
      name: "StockPilot AI Engineering",
    },
    license: {
      name: "UNLICENSED",
    },
  },
  servers: [
    {
      url: `http://${appConfig.server.host === "0.0.0.0" ? "localhost" : appConfig.server.host}:${appConfig.server.port}`,
      description: "Current Server",
    },
    {
      url: "/",
      description: "Relative Host",
    },
  ],
  tags: [
    {
      name: "Authentication",
      description: "User registration, login, logout, session refresh, and profile inspection",
    },
    {
      name: "Organizations",
      description:
        "Multi-tenant organization lifecycle, memberships, and tenant-level access control",
    },
    {
      name: "Team Members",
      description: "Organization member listing, role updates, and member removals",
    },
    {
      name: "Invitations",
      description: "Organization invitation creation, listing, revocation, and acceptance",
    },
    {
      name: "Categories",
      description: "Product categories for catalog classification within an organization",
    },
    {
      name: "Products",
      description: "Inventory product management, SKU tracking, pricing, and soft-archiving",
    },
    {
      name: "Inventory",
      description:
        "Real-time stock balance tracking, receipts, issues, adjustments, transfers, and append-only audit ledger",
    },
    {
      name: "Warehouses",
      description:
        "Physical storage facility management, address information, and soft-deactivation",
    },
    {
      name: "Storage Locations",
      description:
        "Warehouse storage locations (aisle, rack, shelf, bin) management and status tracking",
    },
    {
      name: "Health Probes",
      description: "Container orchestrator probes (liveness, readiness) and system telemetry",
    },
    {
      name: "Suppliers",
      description: "Supplier catalog management, contact details, and procurement partners",
    },
    {
      name: "Purchase Orders",
      description:
        "Procurement lifecycle, line items, order approvals, cancellation, and inventory receipts",
    },
    {
      name: "Inventory Dashboard",
      description: "Executive overview of stock levels, movements, and procurement metrics",
    },
    {
      name: "Inventory Reports",
      description:
        "Warehouse distribution, ledger movements, product summaries, low-stock, and procurement analytics",
    },
    {
      name: "Notifications",
      description: "User-scoped notification center, unread counters, and mark-as-read mutations",
    },
    {
      name: "Audit Logs",
      description:
        "Append-only audit trail and activity log querying for organization administrators",
    },
    {
      name: "Demand Forecasting",
      description:
        "Deterministic demand forecasting, point predictions, and walk-forward backtesting evaluation",
    },
    {
      name: "Inventory Anomalies",
      description:
        "Automated statistical anomaly detection across ledger transactions, review workflows, and finding lifecycle management",
    },
  ],
  paths: {
    "/api/v1/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register new account",
        description:
          "Registers a new user, normalizes the email, securely hashes the password with bcrypt, establishes a new session, sets an HttpOnly refresh token cookie, and returns an access token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RegisterInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Account registered and session established successfully",
            headers: {
              "Set-Cookie": {
                description: "HttpOnly rotating refresh token cookie",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSuccessResponse",
                },
              },
            },
          },
          "400": {
            description: "Bad Request: Malformed request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "409": {
            description: "Conflict: Email address is already registered",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "422": {
            description: "Validation error: Input failed schema constraints",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Authenticate credentials and establish session",
        description:
          "Authenticates user by email and password. On success, issues a short-lived access token and an HttpOnly refresh token cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Authentication successful",
            headers: {
              "Set-Cookie": {
                description: "HttpOnly rotating refresh token cookie",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSuccessResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Invalid email or password",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Rotate session refresh token",
        description:
          "Validates current refresh token from cookie or body, rotates it, and issues replacement access and refresh tokens. Detects reuse and revokes compromised token families.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session refreshed and tokens rotated",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSuccessResponse",
                },
              },
            },
          },
          "401": {
            description:
              "Unauthorized: Refresh token missing, expired, or compromised reuse detected",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Log out and revoke session",
        description:
          "Revokes the session refresh token in the database and clears the HttpOnly cookie.",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "Logged out successfully." },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get current user profile",
        description:
          "Retrieves the safe user profile for the currently authenticated bearer token. Never discloses password hashes.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Profile retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProfileSuccessResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Access token missing, expired, or invalid",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations": {
      post: {
        tags: ["Organizations"],
        summary: "Create new organization",
        description:
          "Creates an isolated organization and establishes the creator as initial OWNER.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOrganizationInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Organization created successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrganizationResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
      get: {
        tags: ["Organizations"],
        summary: "List caller's organizations",
        description: "Retrieves organizations the authenticated user belongs to with pagination.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "Organizations retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ListOrganizationsResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}": {
      get: {
        tags: ["Organizations"],
        summary: "Get organization by ID",
        description: "Retrieves organization details if the caller is an active member.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Organization details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrganizationResponse" },
              },
            },
          },
          "404": { description: "Organization not found" },
        },
      },
      patch: {
        tags: ["Organizations"],
        summary: "Update organization details",
        description: "Updates organization name or details. Restricted to OWNER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateOrganizationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Organization updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeOrganizationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": { description: "Forbidden: Caller is not an organization owner" },
          "404": { description: "Organization not found" },
        },
      },
      delete: {
        tags: ["Organizations"],
        summary: "Deactivate organization",
        description: "Safely deactivates an organization. Restricted to OWNER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Organization deactivated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: {
                          type: "string",
                          example: "Organization deactivated successfully.",
                        },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": { description: "Forbidden: Caller is not an organization owner" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/members": {
      get: {
        tags: ["Team Members"],
        summary: "List organization members",
        description:
          "Retrieves members of an organization the caller belongs to. Supports pagination.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "Members retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        items: {
                          type: "array",
                          items: { $ref: "#/components/schemas/OrganizationMemberDto" },
                        },
                        pagination: {
                          type: "object",
                          properties: {
                            page: { type: "integer", example: 1 },
                            limit: { type: "integer", example: 20 },
                            total: { type: "integer", example: 2 },
                            totalPages: { type: "integer", example: 1 },
                          },
                        },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/members/{membershipId}/role": {
      patch: {
        tags: ["Team Members"],
        summary: "Update member role",
        description:
          "Updates an organization member's role to ADMIN or MEMBER. Restricted to OWNER only.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "membershipId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateMemberRoleInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Role updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/OrganizationMemberDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Bad Request: Prohibited role change or OWNER demotion" },
          "403": { description: "Forbidden: Caller is not an organization owner" },
          "404": { description: "Member or organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/members/{membershipId}": {
      delete: {
        tags: ["Team Members"],
        summary: "Remove member from organization",
        description:
          "Removes a member from the organization. OWNER can remove any non-OWNER; ADMIN can only remove MEMBERs.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "membershipId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Member removed successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "Member removed successfully." },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Bad Request: Cannot remove OWNER" },
          "403": { description: "Forbidden: Insufficient permissions to remove target" },
          "404": { description: "Member or organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/invitations": {
      post: {
        tags: ["Invitations"],
        summary: "Issue an organization invitation",
        description:
          "Issues an expiring invitation to join the organization as ADMIN or MEMBER. Restricted to OWNER or ADMIN.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateInvitationInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Invitation issued successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeInvitationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Bad Request: Cannot invite as OWNER" },
          "403": { description: "Forbidden: Regular members cannot invite" },
          "409": { description: "Conflict: User is already an active member" },
        },
      },
      get: {
        tags: ["Invitations"],
        summary: "List pending invitations",
        description:
          "Returns pending, unexpired invitations for the organization. Token hashes are omitted.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "Pending invitations retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        items: {
                          type: "array",
                          items: { $ref: "#/components/schemas/SafeInvitationDto" },
                        },
                        pagination: {
                          type: "object",
                          properties: {
                            page: { type: "integer", example: 1 },
                            limit: { type: "integer", example: 20 },
                            total: { type: "integer", example: 1 },
                            totalPages: { type: "integer", example: 1 },
                          },
                        },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/invitations/{invitationId}": {
      delete: {
        tags: ["Invitations"],
        summary: "Revoke pending invitation",
        description: "Revokes a pending organization invitation. Restricted to OWNER or ADMIN.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "invitationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Invitation revoked successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "Invitation revoked successfully." },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": { description: "Forbidden" },
          "404": { description: "Invitation not found" },
        },
      },
    },
    "/api/v1/invitations/accept": {
      post: {
        tags: ["Invitations"],
        summary: "Accept an invitation",
        description:
          "Accepts an invitation using the cryptographic token. Requires matching logged-in user email.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AcceptInvitationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Invitation accepted and membership established",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        membership: {
                          type: "object",
                          properties: {
                            id: { type: "string", format: "uuid" },
                            organizationId: { type: "string", format: "uuid" },
                            role: { type: "string", enum: ["ADMIN", "MEMBER"] },
                            createdAt: { type: "string", format: "date-time" },
                          },
                        },
                        organization: { $ref: "#/components/schemas/SafeOrganizationDto" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Bad Request: Invalid, expired, or already used token" },
          "403": { description: "Forbidden: Authenticated email does not match invitation" },
          "409": { description: "Conflict: Caller is already an active member" },
        },
      },
    },
    "/health/live": {
      get: {
        tags: ["Health Probes"],
        summary: "Liveness probe",
        description: "Fast sub-millisecond process liveness check for container orchestrators.",
        responses: {
          "200": {
            description: "Process is live and operational",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        status: { type: "string", example: "ok" },
                        uptimeSeconds: { type: "number", example: 120.45 },
                        timestamp: { type: "string", format: "date-time" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/categories": {
      post: {
        tags: ["Categories"],
        summary: "Create product category",
        description:
          "Creates a new product category within the organization. Enforces case-insensitive uniqueness. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCategoryInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Category created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductCategoryDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden: Insufficient permissions" },
          "404": { description: "Organization not found" },
          "409": {
            description: "Conflict: Category with this name already exists in organization",
          },
        },
      },
      get: {
        tags: ["Categories"],
        summary: "List product categories",
        description:
          "Lists categories within the organization with optional search filter and pagination. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20 },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "sortBy",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["name", "createdAt"], default: "name" },
          },
          {
            name: "sortOrder",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
          },
        ],
        responses: {
          "200": {
            description: "Categories retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedCategoriesResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/categories/{categoryId}": {
      get: {
        tags: ["Categories"],
        summary: "Get category by ID",
        description:
          "Retrieves a single category by ID scoped to the organization. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "categoryId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Category retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductCategoryDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Category not found" },
        },
      },
      patch: {
        tags: ["Categories"],
        summary: "Update category",
        description:
          "Updates category name or description. Enforces name uniqueness. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "categoryId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCategoryInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Category updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductCategoryDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Category not found" },
          "409": { description: "Conflict: Category name already in use" },
        },
      },
      delete: {
        tags: ["Categories"],
        summary: "Delete category",
        description:
          "Safely deletes a category. Returns 409 Conflict if products are currently assigned to this category. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "categoryId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Category deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                        id: { type: "string" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Category not found" },
          "409": { description: "Conflict: Products are assigned to this category" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/products": {
      post: {
        tags: ["Products"],
        summary: "Create product",
        description:
          "Creates a new product with SKU, name, prices, low-stock threshold, and optional category. Enforces tenant SKU uniqueness and category isolation. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateProductInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Product created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error or category belongs to different tenant" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
          "409": { description: "Conflict: SKU already exists in this organization" },
        },
      },
      get: {
        tags: ["Products"],
        summary: "List products",
        description:
          "Lists products with pagination, search, category filter, status filter, price range filters, and sorting. Defaults to ACTIVE status. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20 },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "categoryId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["ACTIVE", "ARCHIVED", "ALL"], default: "ACTIVE" },
          },
          {
            name: "minPrice",
            in: "query",
            required: false,
            schema: { type: "number" },
          },
          {
            name: "maxPrice",
            in: "query",
            required: false,
            schema: { type: "number" },
          },
          {
            name: "sortBy",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["name", "sku", "costPrice", "sellingPrice", "createdAt", "updatedAt"],
              default: "createdAt",
            },
          },
          {
            name: "sortOrder",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
          },
        ],
        responses: {
          "200": {
            description: "Products retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedProductsResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/products/{productId}": {
      get: {
        tags: ["Products"],
        summary: "Get product by ID",
        description:
          "Retrieves a single product by ID scoped to the organization. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "productId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Product retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product not found" },
        },
      },
      patch: {
        tags: ["Products"],
        summary: "Update product",
        description:
          "Partially updates product fields. Validates SKU uniqueness and category tenant membership. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "productId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProductInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Product updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error or category belongs to different tenant" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product not found" },
          "409": { description: "Conflict: SKU already exists in this organization" },
        },
      },
      delete: {
        tags: ["Products"],
        summary: "Archive product",
        description:
          "Soft-archives a product by setting status to ARCHIVED. Preserves audit history. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "productId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Product soft-archived successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeProductDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/warehouses": {
      post: {
        tags: ["Warehouses"],
        summary: "Create warehouse",
        description:
          "Creates a new warehouse facility within the organization. Enforces code uniqueness per tenant. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWarehouseInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Warehouse created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeWarehouseDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
          "409": { description: "Conflict: Warehouse code already exists in organization" },
        },
      },
      get: {
        tags: ["Warehouses"],
        summary: "List warehouses",
        description:
          "Lists warehouses with search across code/name, status filter, sorting, and pagination. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20 },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["ACTIVE", "INACTIVE", "ALL"], default: "ACTIVE" },
          },
          {
            name: "sortBy",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["name", "code", "createdAt", "updatedAt"],
              default: "createdAt",
            },
          },
          {
            name: "sortOrder",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
          },
        ],
        responses: {
          "200": {
            description: "Warehouses retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedWarehousesResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/warehouses/{warehouseId}": {
      get: {
        tags: ["Warehouses"],
        summary: "Get warehouse by ID",
        description:
          "Retrieves a single warehouse by ID scoped to the organization. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Warehouse retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeWarehouseDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Warehouse not found" },
        },
      },
      patch: {
        tags: ["Warehouses"],
        summary: "Update warehouse",
        description:
          "Updates warehouse details. If setting status to INACTIVE, cascades deactivation to all storage locations. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateWarehouseInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Warehouse updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeWarehouseDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Warehouse not found" },
          "409": { description: "Conflict: Warehouse code already in use" },
        },
      },
      delete: {
        tags: ["Warehouses"],
        summary: "Deactivate warehouse",
        description:
          "Soft-deactivates the warehouse and atomically cascades deactivation to all child storage locations. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Warehouse deactivated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeWarehouseDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Warehouse not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/warehouses/{warehouseId}/locations": {
      post: {
        tags: ["Storage Locations"],
        summary: "Create storage location",
        description:
          "Creates a new storage location inside an active warehouse. Rejects creation if warehouse is inactive. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateLocationInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Storage location created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeStorageLocationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error or warehouse is inactive" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Warehouse not found" },
          "409": { description: "Conflict: Location code already exists in warehouse" },
        },
      },
      get: {
        tags: ["Storage Locations"],
        summary: "List storage locations",
        description:
          "Lists storage locations within a warehouse with search, type filter, status filter, and pagination. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20 },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["ACTIVE", "INACTIVE", "ALL"], default: "ACTIVE" },
          },
          {
            name: "sortBy",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["code", "name", "type", "createdAt", "updatedAt"],
              default: "code",
            },
          },
          {
            name: "sortOrder",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
          },
        ],
        responses: {
          "200": {
            description: "Storage locations retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedLocationsResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Warehouse not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/warehouses/{warehouseId}/locations/{locationId}": {
      get: {
        tags: ["Storage Locations"],
        summary: "Get storage location by ID",
        description:
          "Retrieves a single storage location by ID scoped to the warehouse and organization. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "locationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Storage location retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeStorageLocationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Storage location not found" },
        },
      },
      patch: {
        tags: ["Storage Locations"],
        summary: "Update storage location",
        description:
          "Updates storage location details. Cannot activate a location if the parent warehouse is inactive. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "locationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateLocationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Storage location updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeStorageLocationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error or warehouse is inactive" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Storage location not found" },
          "409": { description: "Conflict: Location code already in use" },
        },
      },
      delete: {
        tags: ["Storage Locations"],
        summary: "Deactivate storage location",
        description:
          "Soft-deactivates the storage location by setting status to INACTIVE. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "locationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Storage location deactivated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeStorageLocationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Storage location not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/inventory/balances": {
      get: {
        tags: ["Inventory"],
        summary: "List inventory balances",
        description:
          "Retrieves paginated stock balances per product and location with optional filtering by product, warehouse, location, or search term. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1, minimum: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
          {
            name: "productId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "locationId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Inventory balances retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedBalancesResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/inventory/receipts": {
      post: {
        tags: ["Inventory"],
        summary: "Receive stock into storage location",
        description:
          "Atomically receives incoming inventory stock into a designated storage location and records a RECEIPT ledger entry. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReceiptInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Stock received successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        transaction: { $ref: "#/components/schemas/SafeInventoryTransactionDto" },
                        balance: { $ref: "#/components/schemas/SafeInventoryBalanceDto" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error or inactive product/location/warehouse" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product or storage location not found" },
          "409": { description: "Conflict: Idempotency key reused with different payload" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/inventory/issues": {
      post: {
        tags: ["Inventory"],
        summary: "Issue stock from storage location",
        description:
          "Atomically decreases inventory balance at a storage location and records an ISSUE ledger entry. Rejects if stock is insufficient to prevent negative balances. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IssueInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Stock issued successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        transaction: { $ref: "#/components/schemas/SafeInventoryTransactionDto" },
                        balance: { $ref: "#/components/schemas/SafeInventoryBalanceDto" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": {
            description:
              "Validation error, insufficient stock, or inactive product/location/warehouse",
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product or storage location not found" },
          "409": { description: "Conflict: Idempotency key reused with different payload" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/inventory/adjustments": {
      post: {
        tags: ["Inventory"],
        summary: "Adjust stock at storage location",
        description:
          "Adjusts inventory quantity at a location using a signed delta and records an ADJUSTMENT ledger entry with mandatory reason. Rejects adjustments that would cause negative stock. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdjustmentInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Stock adjusted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        transaction: { $ref: "#/components/schemas/SafeInventoryTransactionDto" },
                        balance: { $ref: "#/components/schemas/SafeInventoryBalanceDto" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": {
            description:
              "Validation error, adjustment results in negative stock, or inactive product/location/warehouse",
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product or storage location not found" },
          "409": { description: "Conflict: Idempotency key reused with different payload" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/inventory/transfers": {
      post: {
        tags: ["Inventory"],
        summary: "Transfer stock between storage locations",
        description:
          "Atomically decreases source balance, increases destination balance, and creates exactly ONE logical TRANSFER ledger entry. Rejects identical locations or insufficient source stock. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TransferInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Stock transferred successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        transaction: { $ref: "#/components/schemas/SafeInventoryTransactionDto" },
                        sourceBalance: { $ref: "#/components/schemas/SafeInventoryBalanceDto" },
                        destinationBalance: {
                          $ref: "#/components/schemas/SafeInventoryBalanceDto",
                        },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": {
            description:
              "Validation error, identical locations, insufficient source stock, or inactive resources",
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Product or storage locations not found" },
          "409": { description: "Conflict: Idempotency key reused with different payload" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/inventory/transactions": {
      get: {
        tags: ["Inventory"],
        summary: "List inventory transactions history",
        description:
          "Retrieves paginated audit history of inventory movements and adjustments with filters by product, warehouse, location, transaction type, and date range. Requires OWNER, ADMIN, or MEMBER role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1, minimum: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
          {
            name: "productId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "warehouseId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "locationId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "type",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER"],
            },
          },
          {
            name: "startDate",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "endDate",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Inventory transactions retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedTransactionsResponse" },
              },
            },
          },
          "400": { description: "Invalid query parameters or date range" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Organization not found" },
        },
      },
    },
    "/health/ready": {
      get: {
        tags: ["Health Probes"],
        summary: "Readiness probe",
        description: "Validates database connectivity and service readiness.",
        responses: {
          "200": { description: "Service is fully ready to handle ingress traffic" },
          "503": { description: "Service unavailable: Critical dependencies unreachable" },
        },
      },
    },
    "/health": {
      get: {
        tags: ["Health Probes"],
        summary: "Comprehensive health and telemetry",
        description:
          "Returns detailed system overview, process telemetry, and database connectivity status.",
        responses: {
          "200": { description: "Telemetry collected successfully" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/suppliers": {
      post: {
        tags: ["Suppliers"],
        summary: "Create supplier",
        description: "Registers a new vendor with normalized uppercase code.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSupplierInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Supplier created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeSupplierDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "409": { $ref: "#/components/responses/ConflictError" },
        },
      },
      get: {
        tags: ["Suppliers"],
        summary: "List suppliers",
        description: "Retrieves a paginated list of suppliers with search and status filters.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "isActive", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Suppliers retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedSuppliersResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/suppliers/{supplierId}": {
      get: {
        tags: ["Suppliers"],
        summary: "Get supplier details",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "supplierId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Supplier retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeSupplierDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
      patch: {
        tags: ["Suppliers"],
        summary: "Update supplier",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "supplierId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateSupplierInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Supplier updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeSupplierDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
          "409": { $ref: "#/components/responses/ConflictError" },
        },
      },
      delete: {
        tags: ["Suppliers"],
        summary: "Deactivate supplier",
        description:
          "Soft-deactivates supplier (isActive: false) to preserve historic procurement audit trails.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "supplierId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Supplier deactivated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeSupplierDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/purchase-orders": {
      post: {
        tags: ["Purchase Orders"],
        summary: "Create purchase order",
        description: "Creates a new purchase order draft with multiple line items.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePurchaseOrderInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Purchase order draft created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
      get: {
        tags: ["Purchase Orders"],
        summary: "List purchase orders",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "supplierId", in: "query", schema: { type: "string", format: "uuid" } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "DRAFT",
                "PENDING_APPROVAL",
                "APPROVED",
                "PARTIALLY_RECEIVED",
                "RECEIVED",
                "CANCELLED",
              ],
            },
          },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Purchase orders retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedPurchaseOrdersResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}": {
      get: {
        tags: ["Purchase Orders"],
        summary: "Get purchase order details",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "purchaseOrderId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Purchase order retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
      patch: {
        tags: ["Purchase Orders"],
        summary: "Update draft purchase order",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "purchaseOrderId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdatePurchaseOrderInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Purchase order updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/submit": {
      post: {
        tags: ["Purchase Orders"],
        summary: "Submit purchase order for approval",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "purchaseOrderId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Purchase order submitted for approval",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/approve": {
      post: {
        tags: ["Purchase Orders"],
        summary: "Approve purchase order",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "purchaseOrderId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Purchase order approved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/cancel": {
      post: {
        tags: ["Purchase Orders"],
        summary: "Cancel purchase order",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "purchaseOrderId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Purchase order cancelled successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/dashboard/inventory": {
      get: {
        tags: ["Inventory Dashboard"],
        summary: "Executive inventory dashboard",
        description:
          "Returns aggregated counts, stock by UOM, movement trends, and PO commitments.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "recentLimit", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: {
          "200": {
            description: "Dashboard metrics retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InventoryDashboardResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/reports/inventory-by-warehouse": {
      get: {
        tags: ["Inventory Reports"],
        summary: "Stock distribution by warehouse",
        description: "Returns stock levels grouped by storage facility and unit of measure.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "warehouseId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Warehouse inventory report retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WarehouseInventoryReportResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/reports/inventory-movements": {
      get: {
        tags: ["Inventory Reports"],
        summary: "Inventory movement transactions report",
        description: "Paginated audit movements with type and UOM aggregations.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
          {
            name: "type",
            in: "query",
            schema: { type: "string", enum: ["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER"] },
          },
          { name: "productId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "warehouseId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "locationId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Inventory movements report retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InventoryMovementsReportResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/reports/product-inventory": {
      get: {
        tags: ["Inventory Reports"],
        summary: "Product inventory report",
        description: "Paginated product summary with non-duplicated rows and location breakdown.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "productId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "warehouseId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "locationId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Product inventory report retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductInventoryReportResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/reports/low-stock": {
      get: {
        tags: ["Inventory Reports"],
        summary: "Low stock alert report",
        description: "Products with total stock falling below Product.lowStockThreshold.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "thresholdOverride", in: "query", schema: { type: "integer" } },
          {
            name: "includeZeroThreshold",
            in: "query",
            schema: { type: "boolean", default: false },
          },
        ],
        responses: {
          "200": {
            description: "Low stock report retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LowStockReportResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/reports/purchase-orders": {
      get: {
        tags: ["Inventory Reports"],
        summary: "Purchase order report",
        description: "Procurement commitments, status distribution, and outstanding quantities.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "supplierId", in: "query", schema: { type: "string", format: "uuid" } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "DRAFT",
                "PENDING_APPROVAL",
                "APPROVED",
                "PARTIALLY_RECEIVED",
                "RECEIVED",
                "CANCELLED",
              ],
            },
          },
        ],
        responses: {
          "200": {
            description: "Purchase order report retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PurchaseOrderReportResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/reports/recent-activity": {
      get: {
        tags: ["Inventory Reports"],
        summary: "Recent inventory activity report",
        description: "Returns latest ledger transaction activity up to requested limit.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "Recent activity retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecentActivityReportResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/receipts": {
      post: {
        tags: ["Purchase Orders"],
        summary: "Record delivery receipt and sync inventory",
        description: "Atomically records delivered items, updates inventory balance and ledger.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "purchaseOrderId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReceivePurchaseOrderItemsInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Items received and stock balances updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequestError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
          "409": { $ref: "#/components/responses/ConflictError" },
        },
      },
    },
    "/api/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notifications for authenticated user",
        description:
          "Returns paginated notifications with optional unreadOnly, type, and organization filters.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "organizationId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Notifications retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedNotificationsResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
        },
      },
    },
    "/api/v1/notifications/unread-count": {
      get: {
        tags: ["Notifications"],
        summary: "Get unread notifications count",
        description:
          "Returns total unread notifications for current user, optionally scoped to an organization.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "organizationId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Unread count retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnreadCountResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
        },
      },
    },
    "/api/v1/notifications/{notificationId}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark notification as read",
        description:
          "Idempotently marks a single notification belonging to the authenticated user as read.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "notificationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Notification marked as read successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/SafeNotificationDto" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/notifications/read-all": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        description: "Bulk marks all unread notifications belonging to the user as read.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "organizationId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Notifications bulk marked as read successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BulkReadResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/audit-logs": {
      get: {
        tags: ["Audit Logs"],
        summary: "List organization audit logs",
        description:
          "Query immutable append-only organization audit logs. Requires OWNER or ADMIN role.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "resourceType", in: "query", schema: { type: "string" } },
          { name: "resourceId", in: "query", schema: { type: "string" } },
          { name: "actorUserId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": {
            description: "Audit logs retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedAuditLogsResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/forecasts/demand": {
      post: {
        tags: ["Demand Forecasting"],
        summary: "Initiate demand forecast run",
        description:
          "Executes deterministic demand forecasting based on historical inventory ledger consumption records, generating time-series point predictions with 95% confidence intervals and walk-forward backtesting evaluation.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateDemandForecastInput" },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Demand forecast run completed successfully or marked INSUFFICIENT_HISTORY",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DemandForecastRunDetailResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
      get: {
        tags: ["Demand Forecasting"],
        summary: "List demand forecast runs",
        description:
          "Retrieves a paginated list of historical demand forecast runs with optional status and date filters.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "INSUFFICIENT_HISTORY"],
            },
          },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": {
            description: "List of demand forecast runs retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedForecastRunsResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/forecasts/demand/{forecastId}": {
      get: {
        tags: ["Demand Forecasting"],
        summary: "Get demand forecast run details",
        description:
          "Retrieves metadata and time-series prediction points for a specific demand forecast run.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "forecastId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Demand forecast run details retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DemandForecastRunDetailResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/forecasts/demand/{forecastId}/evaluation": {
      get: {
        tags: ["Demand Forecasting"],
        summary: "Get demand forecast evaluation metrics",
        description:
          "Retrieves walk-forward backtesting evaluation report (MAE, RMSE, WAPE) for a completed forecast run.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "forecastId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Forecast evaluation metrics retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DemandForecastEvaluationResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/anomalies/detection-runs": {
      post: {
        tags: ["Inventory Anomalies"],
        summary: "Initiate bounded anomaly detection run",
        description:
          "Executes statistical detection strategies (large movements, unusual shrinkage, repeated adjustments, lateral transfer rebound) across historical ledger records.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TriggerAnomalyDetectionInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Anomaly detection run initiated and completed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnomalyDetectionRunDetailResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
      get: {
        tags: ["Inventory Anomalies"],
        summary: "List anomaly detection runs",
        description: "Retrieves a paginated list of historical anomaly detection runs.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"],
            },
          },
        ],
        responses: {
          "200": {
            description: "List of anomaly detection runs retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedDetectionRunsResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/anomalies/detection-runs/{runId}": {
      get: {
        tags: ["Inventory Anomalies"],
        summary: "Get anomaly detection run detail",
        description: "Retrieves details and associated findings for a specific detection run.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "runId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Detection run details retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnomalyDetectionRunDetailResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/anomalies": {
      get: {
        tags: ["Inventory Anomalies"],
        summary: "List detected inventory anomalies",
        description:
          "Retrieves paginated anomaly findings with filtering by category, severity, status, and product.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          {
            name: "category",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "UNUSUALLY_LARGE_MOVEMENT",
                "UNUSUAL_ADJUSTMENT",
                "REPEATED_ADJUSTMENTS",
                "UNUSUAL_TRANSFER_PATTERN",
              ],
            },
          },
          {
            name: "severity",
            in: "query",
            schema: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
            },
          },
          { name: "productId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "warehouseId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "List of anomalies retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedAnomaliesResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/anomalies/{anomalyId}": {
      get: {
        tags: ["Inventory Anomalies"],
        summary: "Get anomaly finding details",
        description:
          "Retrieves complete information, statistical evidence, and explanation for an individual anomaly finding.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "anomalyId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Anomaly finding retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InventoryAnomalyResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
    "/api/v1/organizations/{organizationId}/anomalies/{anomalyId}/status": {
      patch: {
        tags: ["Inventory Anomalies"],
        summary: "Update anomaly finding status",
        description:
          "Updates the review status of an anomaly finding (ACKNOWLEDGED, RESOLVED, DISMISSED) with resolution notes.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "organizationId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "anomalyId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateAnomalyStatusInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Anomaly status updated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InventoryAnomalyResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Standard JSON Web Token passed in Authorization header: Bearer <token>",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "stockpilot_refresh_token",
        description: "Secure HttpOnly cookie containing rotating refresh token",
      },
    },
    schemas: {
      RegisterInput: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 50, example: "Sarah Connor" },
          email: { type: "string", format: "email", example: "sarah.connor@stockpilot.ai" },
          password: { type: "string", minLength: 8, maxLength: 128, example: "SecretPassword123!" },
        },
      },
      LoginInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "sarah.connor@stockpilot.ai" },
          password: { type: "string", example: "SecretPassword123!" },
        },
      },
      SafeUserDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
          name: { type: "string", example: "Sarah Connor" },
          email: { type: "string", format: "email", example: "sarah.connor@stockpilot.ai" },
          status: { type: "string", example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AuthSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/SafeUserDto" },
              accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      ProfileSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/SafeUserDto" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      ApiErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "UNAUTHORIZED" },
              message: { type: "string", example: "Invalid email or password." },
              details: { type: "array", items: { type: "object" } },
            },
          },
          requestId: { type: "string", example: "4509fbe7-b358-4523-8611-cf972a9a77ad" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      SafeOrganizationDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid", example: "76d1e4eb-9dcb-41d1-8288-971c26f0412b" },
          name: { type: "string", example: "Acme Global Logistics" },
          slug: { type: "string", example: "acme-global-logistics" },
          status: { type: "string", example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      OrganizationWithRoleDto: {
        allOf: [
          { $ref: "#/components/schemas/SafeOrganizationDto" },
          {
            type: "object",
            properties: {
              role: { type: "string", enum: ["OWNER", "ADMIN", "MEMBER"], example: "OWNER" },
            },
          },
        ],
      },
      OrganizationMemberDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "MEMBER"], example: "MEMBER" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          user: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string", example: "Alice Smith" },
              email: { type: "string", format: "email", example: "alice@example.com" },
            },
          },
        },
      },
      SafeInvitationDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          email: { type: "string", format: "email", example: "teammate@example.com" },
          role: { type: "string", enum: ["ADMIN", "MEMBER"], example: "MEMBER" },
          expiresAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          invitedBy: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              email: { type: "string" },
            },
          },
        },
      },
      CreateOrganizationInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100, example: "Acme Global Logistics" },
        },
      },
      UpdateOrganizationInput: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100, example: "Acme Supply Chain" },
        },
      },
      UpdateMemberRoleInput: {
        type: "object",
        required: ["role"],
        properties: {
          role: { type: "string", enum: ["ADMIN", "MEMBER"], example: "ADMIN" },
        },
      },
      CreateInvitationInput: {
        type: "object",
        required: ["email", "role"],
        properties: {
          email: { type: "string", format: "email", example: "new.member@acme.com" },
          role: { type: "string", enum: ["ADMIN", "MEMBER"], example: "MEMBER" },
        },
      },
      AcceptInvitationInput: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", minLength: 1, maxLength: 256, example: "4f9d2e1a8b3c..." },
        },
      },
      CreateOrganizationResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              organization: { $ref: "#/components/schemas/SafeOrganizationDto" },
              role: { type: "string", enum: ["OWNER", "ADMIN", "MEMBER"], example: "OWNER" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      ListOrganizationsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/OrganizationWithRoleDto" },
          },
          meta: {
            type: "object",
            properties: {
              page: { type: "integer", example: 1 },
              limit: { type: "integer", example: 20 },
              total: { type: "integer", example: 1 },
              totalPages: { type: "integer", example: 1 },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateCategoryInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100, example: "Electronics" },
          description: {
            type: "string",
            maxLength: 500,
            example: "Consumer electronic products and components",
          },
        },
      },
      UpdateCategoryInput: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100, example: "Consumer Electronics" },
          description: { type: "string", maxLength: 500, example: "Updated description" },
        },
      },
      SafeProductCategoryDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string", example: "Electronics" },
          description: { type: "string", nullable: true, example: "Consumer electronics" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          productCount: { type: "integer", example: 42 },
        },
      },
      PaginatedCategoriesResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeProductCategoryDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 5 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateProductInput: {
        type: "object",
        required: ["sku", "name"],
        properties: {
          sku: { type: "string", minLength: 1, maxLength: 50, example: "ELEC-WIDGET-001" },
          name: { type: "string", minLength: 1, maxLength: 150, example: "Smart Widget Pro" },
          description: {
            type: "string",
            maxLength: 1000,
            example: "High precision wireless sensor widget",
          },
          categoryId: { type: "string", format: "uuid", nullable: true },
          unitOfMeasure: { type: "string", maxLength: 20, default: "PCS", example: "PCS" },
          costPrice: { type: "number", minimum: 0, default: 0, example: 45.5 },
          sellingPrice: { type: "number", minimum: 0, default: 0, example: 89.99 },
          lowStockThreshold: { type: "integer", minimum: 0, default: 0, example: 10 },
        },
      },
      UpdateProductInput: {
        type: "object",
        properties: {
          sku: { type: "string", minLength: 1, maxLength: 50, example: "ELEC-WIDGET-002" },
          name: { type: "string", minLength: 1, maxLength: 150, example: "Smart Widget Pro Max" },
          description: { type: "string", maxLength: 1000 },
          categoryId: { type: "string", format: "uuid", nullable: true },
          unitOfMeasure: { type: "string", maxLength: 20, example: "BOX" },
          costPrice: { type: "number", minimum: 0, example: 50.0 },
          sellingPrice: { type: "number", minimum: 0, example: 99.99 },
          lowStockThreshold: { type: "integer", minimum: 0, example: 15 },
          status: { type: "string", enum: ["ACTIVE", "ARCHIVED"], example: "ACTIVE" },
        },
      },
      SafeProductDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          categoryId: { type: "string", format: "uuid", nullable: true },
          sku: { type: "string", example: "ELEC-WIDGET-001" },
          name: { type: "string", example: "Smart Widget Pro" },
          description: { type: "string", nullable: true },
          unitOfMeasure: { type: "string", example: "PCS" },
          costPrice: { type: "number", example: 45.5 },
          sellingPrice: { type: "number", example: 89.99 },
          lowStockThreshold: { type: "integer", example: 10 },
          status: { type: "string", enum: ["ACTIVE", "ARCHIVED"], example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          category: {
            type: "object",
            nullable: true,
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string", example: "Electronics" },
            },
          },
        },
      },
      PaginatedProductsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeProductDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 100 },
                  totalPages: { type: "integer", example: 5 },
                  hasNextPage: { type: "boolean", example: true },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateWarehouseInput: {
        type: "object",
        required: ["code", "name"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 50, example: "WH-NYC-01" },
          name: {
            type: "string",
            minLength: 1,
            maxLength: 150,
            example: "New York Main Distribution Hub",
          },
          description: {
            type: "string",
            maxLength: 1000,
            example: "Primary East Coast fulfillment warehouse",
          },
          addressLine1: { type: "string", maxLength: 255, example: "123 Logistics Way" },
          addressLine2: { type: "string", maxLength: 255, example: "Building B" },
          city: { type: "string", maxLength: 100, example: "Brooklyn" },
          state: { type: "string", maxLength: 100, example: "NY" },
          postalCode: { type: "string", maxLength: 30, example: "11201" },
          country: { type: "string", maxLength: 100, example: "United States" },
        },
      },
      UpdateWarehouseInput: {
        type: "object",
        properties: {
          code: { type: "string", minLength: 1, maxLength: 50, example: "WH-NYC-02" },
          name: { type: "string", minLength: 1, maxLength: 150, example: "New York Hub Updated" },
          description: { type: "string", maxLength: 1000 },
          addressLine1: { type: "string", maxLength: 255 },
          addressLine2: { type: "string", maxLength: 255 },
          city: { type: "string", maxLength: 100 },
          state: { type: "string", maxLength: 100 },
          postalCode: { type: "string", maxLength: 30 },
          country: { type: "string", maxLength: 100 },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" },
        },
      },
      SafeWarehouseDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          code: { type: "string", example: "WH-NYC-01" },
          name: { type: "string", example: "New York Main Distribution Hub" },
          description: { type: "string", nullable: true },
          addressLine1: { type: "string", nullable: true },
          addressLine2: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          state: { type: "string", nullable: true },
          postalCode: { type: "string", nullable: true },
          country: { type: "string", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          locationCount: { type: "integer", example: 12 },
        },
      },
      PaginatedWarehousesResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeWarehouseDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 5 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateLocationInput: {
        type: "object",
        required: ["code", "name"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 50, example: "RACK-A-01" },
          name: { type: "string", minLength: 1, maxLength: 150, example: "Aisle A Rack 1" },
          description: { type: "string", maxLength: 1000, example: "Heavy load pallet storage" },
          type: { type: "string", maxLength: 50, example: "RACK" },
        },
      },
      UpdateLocationInput: {
        type: "object",
        properties: {
          code: { type: "string", minLength: 1, maxLength: 50, example: "RACK-A-02" },
          name: { type: "string", minLength: 1, maxLength: 150, example: "Aisle A Rack 2" },
          description: { type: "string", maxLength: 1000 },
          type: { type: "string", maxLength: 50, example: "SHELF" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" },
        },
      },
      SafeStorageLocationDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          warehouseId: { type: "string", format: "uuid" },
          code: { type: "string", example: "RACK-A-01" },
          name: { type: "string", example: "Aisle A Rack 1" },
          description: { type: "string", nullable: true },
          type: { type: "string", nullable: true, example: "RACK" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedLocationsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeStorageLocationDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 15 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      ReceiptInput: {
        type: "object",
        required: ["productId", "locationId", "quantity"],
        properties: {
          productId: { type: "string", format: "uuid" },
          locationId: { type: "string", format: "uuid" },
          quantity: {
            type: "string",
            example: "25.0000",
            description: "Strictly positive quantity with at most 4 decimal places",
          },
          reference: { type: "string", example: "PO-1001", maxLength: 100 },
          notes: { type: "string", example: "Initial shipment", maxLength: 1000 },
          idempotencyKey: { type: "string", example: "uuid-idempotency-key", maxLength: 128 },
        },
      },
      IssueInput: {
        type: "object",
        required: ["productId", "locationId", "quantity"],
        properties: {
          productId: { type: "string", format: "uuid" },
          locationId: { type: "string", format: "uuid" },
          quantity: {
            type: "string",
            example: "5.0000",
            description: "Strictly positive quantity with at most 4 decimal places",
          },
          reason: { type: "string", example: "DAMAGED", maxLength: 100 },
          reference: { type: "string", example: "ISSUE-1001", maxLength: 100 },
          notes: { type: "string", example: "Damaged during transit", maxLength: 1000 },
          idempotencyKey: { type: "string", example: "uuid-idempotency-key", maxLength: 128 },
        },
      },
      AdjustmentInput: {
        type: "object",
        required: ["productId", "locationId", "quantityDelta", "reason"],
        properties: {
          productId: { type: "string", format: "uuid" },
          locationId: { type: "string", format: "uuid" },
          quantityDelta: {
            type: "string",
            example: "-2.0000",
            description: "Nonzero signed decimal delta with at most 4 decimal places",
          },
          reason: { type: "string", example: "STOCK_COUNT", maxLength: 100 },
          reference: { type: "string", example: "AUDIT-2026-Q1", maxLength: 100 },
          notes: { type: "string", example: "Physical count reconciliation", maxLength: 1000 },
          idempotencyKey: { type: "string", example: "uuid-idempotency-key", maxLength: 128 },
        },
      },
      TransferInput: {
        type: "object",
        required: ["productId", "sourceLocationId", "destinationLocationId", "quantity"],
        properties: {
          productId: { type: "string", format: "uuid" },
          sourceLocationId: { type: "string", format: "uuid" },
          destinationLocationId: { type: "string", format: "uuid" },
          quantity: {
            type: "string",
            example: "8.0000",
            description: "Strictly positive quantity with at most 4 decimal places",
          },
          reference: { type: "string", example: "TRANSFER-1001", maxLength: 100 },
          notes: { type: "string", example: "Aisle replenishment", maxLength: 1000 },
          idempotencyKey: { type: "string", example: "uuid-idempotency-key", maxLength: 128 },
        },
      },
      SafeInventoryBalanceDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          productId: { type: "string", format: "uuid" },
          warehouseId: { type: "string", format: "uuid" },
          locationId: { type: "string", format: "uuid" },
          quantityOnHand: { type: "string", example: "25.0000" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          product: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              sku: { type: "string", example: "PROD-SKU-001" },
              name: { type: "string", example: "Wireless Mouse" },
              unitOfMeasure: { type: "string", example: "PCS" },
              status: { type: "string", example: "ACTIVE" },
            },
          },
          warehouse: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              code: { type: "string", example: "WH-NYC-01" },
              name: { type: "string", example: "New York Hub" },
              status: { type: "string", example: "ACTIVE" },
            },
          },
          location: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              code: { type: "string", example: "AISLE-A1" },
              name: { type: "string", example: "Aisle A, Shelf 1" },
              type: { type: "string", example: "SHELF" },
              status: { type: "string", example: "ACTIVE" },
            },
          },
        },
      },
      SafeInventoryTransactionDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          productId: { type: "string", format: "uuid" },
          warehouseId: { type: "string", format: "uuid", nullable: true },
          type: {
            type: "string",
            enum: ["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER"],
            example: "RECEIPT",
          },
          quantity: { type: "string", example: "25.0000" },
          quantityDelta: { type: "string", example: "25.0000" },
          sourceLocationId: { type: "string", format: "uuid", nullable: true },
          destinationLocationId: { type: "string", format: "uuid", nullable: true },
          reason: { type: "string", nullable: true, example: "STOCK_COUNT" },
          reference: { type: "string", nullable: true, example: "PO-1001" },
          notes: { type: "string", nullable: true, example: "Initial receipt" },
          idempotencyKey: { type: "string", nullable: true, example: "key-123" },
          performedByUserId: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          product: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              sku: { type: "string", example: "PROD-SKU-001" },
              name: { type: "string", example: "Wireless Mouse" },
              unitOfMeasure: { type: "string", example: "PCS" },
            },
          },
          performedByUser: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string", example: "Alice Johnson" },
              email: { type: "string", format: "email", example: "alice@stockpilot.io" },
            },
          },
        },
      },
      PaginatedBalancesResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeInventoryBalanceDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 5 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      InventoryDashboardResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              overview: {
                type: "object",
                properties: {
                  totalActiveProducts: { type: "integer", example: 45 },
                  totalActiveWarehouses: { type: "integer", example: 3 },
                  totalActiveStorageLocations: { type: "integer", example: 24 },
                  positiveStockBalancesCount: { type: "integer", example: 38 },
                  zeroStockBalancesCount: { type: "integer", example: 6 },
                  unitsOnHand: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        unitOfMeasure: { type: "string", example: "PCS" },
                        totalQuantityOnHand: { type: "string", example: "1250.0000" },
                      },
                    },
                  },
                },
              },
              movementsWindow: {
                type: "object",
                properties: {
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                  totalTransactions: { type: "integer", example: 85 },
                  countsByType: { type: "object" },
                  quantitiesByTypeAndUom: { type: "array", items: { type: "object" } },
                },
              },
              purchaseOrdersSummary: {
                type: "object",
                properties: {
                  totalOrdersCount: { type: "integer", example: 12 },
                  countsByStatus: { type: "object" },
                  totalCommittedValue: { type: "string", example: "15420.0000" },
                  totalDraftValue: { type: "string", example: "2400.0000" },
                  totalCancelledValue: { type: "string", example: "1200.0000" },
                  pendingApprovalCount: { type: "integer", example: 2 },
                },
              },
              recentTransactions: { type: "array", items: { type: "object" } },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      WarehouseInventoryReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              warehouses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    warehouseId: { type: "string", format: "uuid" },
                    warehouseCode: { type: "string", example: "WH-EAST" },
                    warehouseName: { type: "string", example: "East Hub" },
                    status: { type: "string", example: "ACTIVE" },
                    locationCount: { type: "integer", example: 12 },
                    positiveStockLocationsCount: { type: "integer", example: 9 },
                    distinctProductsCount: { type: "integer", example: 25 },
                    stockByUom: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      InventoryMovementsReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              summary: { type: "object" },
              items: { type: "array", items: { type: "object" } },
              pagination: { type: "object" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      ProductInventoryReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    productId: { type: "string", format: "uuid" },
                    sku: { type: "string", example: "STEEL-01" },
                    name: { type: "string", example: "Industrial Bolt" },
                    categoryName: { type: "string", nullable: true },
                    unitOfMeasure: { type: "string", example: "PCS" },
                    costPrice: { type: "string", example: "1.5000" },
                    sellingPrice: { type: "string", example: "3.0000" },
                    status: { type: "string", example: "ACTIVE" },
                    totalQuantityOnHand: { type: "string", example: "150.0000" },
                    locationCount: { type: "integer", example: 2 },
                    locations: { type: "array", items: { type: "object" } },
                  },
                },
              },
              pagination: { type: "object" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      LowStockReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                properties: {
                  lowStockProductsCount: { type: "integer", example: 3 },
                },
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    productId: { type: "string", format: "uuid" },
                    sku: { type: "string", example: "FILTER-01" },
                    name: { type: "string", example: "Oil Filter" },
                    categoryName: { type: "string", nullable: true },
                    unitOfMeasure: { type: "string", example: "PCS" },
                    lowStockThreshold: { type: "integer", example: 50 },
                    totalQuantityOnHand: { type: "string", example: "12.0000" },
                    deficit: { type: "string", example: "38.0000" },
                    status: { type: "string", example: "ACTIVE" },
                    locationsCount: { type: "integer", example: 1 },
                  },
                },
              },
              pagination: { type: "object" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      PurchaseOrderReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              summary: { type: "object" },
              items: { type: "array", items: { type: "object" } },
              pagination: { type: "object" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      RecentActivityReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "object" } },
              limit: { type: "integer", example: 20 },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateSupplierInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", example: "Acme Supplies Inc." },
          code: { type: "string", nullable: true, example: "SUP-ACME-01" },
          email: { type: "string", format: "email", nullable: true, example: "orders@acme.com" },
          phone: { type: "string", nullable: true, example: "+1-555-0199" },
          contactPerson: { type: "string", nullable: true, example: "Jane Doe" },
          address: { type: "string", nullable: true, example: "100 Industrial Pkwy" },
          taxIdentifier: { type: "string", nullable: true, example: "US-987654321" },
          notes: { type: "string", nullable: true, example: "Key vendor" },
          isActive: { type: "boolean", default: true },
        },
      },
      UpdateSupplierInput: {
        type: "object",
        properties: {
          name: { type: "string", example: "Acme Supplies Inc." },
          code: { type: "string", nullable: true, example: "SUP-ACME-01" },
          email: { type: "string", format: "email", nullable: true, example: "orders@acme.com" },
          phone: { type: "string", nullable: true, example: "+1-555-0199" },
          contactPerson: { type: "string", nullable: true, example: "Jane Doe" },
          address: { type: "string", nullable: true, example: "100 Industrial Pkwy" },
          taxIdentifier: { type: "string", nullable: true, example: "US-987654321" },
          notes: { type: "string", nullable: true, example: "Key vendor" },
          isActive: { type: "boolean" },
        },
      },
      SafeSupplierDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string", example: "Acme Supplies Inc." },
          code: { type: "string", nullable: true, example: "SUP-ACME-01" },
          email: { type: "string", format: "email", nullable: true, example: "orders@acme.com" },
          phone: { type: "string", nullable: true, example: "+1-555-0199" },
          contactPerson: { type: "string", nullable: true, example: "Jane Doe" },
          address: { type: "string", nullable: true, example: "100 Industrial Pkwy" },
          taxIdentifier: { type: "string", nullable: true, example: "US-987654321" },
          notes: { type: "string", nullable: true, example: "Key vendor" },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedSuppliersResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeSupplierDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 1 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreatePurchaseOrderInput: {
        type: "object",
        required: ["supplierId", "items"],
        properties: {
          supplierId: { type: "string", format: "uuid" },
          orderDate: { type: "string", format: "date-time" },
          expectedDeliveryDate: { type: "string", format: "date-time", nullable: true },
          currency: { type: "string", default: "USD", example: "USD" },
          taxAmount: { type: "number", default: 0, example: 25 },
          notes: { type: "string", nullable: true, example: "Q4 Stock Replenishment" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["productId", "quantityOrdered", "unitCost"],
              properties: {
                productId: { type: "string", format: "uuid" },
                quantityOrdered: { type: "number", example: 100 },
                unitCost: { type: "number", example: 14.5 },
              },
            },
          },
        },
      },
      UpdatePurchaseOrderInput: {
        type: "object",
        properties: {
          supplierId: { type: "string", format: "uuid" },
          orderDate: { type: "string", format: "date-time" },
          expectedDeliveryDate: { type: "string", format: "date-time", nullable: true },
          currency: { type: "string", example: "USD" },
          taxAmount: { type: "number", example: 25 },
          notes: { type: "string", nullable: true, example: "Updated instructions" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["productId", "quantityOrdered", "unitCost"],
              properties: {
                productId: { type: "string", format: "uuid" },
                quantityOrdered: { type: "number", example: 100 },
                unitCost: { type: "number", example: 14.5 },
              },
            },
          },
        },
      },
      ReceivePurchaseOrderItemsInput: {
        type: "object",
        required: ["locationId", "items"],
        properties: {
          locationId: { type: "string", format: "uuid" },
          reference: { type: "string", nullable: true, example: "BOL-98765" },
          notes: { type: "string", nullable: true, example: "Received in good condition" },
          idempotencyKey: { type: "string", nullable: true, example: "rcpt-unique-key" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["productId", "quantity"],
              properties: {
                productId: { type: "string", format: "uuid" },
                quantity: { type: "number", example: 50 },
              },
            },
          },
        },
      },
      SafePurchaseOrderItemDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          productId: { type: "string", format: "uuid" },
          productSku: { type: "string", example: "PROD-SKU-001" },
          productName: { type: "string", example: "Steel Bolt" },
          quantityOrdered: { type: "string", example: "100.0000" },
          quantityReceived: { type: "string", example: "50.0000" },
          quantityOutstanding: { type: "string", example: "50.0000" },
          unitCost: { type: "string", example: "14.5000" },
          lineTotal: { type: "string", example: "1450.0000" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SafePurchaseOrderReceiptDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          purchaseOrderId: { type: "string", format: "uuid" },
          locationId: { type: "string", format: "uuid" },
          locationCode: { type: "string", example: "A-01" },
          locationName: { type: "string", example: "Aisle A Rack 1" },
          reference: { type: "string", nullable: true, example: "BOL-98765" },
          notes: { type: "string", nullable: true, example: "First shipment" },
          receivedByUserId: { type: "string", format: "uuid" },
          receivedByUserName: { type: "string", example: "Alice Johnson" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SafePurchaseOrderDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          supplierId: { type: "string", format: "uuid" },
          supplierName: { type: "string", example: "Acme Supplies Inc." },
          supplierCode: { type: "string", nullable: true, example: "SUP-ACME-01" },
          orderNumber: { type: "string", example: "PO-20261027-ABCD" },
          status: {
            type: "string",
            enum: [
              "DRAFT",
              "PENDING_APPROVAL",
              "APPROVED",
              "PARTIALLY_RECEIVED",
              "RECEIVED",
              "CANCELLED",
            ],
            example: "DRAFT",
          },
          orderDate: { type: "string", format: "date-time" },
          expectedDeliveryDate: { type: "string", format: "date-time", nullable: true },
          currency: { type: "string", example: "USD" },
          subtotal: { type: "string", example: "1450.0000" },
          taxAmount: { type: "string", example: "145.0000" },
          totalAmount: { type: "string", example: "1595.0000" },
          notes: { type: "string", nullable: true, example: "Procurement notes" },
          createdByUserId: { type: "string", format: "uuid" },
          createdByUserEmail: { type: "string", format: "email", example: "buyer@stockpilot.io" },
          approvedByUserId: { type: "string", format: "uuid", nullable: true },
          approvedByUserEmail: {
            type: "string",
            format: "email",
            nullable: true,
            example: "admin@stockpilot.io",
          },
          approvedAt: { type: "string", format: "date-time", nullable: true },
          cancelledAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/SafePurchaseOrderItemDto" },
          },
          receipts: {
            type: "array",
            items: { $ref: "#/components/schemas/SafePurchaseOrderReceiptDto" },
          },
        },
      },
      PaginatedPurchaseOrdersResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafePurchaseOrderDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 1 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      PaginatedTransactionsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeInventoryTransactionDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  totalItems: { type: "integer", example: 10 },
                  totalPages: { type: "integer", example: 1 },
                  hasNextPage: { type: "boolean", example: false },
                  hasPrevPage: { type: "boolean", example: false },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      SafeNotificationDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid", nullable: true },
          recipientUserId: { type: "string", format: "uuid" },
          type: { type: "string", example: "INFO" },
          title: { type: "string", example: "Low Stock Alert" },
          message: { type: "string", example: "Product steel bolt is low on stock." },
          data: { type: "object", nullable: true },
          readAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedNotificationsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              notifications: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeNotificationDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  total: { type: "integer", example: 1 },
                  totalPages: { type: "integer", example: 1 },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      UnreadCountResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              count: { type: "integer", example: 3 },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      BulkReadResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              updatedCount: { type: "integer", example: 5 },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      SafeAuditLogDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid", nullable: true },
          actorUserId: { type: "string", format: "uuid", nullable: true },
          actor: {
            type: "object",
            nullable: true,
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              email: { type: "string" },
            },
          },
          action: { type: "string", example: "inventory.received" },
          resourceType: { type: "string", example: "InventoryTransaction" },
          resourceId: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true },
          requestId: { type: "string", nullable: true },
          ipAddress: { type: "string", nullable: true },
          userAgent: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedAuditLogsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              auditLogs: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeAuditLogDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  total: { type: "integer", example: 10 },
                  totalPages: { type: "integer", example: 1 },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateDemandForecastInput: {
        type: "object",
        properties: {
          productId: { type: "string", format: "uuid", description: "Optional single product ID" },
          productIds: {
            type: "array",
            items: { type: "string", format: "uuid" },
            description: "Optional array of product IDs to forecast",
          },
          horizonDays: { type: "integer", minimum: 1, maximum: 90, default: 14 },
          lookbackDays: { type: "integer", minimum: 14, maximum: 365, default: 30 },
          granularity: { type: "string", enum: ["DAILY"], default: "DAILY" },
        },
      },
      SafeDemandForecastPointDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          forecastRunId: { type: "string", format: "uuid" },
          productId: { type: "string", format: "uuid" },
          productName: { type: "string", example: "Alpha Industrial Widget" },
          productSku: { type: "string", example: "WGT-ALPHA" },
          periodStart: { type: "string", format: "date-time" },
          periodEnd: { type: "string", format: "date-time" },
          predictedDemand: { type: "string", example: "12.5000" },
          lowerBound: { type: "string", nullable: true, example: "9.2000" },
          upperBound: { type: "string", nullable: true, example: "15.8000" },
          unitOfMeasure: { type: "string", example: "PIECE" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SafeDemandForecastRunDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "INSUFFICIENT_HISTORY"],
            example: "COMPLETED",
          },
          modelName: { type: "string", example: "WeightedMovingAverage-DoW" },
          modelVersion: { type: "string", example: "1.0.0" },
          horizonDays: { type: "integer", example: 14 },
          lookbackDays: { type: "integer", example: 30 },
          granularity: { type: "string", example: "DAILY" },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          initiatedByUserId: { type: "string", format: "uuid", nullable: true },
          errorCode: { type: "string", nullable: true },
          errorMessage: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DemandForecastRunDetailResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            allOf: [
              { $ref: "#/components/schemas/SafeDemandForecastRunDto" },
              {
                type: "object",
                properties: {
                  points: {
                    type: "array",
                    items: { $ref: "#/components/schemas/SafeDemandForecastPointDto" },
                  },
                  totalPoints: { type: "integer", example: 14 },
                  productCount: { type: "integer", example: 1 },
                  evaluation: { type: "object", nullable: true },
                },
              },
            ],
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      PaginatedForecastRunsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              runs: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeDemandForecastRunDto" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  total: { type: "integer", example: 5 },
                  totalPages: { type: "integer", example: 1 },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      DemandForecastEvaluationResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              forecastRunId: { type: "string", format: "uuid" },
              modelName: { type: "string", example: "WeightedMovingAverage-DoW" },
              modelVersion: { type: "string", example: "1.0.0" },
              evaluationWindow: {
                type: "object",
                properties: {
                  startDate: { type: "string", example: "2026-10-01" },
                  endDate: { type: "string", example: "2026-10-07" },
                  periods: { type: "integer", example: 7 },
                },
              },
              aggregateMetrics: {
                type: "object",
                properties: {
                  mae: { type: "number", example: 1.25 },
                  rmse: { type: "number", example: 1.85 },
                  wape: { type: "number", example: 0.12 },
                },
              },
              productEvaluations: {
                type: "array",
                items: { type: "object" },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      TriggerAnomalyDetectionInput: {
        type: "object",
        properties: {
          windowDays: { type: "integer", minimum: 1, maximum: 90, default: 30, example: 30 },
          productId: { type: "string", format: "uuid" },
          warehouseId: { type: "string", format: "uuid" },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "UNUSUALLY_LARGE_MOVEMENT",
                "UNUSUAL_ADJUSTMENT",
                "REPEATED_ADJUSTMENTS",
                "UNUSUAL_TRANSFER_PATTERN",
              ],
            },
          },
          minSeverity: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          },
        },
      },
      UpdateAnomalyStatusInput: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
            example: "RESOLVED",
          },
          resolutionNote: {
            type: "string",
            maxLength: 1000,
            example: "Physical inventory recount performed. Stock count confirmed.",
          },
        },
      },
      SafeInventoryAnomaly: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          category: { type: "string", example: "UNUSUALLY_LARGE_MOVEMENT" },
          severity: { type: "string", example: "HIGH" },
          status: { type: "string", example: "OPEN" },
          productId: { type: "string", format: "uuid", nullable: true },
          product: {
            type: "object",
            nullable: true,
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              sku: { type: "string" },
            },
          },
          warehouseId: { type: "string", format: "uuid", nullable: true },
          locationId: { type: "string", format: "uuid", nullable: true },
          transactionId: { type: "string", format: "uuid", nullable: true },
          strategyName: { type: "string", example: "UNUSUALLY_LARGE_MOVEMENT" },
          strategyVersion: { type: "string", example: "1.0.0" },
          score: { type: "string", example: "4.5000", nullable: true },
          explanation: { type: "string" },
          evidence: { type: "object" },
          dedupKey: { type: "string" },
          detectionWindowStart: { type: "string", format: "date-time" },
          detectionWindowEnd: { type: "string", format: "date-time" },
          detectedAt: { type: "string", format: "date-time" },
          acknowledgedAt: { type: "string", format: "date-time", nullable: true },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
          resolutionNote: { type: "string", nullable: true },
          dismissedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SafeAnomalyDetectionRun: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          status: { type: "string", example: "COMPLETED" },
          windowDays: { type: "integer", example: 30 },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          findingsCount: { type: "integer", example: 2 },
          summary: { type: "object", nullable: true },
          errorCode: { type: "string", nullable: true },
          errorMessage: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      InventoryAnomalyResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { $ref: "#/components/schemas/SafeInventoryAnomaly" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      AnomalyDetectionRunDetailResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            allOf: [
              { $ref: "#/components/schemas/SafeAnomalyDetectionRun" },
              {
                type: "object",
                properties: {
                  findings: {
                    type: "array",
                    items: { $ref: "#/components/schemas/SafeInventoryAnomaly" },
                  },
                },
              },
            ],
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      PaginatedAnomaliesResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              anomalies: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeInventoryAnomaly" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  total: { type: "integer", example: 5 },
                  totalPages: { type: "integer", example: 1 },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      PaginatedDetectionRunsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              runs: {
                type: "array",
                items: { $ref: "#/components/schemas/SafeAnomalyDetectionRun" },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "integer", example: 1 },
                  limit: { type: "integer", example: 20 },
                  total: { type: "integer", example: 3 },
                  totalPages: { type: "integer", example: 1 },
                },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

export const swaggerUiOptions: SwaggerUiOptions = {
  customSiteTitle: "StockPilot AI — API Documentation",
  customCss: ".swagger-ui .topbar { display: none }",
};
