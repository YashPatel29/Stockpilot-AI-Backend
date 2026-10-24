import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, ProductStatus, type PrismaClient } from "@prisma/client";
import { ProductService } from "../../src/modules/products/products/product.service";
import { NotFoundError, ConflictError, BadRequestError } from "../../src/common/errors/http-errors";

describe("ProductService (Unit)", () => {
  let mockPrisma: {
    product: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    productCategory: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  let service: ProductService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const productId = "prod-uuid-222";
  const categoryId = "cat-uuid-333";

  const sampleCategory = {
    id: categoryId,
    name: "Industrial Electronics",
  };

  const sampleProduct = {
    id: productId,
    organizationId: orgId,
    categoryId,
    sku: "ELEC-WIDGET-001",
    name: "Smart Sensor Widget",
    description: "Multi-purpose industrial IoT sensor",
    unitOfMeasure: "PCS",
    costPrice: new Prisma.Decimal("45.5000"),
    sellingPrice: new Prisma.Decimal("89.9900"),
    lowStockThreshold: 10,
    status: ProductStatus.ACTIVE,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    category: sampleCategory,
  };

  beforeEach(() => {
    mockPrisma = {
      product: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      productCategory: {
        findFirst: vi.fn(),
      },
    };

    service = new ProductService(mockPrisma as unknown as PrismaClient);
  });

  describe("createProduct", () => {
    it("should successfully create a product with exact decimal monetary precision", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null); // SKU check
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(sampleCategory); // Category check
      mockPrisma.product.create.mockResolvedValueOnce(sampleProduct);

      const result = await service.createProduct(orgId, {
        sku: "elec-widget-001",
        name: "  Smart Sensor Widget  ",
        description: " Multi-purpose industrial IoT sensor ",
        categoryId,
        unitOfMeasure: "pcs",
        costPrice: 45.5,
        sellingPrice: 89.99,
        lowStockThreshold: 10,
      });

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          sku: "ELEC-WIDGET-001",
        },
      });

      expect(mockPrisma.productCategory.findFirst).toHaveBeenCalledWith({
        where: {
          id: categoryId,
          organizationId: orgId,
        },
      });

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            sku: "ELEC-WIDGET-001",
            name: "Smart Sensor Widget",
            costPrice: new Prisma.Decimal(45.5),
            sellingPrice: new Prisma.Decimal(89.99),
            status: ProductStatus.ACTIVE,
          }),
        }),
      );

      expect(result.id).toBe(productId);
      expect(result.sku).toBe("ELEC-WIDGET-001");
      expect(result.costPrice).toBe(45.5);
      expect(result.sellingPrice).toBe(89.99);
      expect(result.category?.name).toBe("Industrial Electronics");
    });

    it("should throw ConflictError if SKU already exists within same organization", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(sampleProduct);

      await expect(
        service.createProduct(orgId, {
          sku: "ELEC-WIDGET-001",
          name: "Duplicate Sensor",
          unitOfMeasure: "PCS",
          costPrice: 10,
          sellingPrice: 20,
          lowStockThreshold: 5,
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it("should reject creation with category belonging to another organization (anti-IDOR)", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(null); // Category not in orgId

      await expect(
        service.createProduct(orgId, {
          sku: "NEW-SKU-999",
          name: "Cross Tenant Product",
          categoryId: "foreign-category-id",
          unitOfMeasure: "PCS",
          costPrice: 10,
          sellingPrice: 20,
          lowStockThreshold: 5,
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe("getProductById", () => {
    it("should return product details when found within organization context", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(sampleProduct);

      const result = await service.getProductById(orgId, productId);

      expect(result.id).toBe(productId);
      expect(result.sku).toBe("ELEC-WIDGET-001");
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: {
          id: productId,
          organizationId: orgId,
        },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      });
    });

    it("should throw NotFoundError when product belongs to another organization", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);

      await expect(service.getProductById(otherOrgId, productId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("listProducts", () => {
    it("should filter by ACTIVE status by default and return paginated products", async () => {
      mockPrisma.product.count.mockResolvedValueOnce(1);
      mockPrisma.product.findMany.mockResolvedValueOnce([sampleProduct]);

      const result = await service.listProducts(orgId, {
        page: 1,
        limit: 10,
        status: "ACTIVE",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            status: ProductStatus.ACTIVE,
          }),
        }),
      );
    });

    it("should support search, category filter, and price range filters", async () => {
      mockPrisma.product.count.mockResolvedValueOnce(1);
      mockPrisma.product.findMany.mockResolvedValueOnce([sampleProduct]);

      await service.listProducts(orgId, {
        page: 1,
        limit: 10,
        search: "widget",
        categoryId,
        status: "ACTIVE",
        minPrice: 50,
        maxPrice: 100,
        sortBy: "sellingPrice",
        sortOrder: "asc",
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            categoryId,
            OR: [
              { name: { contains: "widget", mode: "insensitive" } },
              { sku: { contains: "widget", mode: "insensitive" } },
            ],
            sellingPrice: {
              gte: new Prisma.Decimal(50),
              lte: new Prisma.Decimal(100),
            },
          }),
        }),
      );
    });
  });

  describe("updateProduct", () => {
    it("should update product fields cleanly", async () => {
      mockPrisma.product.findFirst
        .mockResolvedValueOnce(sampleProduct) // existing product
        .mockResolvedValueOnce(null); // SKU uniqueness

      mockPrisma.product.update.mockResolvedValueOnce({
        ...sampleProduct,
        name: "Updated Sensor Widget",
        costPrice: new Prisma.Decimal("48.0000"),
      });

      const result = await service.updateProduct(orgId, productId, {
        name: "Updated Sensor Widget",
        costPrice: 48,
      });

      expect(result.name).toBe("Updated Sensor Widget");
      expect(result.costPrice).toBe(48);
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId },
          data: expect.objectContaining({
            name: "Updated Sensor Widget",
            costPrice: new Prisma.Decimal(48),
          }),
        }),
      );
    });

    it("should throw ConflictError if updated SKU collides with another product", async () => {
      mockPrisma.product.findFirst
        .mockResolvedValueOnce(sampleProduct)
        .mockResolvedValueOnce({ id: "other-prod-id", sku: "COLLIDING-SKU" });

      await expect(
        service.updateProduct(orgId, productId, {
          sku: "COLLIDING-SKU",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it("should throw BadRequestError if updated category belongs to another organization", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(sampleProduct);
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(null); // foreign category

      await expect(
        service.updateProduct(orgId, productId, {
          categoryId: "foreign-category-id",
        }),
      ).rejects.toThrow(BadRequestError);

      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError if product does not exist", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateProduct(orgId, productId, {
          name: "Nonexistent Product",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("archiveProduct", () => {
    it("should soft-archive product by updating status to ARCHIVED", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(sampleProduct);
      mockPrisma.product.update.mockResolvedValueOnce({
        ...sampleProduct,
        status: ProductStatus.ARCHIVED,
      });

      const result = await service.archiveProduct(orgId, productId);

      expect(result.status).toBe(ProductStatus.ARCHIVED);
      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: {
          status: ProductStatus.ARCHIVED,
        },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      });
    });

    it("should throw NotFoundError when attempting to archive nonexistent product", async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce(null);

      await expect(service.archiveProduct(orgId, productId)).rejects.toThrow(NotFoundError);
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });
  });
});
