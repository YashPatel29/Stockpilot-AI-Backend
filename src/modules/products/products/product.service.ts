import { Prisma, ProductStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError, BadRequestError } from "../../../common/errors/http-errors";
import { logger } from "../../../infrastructure/logging/logger";
import type { CreateProductInput, UpdateProductInput, ListProductsQuery } from "./product.schema";
import { toSafeProduct, type SafeProductDto, type PaginatedProductsResult } from "./product.types";

/**
 * Service orchestrating product catalog operations with multi-tenant isolation,
 * exact decimal monetary tracking, and safe soft-archival.
 */
export class ProductService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Creates a new product in the organization tenant.
   * Enforces SKU uniqueness scoped to the tenant, and validates category tenant membership.
   */
  public async createProduct(
    organizationId: string,
    input: CreateProductInput,
  ): Promise<SafeProductDto> {
    const normalizedSku = input.sku.trim().toUpperCase();

    // 1. Verify SKU uniqueness within organization
    const existingSku = await this.db.product.findFirst({
      where: {
        organizationId,
        sku: normalizedSku,
      },
    });

    if (existingSku) {
      throw new ConflictError(
        `A product with SKU '${normalizedSku}' already exists in this organization.`,
      );
    }

    // 2. Validate category tenant isolation if category is provided
    if (input.categoryId) {
      const category = await this.db.productCategory.findFirst({
        where: {
          id: input.categoryId,
          organizationId,
        },
      });

      if (!category) {
        throw new BadRequestError("The specified category does not exist in this organization.");
      }
    }

    // 3. Persist product record with exact decimal monetary precision
    const product = await this.db.product.create({
      data: {
        organizationId,
        sku: normalizedSku,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        categoryId: input.categoryId || null,
        unitOfMeasure: input.unitOfMeasure.trim().toUpperCase(),
        costPrice: new Prisma.Decimal(input.costPrice),
        sellingPrice: new Prisma.Decimal(input.sellingPrice),
        lowStockThreshold: input.lowStockThreshold,
        status: ProductStatus.ACTIVE,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    logger.info(
      { organizationId, productId: product.id, sku: normalizedSku },
      "Product created successfully",
    );
    return toSafeProduct(product);
  }

  /**
   * Retrieves a single product by ID scoped strictly to the organization tenant.
   */
  public async getProductById(organizationId: string, productId: string): Promise<SafeProductDto> {
    const product = await this.db.product.findFirst({
      where: {
        id: productId,
        organizationId,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("Product not found.");
    }

    return toSafeProduct(product);
  }

  /**
   * Lists products with tenant-scoped filtering, search across name/SKU, price range,
   * configurable sorting, and pagination.
   */
  public async listProducts(
    organizationId: string,
    query: ListProductsQuery,
  ): Promise<PaginatedProductsResult> {
    const { page, limit, search, categoryId, status, minPrice, maxPrice, sortBy, sortOrder } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(status !== "ALL" && { status: status as ProductStatus }),
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search.trim(), mode: "insensitive" } },
          { sku: { contains: search.trim(), mode: "insensitive" } },
        ],
      }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        sellingPrice: {
          ...(minPrice !== undefined && { gte: new Prisma.Decimal(minPrice) }),
          ...(maxPrice !== undefined && { lte: new Prisma.Decimal(maxPrice) }),
        },
      }),
    };

    const [totalItems, products] = await Promise.all([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: products.map(toSafeProduct),
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
   * Partially updates a product record within the specified organization tenant.
   */
  public async updateProduct(
    organizationId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<SafeProductDto> {
    const existing = await this.db.product.findFirst({
      where: {
        id: productId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Product not found.");
    }

    let normalizedSku: string | undefined;
    if (input.sku !== undefined) {
      normalizedSku = input.sku.trim().toUpperCase();
      if (normalizedSku !== existing.sku) {
        const duplicate = await this.db.product.findFirst({
          where: {
            organizationId,
            sku: normalizedSku,
            NOT: { id: productId },
          },
        });

        if (duplicate) {
          throw new ConflictError(
            `A product with SKU '${normalizedSku}' already exists in this organization.`,
          );
        }
      }
    }

    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await this.db.productCategory.findFirst({
        where: {
          id: input.categoryId,
          organizationId,
        },
      });

      if (!category) {
        throw new BadRequestError("The specified category does not exist in this organization.");
      }
    }

    const updated = await this.db.product.update({
      where: { id: productId },
      data: {
        ...(normalizedSku !== undefined && { sku: normalizedSku }),
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description === null ? null : input.description.trim(),
        }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.unitOfMeasure !== undefined && {
          unitOfMeasure: input.unitOfMeasure.trim().toUpperCase(),
        }),
        ...(input.costPrice !== undefined && { costPrice: new Prisma.Decimal(input.costPrice) }),
        ...(input.sellingPrice !== undefined && {
          sellingPrice: new Prisma.Decimal(input.sellingPrice),
        }),
        ...(input.lowStockThreshold !== undefined && {
          lowStockThreshold: input.lowStockThreshold,
        }),
        ...(input.status !== undefined && { status: input.status }),
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    logger.info({ organizationId, productId }, "Product updated successfully");
    return toSafeProduct(updated);
  }

  /**
   * Soft-archives a product by setting status to ARCHIVED.
   * Preserves historical stock, audit logs, and transaction consistency.
   */
  public async archiveProduct(organizationId: string, productId: string): Promise<SafeProductDto> {
    const existing = await this.db.product.findFirst({
      where: {
        id: productId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Product not found.");
    }

    const archived = await this.db.product.update({
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

    logger.info({ organizationId, productId }, "Product archived successfully");
    return toSafeProduct(archived);
  }
}

export const productService = new ProductService();
