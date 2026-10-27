import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError } from "../../../common/errors/http-errors";
import { logger } from "../../../infrastructure/logging/logger";
import { AuditService } from "../../audit/audit.service";
import { AuditAction, AuditResourceType } from "../../audit/audit.types";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ListCategoriesQuery,
} from "./category.schema";
import {
  toSafeCategory,
  type SafeProductCategoryDto,
  type PaginatedCategoriesResult,
} from "./category.types";

/**
 * Service orchestrating product category catalog domain logic with strict tenant isolation.
 */
export class CategoryService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient = prisma,
    audit?: AuditService,
  ) {
    this.audit = audit ?? new AuditService(this.db);
  }

  /**
   * Creates a new product category within the specified organization tenant.
   * Enforces case-insensitive category name uniqueness per organization.
   */
  public async createCategory(
    organizationId: string,
    input: CreateCategoryInput,
  ): Promise<SafeProductCategoryDto> {
    const trimmedName = input.name.trim();

    const existing = await this.db.productCategory.findFirst({
      where: {
        organizationId,
        name: { equals: trimmedName, mode: "insensitive" },
      },
    });

    if (existing) {
      throw new ConflictError(
        `A category with name '${trimmedName}' already exists in this organization.`,
      );
    }

    const category = await this.db.productCategory.create({
      data: {
        organizationId,
        name: trimmedName,
        description: input.description?.trim() || null,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    logger.info({ organizationId, categoryId: category.id, name: trimmedName }, "Category created");

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.CATEGORY_CREATED,
      resourceType: AuditResourceType.PRODUCT_CATEGORY,
      resourceId: category.id,
      metadata: { name: trimmedName },
    });

    return toSafeCategory(category);
  }

  /**
   * Retrieves a single product category by ID scoped strictly to the organization.
   */
  public async getCategoryById(
    organizationId: string,
    categoryId: string,
  ): Promise<SafeProductCategoryDto> {
    const category = await this.db.productCategory.findFirst({
      where: {
        id: categoryId,
        organizationId,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundError("Category not found.");
    }

    return toSafeCategory(category);
  }

  /**
   * Retrieves a paginated list of product categories with optional search filtering.
   */
  public async listCategories(
    organizationId: string,
    query: ListCategoriesQuery,
  ): Promise<PaginatedCategoriesResult> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(search
        ? {
            name: {
              contains: search.trim(),
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    const [totalItems, categories] = await Promise.all([
      this.db.productCategory.count({ where }),
      this.db.productCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          _count: {
            select: { products: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: categories.map(toSafeCategory),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Partially updates a product category within the specified organization tenant.
   * If name is updated, enforces tenant-scoped uniqueness against other categories.
   */
  public async updateCategory(
    organizationId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<SafeProductCategoryDto> {
    const existing = await this.db.productCategory.findFirst({
      where: {
        id: categoryId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Category not found.");
    }

    let trimmedName: string | undefined;
    if (input.name !== undefined) {
      trimmedName = input.name.trim();

      const duplicate = await this.db.productCategory.findFirst({
        where: {
          organizationId,
          name: { equals: trimmedName, mode: "insensitive" },
          NOT: { id: categoryId },
        },
      });

      if (duplicate) {
        throw new ConflictError(
          `A category with name '${trimmedName}' already exists in this organization.`,
        );
      }
    }

    const updated = await this.db.productCategory.update({
      where: { id: categoryId },
      data: {
        ...(trimmedName !== undefined && { name: trimmedName }),
        ...(input.description !== undefined && {
          description: input.description === null ? null : input.description.trim(),
        }),
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    logger.info({ organizationId, categoryId }, "Category updated");

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.CATEGORY_UPDATED,
      resourceType: AuditResourceType.PRODUCT_CATEGORY,
      resourceId: updated.id,
      metadata: { name: updated.name },
    });

    return toSafeCategory(updated);
  }

  /**
   * Safely deletes a category.
   * Rejects deletion if one or more products reference this category (HTTP 409 Conflict).
   */
  public async deleteCategory(
    organizationId: string,
    categoryId: string,
  ): Promise<{ message: string; id: string }> {
    const existing = await this.db.productCategory.findFirst({
      where: {
        id: categoryId,
        organizationId,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Category not found.");
    }

    if (existing._count.products > 0) {
      throw new ConflictError(
        "Cannot delete category because it is currently assigned to one or more products. Reassign or remove products first.",
      );
    }

    await this.db.productCategory.delete({
      where: { id: categoryId },
    });

    logger.info({ organizationId, categoryId }, "Category deleted");
    return {
      message: "Category deleted successfully.",
      id: categoryId,
    };
  }
}

export const categoryService = new CategoryService();
