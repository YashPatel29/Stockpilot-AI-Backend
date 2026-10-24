import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { LocationService } from "../../src/modules/warehouses/locations/location.service";
import { WarehouseStatus } from "../../src/modules/warehouses/warehouses/warehouse.types";
import { LocationStatus } from "../../src/modules/warehouses/locations/location.types";
import { NotFoundError, ConflictError, BadRequestError } from "../../src/common/errors/http-errors";

describe("LocationService (Unit)", () => {
  let mockPrisma: {
    storageLocation: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  let service: LocationService;

  const orgId = "org-uuid-111";
  const warehouseId = "wh-uuid-222";
  const locationId = "loc-uuid-333";

  const activeWarehouse = {
    id: warehouseId,
    organizationId: orgId,
    code: "WH-NYC-01",
    name: "New York Hub",
    status: WarehouseStatus.ACTIVE,
  };

  const inactiveWarehouse = {
    ...activeWarehouse,
    status: WarehouseStatus.INACTIVE,
  };

  const sampleLocation = {
    id: locationId,
    organizationId: orgId,
    warehouseId,
    code: "RACK-A-01",
    name: "Aisle A Rack 1",
    description: "Pallet storage",
    type: "RACK",
    status: LocationStatus.ACTIVE,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  beforeEach(() => {
    mockPrisma = {
      storageLocation: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      warehouse: {
        findFirst: vi.fn(),
      },
    };

    service = new LocationService(mockPrisma as unknown as PrismaClient);
  });

  describe("createLocation", () => {
    it("should create location in active warehouse with normalized uppercase code", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(activeWarehouse);
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.storageLocation.create.mockResolvedValueOnce(sampleLocation);

      const result = await service.createLocation(orgId, warehouseId, {
        code: "  rack-a-01  ",
        name: "  Aisle A Rack 1  ",
        description: " Pallet storage ",
        type: "rack",
      });

      expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: { id: warehouseId, organizationId: orgId },
      });

      expect(mockPrisma.storageLocation.findFirst).toHaveBeenCalledWith({
        where: { warehouseId, code: "RACK-A-01" },
      });

      expect(result.id).toBe(locationId);
      expect(result.code).toBe("RACK-A-01");
      expect(result.status).toBe(LocationStatus.ACTIVE);
    });

    it("should reject creation with BadRequestError if parent warehouse is INACTIVE", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(inactiveWarehouse);

      await expect(
        service.createLocation(orgId, warehouseId, {
          code: "RACK-A-01",
          name: "Rack In Inactive Warehouse",
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockPrisma.storageLocation.create).not.toHaveBeenCalled();
    });

    it("should throw ConflictError if location code already exists in warehouse", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(activeWarehouse);
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(sampleLocation);

      await expect(
        service.createLocation(orgId, warehouseId, {
          code: "RACK-A-01",
          name: "Duplicate Rack",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.storageLocation.create).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError if warehouse does not exist or belongs to another tenant", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createLocation(orgId, warehouseId, {
          code: "RACK-A-01",
          name: "Any Rack",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getLocationById", () => {
    it("should return location when found in warehouse and organization", async () => {
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(sampleLocation);

      const result = await service.getLocationById(orgId, warehouseId, locationId);

      expect(result.id).toBe(locationId);
      expect(result.code).toBe("RACK-A-01");
      expect(mockPrisma.storageLocation.findFirst).toHaveBeenCalledWith({
        where: {
          id: locationId,
          warehouseId,
          organizationId: orgId,
        },
      });
    });

    it("should throw NotFoundError if location belongs to another warehouse (anti-IDOR)", async () => {
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(null);

      await expect(service.getLocationById(orgId, "other-wh-uuid", locationId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("listLocations", () => {
    it("should return paginated locations within warehouse", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(activeWarehouse);
      mockPrisma.storageLocation.count.mockResolvedValueOnce(1);
      mockPrisma.storageLocation.findMany.mockResolvedValueOnce([sampleLocation]);

      const result = await service.listLocations(orgId, warehouseId, {
        page: 1,
        limit: 10,
        status: "ACTIVE",
        sortBy: "code",
        sortOrder: "asc",
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(mockPrisma.storageLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            warehouseId,
            status: LocationStatus.ACTIVE,
          }),
        }),
      );
    });
  });

  describe("updateLocation", () => {
    it("should update location fields cleanly", async () => {
      mockPrisma.storageLocation.findFirst
        .mockResolvedValueOnce(sampleLocation) // existing check
        .mockResolvedValueOnce(null); // uniqueness check

      mockPrisma.storageLocation.update.mockResolvedValueOnce({
        ...sampleLocation,
        name: "Updated Rack 1",
      });

      const result = await service.updateLocation(orgId, warehouseId, locationId, {
        name: "Updated Rack 1",
      });

      expect(result.name).toBe("Updated Rack 1");
    });

    it("should reject activating a location if parent warehouse is INACTIVE", async () => {
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce({
        ...sampleLocation,
        status: LocationStatus.INACTIVE,
      });
      mockPrisma.warehouse.findFirst.mockResolvedValueOnce(inactiveWarehouse);

      await expect(
        service.updateLocation(orgId, warehouseId, locationId, {
          status: LocationStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockPrisma.storageLocation.update).not.toHaveBeenCalled();
    });

    it("should throw ConflictError if updated code collides with another location in warehouse", async () => {
      mockPrisma.storageLocation.findFirst
        .mockResolvedValueOnce(sampleLocation)
        .mockResolvedValueOnce({ id: "other-loc", code: "COLLIDING-LOC" });

      await expect(
        service.updateLocation(orgId, warehouseId, locationId, {
          code: "COLLIDING-LOC",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.storageLocation.update).not.toHaveBeenCalled();
    });
  });

  describe("deactivateLocation", () => {
    it("should soft-deactivate storage location by setting status to INACTIVE", async () => {
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(sampleLocation);
      mockPrisma.storageLocation.update.mockResolvedValueOnce({
        ...sampleLocation,
        status: LocationStatus.INACTIVE,
      });

      const result = await service.deactivateLocation(orgId, warehouseId, locationId);

      expect(result.status).toBe(LocationStatus.INACTIVE);
      expect(mockPrisma.storageLocation.update).toHaveBeenCalledWith({
        where: { id: locationId },
        data: { status: LocationStatus.INACTIVE },
      });
    });

    it("should throw NotFoundError if location does not exist", async () => {
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(null);

      await expect(service.deactivateLocation(orgId, warehouseId, locationId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
