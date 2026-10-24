import type { Product, ProductCategory, ProductStatus } from "@prisma/client";

export interface ProductCategorySummaryDto {
  id: string;
  name: string;
}

export interface SafeProductDto {
  id: string;
  organizationId: string;
  categoryId: string | null;
  sku: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  lowStockThreshold: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  category?: ProductCategorySummaryDto | null;
}

export interface PaginatedProductsResult {
  items: SafeProductDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export type ProductWithCategory = Product & {
  category?: Pick<ProductCategory, "id" | "name"> | null;
};

export function toSafeProduct(product: ProductWithCategory): SafeProductDto {
  return {
    id: product.id,
    organizationId: product.organizationId,
    categoryId: product.categoryId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unitOfMeasure: product.unitOfMeasure,
    costPrice: Number(product.costPrice),
    sellingPrice: Number(product.sellingPrice),
    lowStockThreshold: product.lowStockThreshold,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    ...(product.category !== undefined && {
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
          }
        : null,
    }),
  };
}
