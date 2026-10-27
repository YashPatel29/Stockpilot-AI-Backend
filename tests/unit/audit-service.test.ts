import { describe, it, expect, vi, beforeEach } from "vitest";
import { type PrismaClient } from "@prisma/client";
import { AuditService } from "../../src/modules/audit/audit.service";
import { AuditAction, AuditResourceType } from "../../src/modules/audit/audit.types";
import { sanitizeAuditMetadata } from "../../src/modules/audit/audit.sanitizer";

describe("AuditService & Sanitizer (Unit)", () => {
  describe("sanitizeAuditMetadata", () => {
    it("should recursively redact passwords, tokens, hashes, and secrets", () => {
      const input = {
        name: "Acme Corp",
        user: {
          email: "admin@acme.com",
          password: "super-secret-password",
          apiToken: "tok_1234567890",
          nested: {
            authSecret: "shhh",
            apiKey: "key_xyz",
            normalField: 42,
          },
        },
        items: [
          { sku: "ITEM-1", accessToken: "jwt-token" },
          { sku: "ITEM-2", safeValue: true },
        ],
      };

      const result = sanitizeAuditMetadata(input);

      expect(result).toEqual({
        name: "Acme Corp",
        user: {
          email: "admin@acme.com",
          password: "[REDACTED]",
          apiToken: "[REDACTED]",
          nested: {
            authSecret: "[REDACTED]",
            apiKey: "[REDACTED]",
            normalField: 42,
          },
        },
        items: [
          { sku: "ITEM-1", accessToken: "[REDACTED]" },
          { sku: "ITEM-2", safeValue: true },
        ],
      });
    });

    it("should return null for empty or non-object inputs", () => {
      expect(sanitizeAuditMetadata(null)).toBeNull();
      expect(sanitizeAuditMetadata(undefined)).toBeNull();
    });
  });

  describe("AuditService operations", () => {
    let mockPrisma: {
      auditLog: {
        create: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
    };

    let service: AuditService;

    const orgId = "550e8400-e29b-41d4-a716-446655440010";
    const actorId = "550e8400-e29b-41d4-a716-446655440001";
    const auditId = "550e8400-e29b-41d4-a716-446655440999";

    beforeEach(() => {
      mockPrisma = {
        auditLog: {
          create: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
      };

      service = new AuditService(mockPrisma as unknown as PrismaClient);
    });

    it("should record an audit log with sanitized metadata", async () => {
      const now = new Date();
      mockPrisma.auditLog.create.mockResolvedValueOnce({
        id: auditId,
        organizationId: orgId,
        actorUserId: actorId,
        action: AuditAction.PRODUCT_CREATED,
        resourceType: AuditResourceType.PRODUCT,
        resourceId: "prod-1",
        metadata: { sku: "SKU-001", passwordHash: "[REDACTED]" },
        requestId: "req-123",
        ipAddress: "127.0.0.1",
        userAgent: "Jest/Node",
        createdAt: now,
        actorUser: {
          id: actorId,
          name: "Admin User",
          email: "admin@stockpilot.io",
        },
      });

      const result = await service.recordAudit({
        organizationId: orgId,
        actorUserId: actorId,
        action: AuditAction.PRODUCT_CREATED,
        resourceType: AuditResourceType.PRODUCT,
        resourceId: "prod-1",
        metadata: { sku: "SKU-001", passwordHash: "bcrypt-hash" },
        requestId: "req-123",
        ipAddress: "127.0.0.1",
        userAgent: "Jest/Node",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          actorUserId: actorId,
          action: AuditAction.PRODUCT_CREATED,
          resourceType: AuditResourceType.PRODUCT,
          resourceId: "prod-1",
          metadata: { sku: "SKU-001", passwordHash: "[REDACTED]" },
          requestId: "req-123",
        }),
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      expect(result).toEqual({
        id: auditId,
        organizationId: orgId,
        actorUserId: actorId,
        actor: {
          id: actorId,
          name: "Admin User",
          email: "admin@stockpilot.io",
        },
        action: AuditAction.PRODUCT_CREATED,
        resourceType: AuditResourceType.PRODUCT,
        resourceId: "prod-1",
        metadata: { sku: "SKU-001", passwordHash: "[REDACTED]" },
        requestId: "req-123",
        ipAddress: "127.0.0.1",
        userAgent: "Jest/Node",
        createdAt: now.toISOString(),
      });
    });

    it("should list audit logs with tenant isolation and date range filtering", async () => {
      const now = new Date();
      mockPrisma.auditLog.count.mockResolvedValueOnce(1);
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        {
          id: auditId,
          organizationId: orgId,
          actorUserId: actorId,
          action: AuditAction.INVENTORY_RECEIVED,
          resourceType: AuditResourceType.INVENTORY_TRANSACTION,
          resourceId: "tx-1",
          metadata: { quantity: "100.0000" },
          requestId: "req-456",
          ipAddress: null,
          userAgent: null,
          createdAt: now,
          actorUser: null,
        },
      ]);

      const startDate = new Date("2026-01-01T00:00:00Z");
      const endDate = new Date("2026-12-31T23:59:59Z");

      const result = await service.listAuditLogs(orgId, {
        page: 1,
        limit: 10,
        action: "inventory.received",
        startDate,
        endDate,
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: orgId,
          action: { contains: "inventory.received", mode: "insensitive" },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
      });

      expect(result.auditLogs).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });
});
