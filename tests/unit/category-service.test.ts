import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CategoryService } from "../../src/modules/products/categories/category.service";
import { NotFoundError, ConflictError } from "../../src/common/errors/http-errors";

describe("CategoryService (Unit)", () => {
  let mockPrisma: {
    productCategory: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  let service: CategoryService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const categoryId = "cat-uuid-222";

  const sampleCategory = {
    id: categoryId,
    organizationId: orgId,
    name: "Industrial Electronics",
    description: "Electronic components and circuit boards",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    _count: { products: 0 },
  };

  beforeEach(() => {
    mockPrisma = {
      productCategory: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    service = new CategoryService(mockPrisma as unknown as PrismaClient);
  });

  describe("createCategory", () => {
    it("should successfully create category when name is unique in organization", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(null);
      mockPrisma.productCategory.create.mockResolvedValueOnce(sampleCategory);

      const result = await service.createCategory(orgId, {
        name: "  Industrial Electronics  ",
        description: " Electronic components and circuit boards ",
      });

      expect(mockPrisma.productCategory.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          name: { equals: "Industrial Electronics", mode: "insensitive" },
        },
      });

      expect(mockPrisma.productCategory.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          name: "Industrial Electronics",
          description: "Electronic components and circuit boards",
        },
        include: {
          _count: { select: { products: true } },
        },
      });

      expect(result.id).toBe(categoryId);
      expect(result.name).toBe("Industrial Electronics");
    });

    it("should throw ConflictError if category name already exists in same organization", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(sampleCategory);

      await expect(
        service.createCategory(orgId, {
          name: "Industrial Electronics",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.productCategory.create).not.toHaveBeenCalled();
    });
  });

  describe("getCategoryById", () => {
    it("should return category when found in the specified organization", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(sampleCategory);

      const result = await service.getCategoryById(orgId, categoryId);

      expect(result.id).toBe(categoryId);
      expect(result.productCount).toBe(0);
      expect(mockPrisma.productCategory.findFirst).toHaveBeenCalledWith({
        where: {
          id: categoryId,
          organizationId: orgId,
        },
        include: {
          _count: { select: { products: true } },
        },
      });
    });

    it("should throw NotFoundError when category belongs to another organization (anti-IDOR)", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(null);

      await expect(service.getCategoryById(otherOrgId, categoryId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("listCategories", () => {
    it("should return paginated categories with metadata", async () => {
      mockPrisma.productCategory.count.mockResolvedValueOnce(1);
      mockPrisma.productCategory.findMany.mockResolvedValueOnce([sampleCategory]);

      const result = await service.listCategories(orgId, {
        page: 1,
        limit: 10,
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it("should apply search filtering across names", async () => {
      mockPrisma.productCategory.count.mockResolvedValueOnce(1);
      mockPrisma.productCategory.findMany.mockResolvedValueOnce([sampleCategory]);

      await service.listCategories(orgId, {
        page: 1,
        limit: 10,
        search: "Electronic",
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(mockPrisma.productCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: orgId,
            name: {
              contains: "Electronic",
              mode: "insensitive",
            },
          },
        }),
      );
    });
  });

  describe("updateCategory", () => {
    it("should successfully update category fields", async () => {
      mockPrisma.productCategory.findFirst
        .mockResolvedValueOnce(sampleCategory) // existing category check
        .mockResolvedValueOnce(null); // uniqueness check

      mockPrisma.productCategory.update.mockResolvedValueOnce({
        ...sampleCategory,
        name: "Renewable Energy",
      });

      const result = await service.updateCategory(orgId, categoryId, {
        name: "Renewable Energy",
      });

      expect(result.name).toBe("Renewable Energy");
      expect(mockPrisma.productCategory.update).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: { name: "Renewable Energy" },
        include: { _count: { select: { products: true } } },
      });
    });

    it("should throw ConflictError if updated name collides with another category", async () => {
      mockPrisma.productCategory.findFirst
        .mockResolvedValueOnce(sampleCategory)
        .mockResolvedValueOnce({ id: "other-cat-id", name: "Colliding Category" });

      await expect(
        service.updateCategory(orgId, categoryId, {
          name: "Colliding Category",
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockPrisma.productCategory.update).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError if category to update is not found", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateCategory(orgId, categoryId, {
          name: "New Name",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteCategory", () => {
    it("should delete category safely when productCount is 0", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce({
        ...sampleCategory,
        _count: { products: 0 },
      });
      mockPrisma.productCategory.delete.mockResolvedValueOnce(sampleCategory);

      const result = await service.deleteCategory(orgId, categoryId);

      expect(result.id).toBe(categoryId);
      expect(result.message).toContain("successfully");
      expect(mockPrisma.productCategory.delete).toHaveBeenCalledWith({
        where: { id: categoryId },
      });
    });

    it("should throw ConflictError (409) if category is referenced by products", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce({
        ...sampleCategory,
        _count: { products: 5 }, // 5 products assigned!
      });

      await expect(service.deleteCategory(orgId, categoryId)).rejects.toThrow(ConflictError);
      expect(mockPrisma.productCategory.delete).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when category does not exist", async () => {
      mockPrisma.productCategory.findFirst.mockResolvedValueOnce(null);

      await expect(service.deleteCategory(orgId, categoryId)).rejects.toThrow(NotFoundError);
      expect(mockPrisma.productCategory.delete).not.toHaveBeenCalled();
    });
  });
});
