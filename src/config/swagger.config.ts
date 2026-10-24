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
    },
  },
};

export const swaggerUiOptions: SwaggerUiOptions = {
  customSiteTitle: "StockPilot AI — API Documentation",
  customCss: ".swagger-ui .topbar { display: none }",
};
