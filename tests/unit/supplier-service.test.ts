import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { SupplierService } from "../../src/modules/procurement/suppliers/supplier.service";
import { NotFoundError, ConflictError } from "../../src/common/errors/http-errors";

describe("SupplierService (Unit)", () => {
  let mockPrisma: {
    supplier: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  let service: SupplierService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const supplierId = "sup-uuid-222";

  const sampleSupplier = {
    id: supplierId,
    organizationId: orgId,
    name: "Acme Supplies Inc.",
    code: "SUP-ACME-01",
    email: "contact@acme.com",
    phone: "+1-555-0199",
    contactPerson: "Jane Doe",
    address: "100 Industrial Parkway",
    taxIdentifier: "US-987654321",
    notes: "Primary raw materials supplier",
    isActive: true,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  beforeEach(() => {
    mockPrisma = {
      supplier: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
    };

    service = new SupplierService(mockPrisma as unknown as PrismaClient);
  });

  describe("createSupplier", () => {
    it("should successfully create a supplier with normalized uppercase code", async () => {
      mockPrisma.supplier.findUnique.mockResolvedValueOnce(null);
      mockPrisma.supplier.create.mockResolvedValueOnce(sampleSupplier);

      const result = await service.createSupplier(orgId, {
        name: " Acme Supplies Inc. ",
        code: " sup-acme-01 ",
        email: " CONTACT@ACME.COM ",
        phone: " +1-555-0199 ",
        contactPerson: " Jane Doe ",
        address: " 100 Industrial Parkway ",
        taxIdentifier: " US-987654321 ",
        notes: " Primary raw materials supplier ",
        isActive: true,
      });

      expect(mockPrisma.supplier.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_code: {
            organizationId: orgId,
            code: "SUP-ACME-01",
          },
        },
      });

      expect(mockPrisma.supplier.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          name: "Acme Supplies Inc.",
          code: "SUP-ACME-01",
          email: "contact@acme.com",
          phone: "+1-555-0199",
          contactPerson: "Jane Doe",
          address: "100 Industrial Parkway",
          taxIdentifier: "US-987654321",
          notes: "Primary raw materials supplier",
          isActive: true,
        },
      });

      expect(result.id).toBe(supplierId);
      expect(result.code).toBe("SUP-ACME-01");
      expect(result.name).toBe("Acme Supplies Inc.");
      expect(result.isActive).toBe(true);
    });

    it("should allow creating a supplier without code", async () => {
      const supplierWithoutCode = {
        ...sampleSupplier,
        code: null,
      };

      mockPrisma.supplier.create.mockResolvedValueOnce(supplierWithoutCode);

      const result = await service.createSupplier(orgId, {
        name: "No Code Vendor",
        isActive: true,
      });

      expect(mockPrisma.supplier.findUnique).not.toHaveBeenCalled();
      expect(result.code).toBeNull();
      expect(result.name).toBe("Acme Supplies Inc.");
    });

    it("should throw ConflictError if supplier code already exists in organization", async () => {
      mockPrisma.supplier.findUnique.mockResolvedValueOnce(sampleSupplier);

      await expect(
        service.createSupplier(orgId, {
          name: "Another Acme",
          code: "sup-acme-01",
          isActive: true,
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.supplier.create).not.toHaveBeenCalled();
    });
  });

  describe("getSupplierById", () => {
    it("should return supplier DTO when found in tenant organization", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);

      const result = await service.getSupplierById(orgId, supplierId);

      expect(mockPrisma.supplier.findFirst).toHaveBeenCalledWith({
        where: {
          id: supplierId,
          organizationId: orgId,
        },
      });

      expect(result.id).toBe(supplierId);
      expect(result.name).toBe("Acme Supplies Inc.");
    });

    it("should throw NotFoundError if supplier belongs to another organization (anti-IDOR)", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);

      await expect(service.getSupplierById(otherOrgId, supplierId)).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError if supplier ID does not exist", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);

      await expect(service.getSupplierById(orgId, "non-existent-id")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("listSuppliers", () => {
    it("should return paginated list of suppliers with status and search filters", async () => {
      mockPrisma.supplier.count.mockResolvedValueOnce(1);
      mockPrisma.supplier.findMany.mockResolvedValueOnce([sampleSupplier]);

      const result = await service.listSuppliers(orgId, {
        page: 1,
        limit: 10,
        search: "Acme",
        isActive: true,
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(mockPrisma.supplier.count).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          isActive: true,
          OR: [
            { name: { contains: "Acme", mode: "insensitive" } },
            { code: { contains: "Acme", mode: "insensitive" } },
            { email: { contains: "Acme", mode: "insensitive" } },
            { contactPerson: { contains: "Acme", mode: "insensitive" } },
          ],
        },
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.page).toBe(1);
    });
  });

  describe("updateSupplier", () => {
    it("should successfully update supplier details and normalize code", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);
      mockPrisma.supplier.findUnique.mockResolvedValueOnce(null);
      mockPrisma.supplier.update.mockResolvedValueOnce({
        ...sampleSupplier,
        name: "Acme Global Logistics",
        code: "SUP-ACME-NEW",
      });

      const result = await service.updateSupplier(orgId, supplierId, {
        name: " Acme Global Logistics ",
        code: " sup-acme-new ",
      });

      expect(mockPrisma.supplier.update).toHaveBeenCalledWith({
        where: { id: supplierId },
        data: expect.objectContaining({
          name: "Acme Global Logistics",
          code: "SUP-ACME-NEW",
        }),
      });

      expect(result.name).toBe("Acme Global Logistics");
      expect(result.code).toBe("SUP-ACME-NEW");
    });

    it("should throw ConflictError if new code collides with another supplier in organization", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);
      mockPrisma.supplier.findUnique.mockResolvedValueOnce({
        ...sampleSupplier,
        id: "different-supplier-id",
        code: "SUP-OTHER",
      });

      await expect(
        service.updateSupplier(orgId, supplierId, {
          code: "SUP-OTHER",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.supplier.update).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError if supplier does not belong to organization", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateSupplier(otherOrgId, supplierId, {
          name: "Hacked Supplier",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deactivateSupplier", () => {
    it("should set isActive to false for soft deactivation", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);
      mockPrisma.supplier.update.mockResolvedValueOnce({
        ...sampleSupplier,
        isActive: false,
      });

      const result = await service.deactivateSupplier(orgId, supplierId);

      expect(mockPrisma.supplier.update).toHaveBeenCalledWith({
        where: { id: supplierId },
        data: { isActive: false },
      });

      expect(result.isActive).toBe(false);
    });

    it("should throw NotFoundError when deactivating non-existent supplier", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);

      await expect(service.deactivateSupplier(orgId, "missing-id")).rejects.toThrow(NotFoundError);
    });
  });
});
