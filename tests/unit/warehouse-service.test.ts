import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { WarehouseService } from "../../src/modules/warehouses/warehouses/warehouse.service";
import { WarehouseStatus } from "../../src/modules/warehouses/warehouses/warehouse.types";
import { LocationStatus } from "../../src/modules/warehouses/locations/location.types";
import { NotFoundError, ConflictError } from "../../src/common/errors/http-errors";

describe("WarehouseService (Unit)", () => {
  let mockPrisma: {
    warehouse: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    storageLocation: {
      updateMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  let service: WarehouseService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const warehouseId = "wh-uuid-222";

  const sampleWarehouse = {
    id: warehouseId,
    organizationId: orgId,
    code: "WH-NYC-01",
    name: "New York Hub",
    description: "Main logistics center",
    addressLine1: "123 Logistics Way",
    addressLine2: null,
    city: "Brooklyn",
    state: "NY",
    postalCode: "11201",
    country: "USA",
    status: WarehouseStatus.ACTIVE,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    _count: { locations: 5 },
  };

  beforeEach(() => {
    mockPrisma = {
      warehouse: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      storageLocation: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((promises) => Promise.all(promises)),
    };

    service = new WarehouseService(mockPrisma as unknown as PrismaClient);
  });

  describe("createWarehouse", () => {
    it("should successfully create a warehouse with normalized uppercase code", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);
      mockPrisma.warehouse.create.mockResolvedValueOnce(sampleWarehouse);

      const result = await service.createWarehouse(orgId, {
        code: "  wh-nyc-01  ",
        name: "  New York Hub  ",
        description: " Main logistics center ",
        city: "Brooklyn",
      });

      expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          code: "WH-NYC-01",
        },
      });

      expect(mockPrisma.warehouse.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            code: "WH-NYC-01",
            name: "New York Hub",
            status: WarehouseStatus.ACTIVE,
          }),
        }),
      );

      expect(result.id).toBe(warehouseId);
      expect(result.code).toBe("WH-NYC-01");
    });

    it("should throw ConflictError if warehouse code already exists in organization", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(sampleWarehouse);

      await expect(
        service.createWarehouse(orgId, {
          code: "WH-NYC-01",
          name: "Duplicate Hub",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.warehouse.create).not.toHaveBeenCalled();
    });
  });

  describe("getWarehouseById", () => {
    it("should return warehouse details when found in organization context", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(sampleWarehouse);

      const result = await service.getWarehouseById(orgId, warehouseId);

      expect(result.id).toBe(warehouseId);
      expect(result.locationCount).toBe(5);
      expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: {
          id: warehouseId,
          organizationId: orgId,
        },
        include: {
          _count: { select: { locations: true } },
        },
      });
    });

    it("should throw NotFoundError when warehouse belongs to another organization (anti-IDOR)", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);

      await expect(service.getWarehouseById(otherOrgId, warehouseId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("listWarehouses", () => {
    it("should return paginated warehouses with search and status filtering", async () => {
      mockPrisma.warehouse.count.mockResolvedValueOnce(1);
      mockPrisma.warehouse.findMany.mockResolvedValueOnce([sampleWarehouse]);

      const result = await service.listWarehouses(orgId, {
        page: 1,
        limit: 10,
        search: "NYC",
        status: "ACTIVE",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            status: WarehouseStatus.ACTIVE,
          }),
        }),
      );
    });
  });

  describe("updateWarehouse", () => {
    it("should update warehouse details cleanly", async () => {
      mockPrisma.warehouse.findFirst
        .mockResolvedValueOnce(sampleWarehouse) // existing check
        .mockResolvedValueOnce(null); // uniqueness check

      mockPrisma.warehouse.update.mockResolvedValueOnce({
        ...sampleWarehouse,
        name: "New York Superhub",
      });

      const result = await service.updateWarehouse(orgId, warehouseId, {
        name: "New York Superhub",
      });

      expect(result.name).toBe("New York Superhub");
      expect(mockPrisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: warehouseId },
          data: expect.objectContaining({ name: "New York Superhub" }),
        }),
      );
    });

    it("should throw ConflictError if updated code collides with another warehouse in same org", async () => {
      mockPrisma.warehouse.findFirst
        .mockResolvedValueOnce(sampleWarehouse)
        .mockResolvedValueOnce({ id: "other-wh", code: "COLLIDING-CODE" });

      await expect(
        service.updateWarehouse(orgId, warehouseId, {
          code: "COLLIDING-CODE",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.warehouse.update).not.toHaveBeenCalled();
    });

    it("should cascade deactivation to child locations when status is set to INACTIVE", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(sampleWarehouse);

      mockPrisma.storageLocation.updateMany.mockResolvedValueOnce({ count: 5 });
      mockPrisma.warehouse.update.mockResolvedValueOnce({
        ...sampleWarehouse,
        status: WarehouseStatus.INACTIVE,
      });

      const result = await service.updateWarehouse(orgId, warehouseId, {
        status: WarehouseStatus.INACTIVE,
      });

      expect(result.status).toBe(WarehouseStatus.INACTIVE);
      expect(mockPrisma.storageLocation.updateMany).toHaveBeenCalledWith({
        where: {
          warehouseId,
          organizationId: orgId,
          status: LocationStatus.ACTIVE,
        },
        data: {
          status: LocationStatus.INACTIVE,
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("deactivateWarehouse", () => {
    it("should atomically deactivate warehouse and cascade deactivation to locations", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(sampleWarehouse);

      mockPrisma.storageLocation.updateMany.mockResolvedValueOnce({ count: 5 });
      mockPrisma.warehouse.update.mockResolvedValueOnce({
        ...sampleWarehouse,
        status: WarehouseStatus.INACTIVE,
      });

      const result = await service.deactivateWarehouse(orgId, warehouseId);

      expect(result.status).toBe(WarehouseStatus.INACTIVE);
      expect(mockPrisma.storageLocation.updateMany).toHaveBeenCalledWith({
        where: {
          warehouseId,
          organizationId: orgId,
          status: LocationStatus.ACTIVE,
        },
        data: {
          status: LocationStatus.INACTIVE,
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should throw NotFoundError if warehouse to deactivate does not exist", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);

      await expect(service.deactivateWarehouse(orgId, warehouseId)).rejects.toThrow(NotFoundError);
      expect(mockPrisma.warehouse.update).not.toHaveBeenCalled();
    });
  });
});
