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
      "Production-ready modular monolith backend for StockPilot AI SaaS platform. Features secure multi-tenant foundation, dual-token rotation authentication with HttpOnly cookies, system telemetry, and container probes.",
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
                description: "HttpOnly, SameSite cookie containing rotating refresh token",
                schema: {
                  type: "string",
                  example:
                    "stockpilot_refresh_token=...; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
                },
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
        summary: "Log in with credentials",
        description:
          "Verifies user credentials with constant-time protection, establishes an authenticated session, sets an HttpOnly refresh token cookie, and returns an access token.",
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
                description: "HttpOnly, SameSite cookie containing rotating refresh token",
                schema: {
                  type: "string",
                  example:
                    "stockpilot_refresh_token=...; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
                },
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
            description: "Unauthorized: Invalid credentials or inactive account",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "422": {
            description: "Validation error: Invalid email or password structure",
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
        summary: "Rotate session tokens",
        description:
          "Rotates the presenting refresh token, checks for reuse (revoking entire family if compromise detected), and issues a fresh access token and replacement refresh token cookie.",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RefreshInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session rotated successfully",
            headers: {
              "Set-Cookie": {
                description: "Updated HttpOnly refresh token cookie",
                schema: {
                  type: "string",
                },
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
          "Creates a new organization and atomically establishes the caller as OWNER in a transaction.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateOrganizationInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Organization and owner membership created successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateOrganizationResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "422": {
            description: "Validation error",
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
      get: {
        tags: ["Organizations"],
        summary: "List user organizations",
        description: "Returns paginated list of organizations the authenticated user belongs to.",
        security: [{ bearerAuth: [] }],
        parameters: [
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
        ],
        responses: {
          "200": {
            description: "Organizations retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ListOrganizationsResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
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
    "/api/v1/organizations/{organizationId}": {
      get: {
        tags: ["Organizations"],
        summary: "Get organization details",
        description:
          "Returns organization details and the caller's role. Restricted to active members.",
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
            description: "Organization details retrieved",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateOrganizationResponse",
                },
              },
            },
          },
          "404": {
            description: "Organization not found (or access denied)",
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
      patch: {
        tags: ["Organizations"],
        summary: "Update organization details",
        description: "Updates organization name and regenerates slug. Restricted to OWNER role.",
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
              schema: {
                $ref: "#/components/schemas/UpdateOrganizationInput",
              },
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
                    data: {
                      type: "object",
                      properties: {
                        organization: { $ref: "#/components/schemas/SafeOrganizationDto" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": {
            description: "Forbidden: Caller is not an organization owner",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Organization not found",
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
      delete: {
        tags: ["Organizations"],
        summary: "Deactivate organization",
        description:
          "Safely deactivates an organization. Restricted to OWNER role. Preserves data integrity.",
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
                        organizationId: { type: "string", format: "uuid" },
                      },
                    },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": {
            description: "Forbidden: Caller is not an organization owner",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Organization not found",
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
    "/health/live": {
      get: {
        tags: ["Health Probes"],
        summary: "Liveness probe",
        description:
          "Fast sub-millisecond process liveness check for container orchestrators (Kubernetes, AWS ECS, GCP).",
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
    "/health/ready": {
      get: {
        tags: ["Health Probes"],
        summary: "Readiness probe",
        description:
          "Dependency readiness check verifying database connectivity. Returns 503 if dependencies fail.",
        responses: {
          "200": {
            description: "Dependencies ready to accept traffic",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        status: { type: "string", example: "ready" },
                        isReady: { type: "boolean", example: true },
                        dependencies: {
                          type: "object",
                          properties: {
                            database: {
                              type: "object",
                              properties: {
                                isHealthy: { type: "boolean", example: true },
                                latencyMs: { type: "number", example: 4 },
                              },
                            },
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
          "503": {
            description: "Service unavailable: One or more dependencies unreachable",
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
    "/health": {
      get: {
        tags: ["Health Probes"],
        summary: "System health and telemetry",
        description:
          "Returns comprehensive system telemetry including Node runtime, memory usage, and uptime.",
        responses: {
          "200": {
            description: "Telemetry payload",
          },
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
        description: "Standard JWT access token issued at login/register/refresh",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "stockpilot_refresh_token",
        description: "Rotating session refresh token stored in HttpOnly cookie",
      },
    },
    schemas: {
      SafeUserDto: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid", example: "c1f7b029-798c-4a35-866f-427902d18408" },
          name: { type: "string", example: "Alex Mercer" },
          email: { type: "string", format: "email", example: "alex@example.com" },
          status: { type: "string", example: "ACTIVE" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      RegisterInput: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100, example: "Alex Mercer" },
          email: { type: "string", format: "email", example: "alex@example.com" },
          password: { type: "string", minLength: 8, maxLength: 128, example: "StrongPassword123!" },
        },
      },
      LoginInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "alex@example.com" },
          password: { type: "string", example: "StrongPassword123!" },
        },
      },
      RefreshInput: {
        type: "object",
        properties: {
          refreshToken: {
            type: "string",
            description: "Optional fallback refresh token when not using cookies",
          },
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
              accessToken: {
                type: "string",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              },
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
              role: { type: "string", enum: ["OWNER", "MEMBER"], example: "OWNER" },
            },
          },
        ],
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
      CreateOrganizationResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              organization: { $ref: "#/components/schemas/SafeOrganizationDto" },
              role: { type: "string", enum: ["OWNER", "MEMBER"], example: "OWNER" },
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
    },
  },
};

export const swaggerUiOptions: SwaggerUiOptions = {
  customSiteTitle: "StockPilot AI — API Documentation",
  customCss: ".swagger-ui .topbar { display: none }",
};
