import type { ProductCategory } from "@prisma/client";

export interface SafeProductCategoryDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  productCount?: number;
}

export interface PaginatedCategoriesResult {
  items: SafeProductCategoryDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function toSafeCategory(
  category: ProductCategory & { _count?: { products: number } },
): SafeProductCategoryDto {
  return {
    id: category.id,
    organizationId: category.organizationId,
    name: category.name,
    description: category.description,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    ...(category._count !== undefined && { productCount: category._count.products }),
  };
}
