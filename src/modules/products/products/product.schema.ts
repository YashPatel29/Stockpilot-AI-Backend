import { z } from "zod";
import { ProductStatus } from "@prisma/client";

export const productRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    productId: z.string().uuid("Invalid product ID format."),
  })
  .strict();

export type ProductRouteParams = z.infer<typeof productRouteParamsSchema>;

export const productOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type ProductOrgParams = z.infer<typeof productOrgParamsSchema>;

export const createProductSchema = z
  .object({
    sku: z
      .string({ required_error: "SKU is required." })
      .trim()
      .min(1, "SKU cannot be empty.")
      .max(50, "SKU cannot exceed 50 characters."),
    name: z
      .string({ required_error: "Product name is required." })
      .trim()
      .min(1, "Product name cannot be empty.")
      .max(150, "Product name cannot exceed 150 characters."),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    categoryId: z.string().uuid("Invalid category ID format.").optional().nullable(),
    unitOfMeasure: z
      .string()
      .trim()
      .min(1, "Unit of measure cannot be empty.")
      .max(20, "Unit of measure cannot exceed 20 characters.")
      .default("PCS"),
    costPrice: z.coerce
      .number({ invalid_type_error: "Cost price must be a valid number." })
      .min(0, "Cost price cannot be negative.")
      .default(0),
    sellingPrice: z.coerce
      .number({ invalid_type_error: "Selling price must be a valid number." })
      .min(0, "Selling price cannot be negative.")
      .default(0),
    lowStockThreshold: z.coerce
      .number({ invalid_type_error: "Low stock threshold must be a valid integer." })
      .int("Low stock threshold must be an integer.")
      .min(0, "Low stock threshold cannot be negative.")
      .default(0),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "SKU cannot be empty.")
      .max(50, "SKU cannot exceed 50 characters.")
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, "Product name cannot be empty.")
      .max(150, "Product name cannot exceed 150 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    categoryId: z.string().uuid("Invalid category ID format.").optional().nullable(),
    unitOfMeasure: z
      .string()
      .trim()
      .min(1, "Unit of measure cannot be empty.")
      .max(20, "Unit of measure cannot exceed 20 characters.")
      .optional(),
    costPrice: z.coerce
      .number({ invalid_type_error: "Cost price must be a valid number." })
      .min(0, "Cost price cannot be negative.")
      .optional(),
    sellingPrice: z.coerce
      .number({ invalid_type_error: "Selling price must be a valid number." })
      .min(0, "Selling price cannot be negative.")
      .optional(),
    lowStockThreshold: z.coerce
      .number({ invalid_type_error: "Low stock threshold must be a valid integer." })
      .int("Low stock threshold must be an integer.")
      .min(0, "Low stock threshold cannot be negative.")
      .optional(),
    status: z.nativeEnum(ProductStatus).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be a valid integer." })
      .int()
      .positive("Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be a valid integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    search: z.string().trim().optional(),
    categoryId: z.string().uuid("Invalid category ID format.").optional(),
    status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
    minPrice: z.coerce
      .number({ invalid_type_error: "minPrice must be a valid number." })
      .min(0, "minPrice cannot be negative.")
      .optional(),
    maxPrice: z.coerce
      .number({ invalid_type_error: "maxPrice must be a valid number." })
      .min(0, "maxPrice cannot be negative.")
      .optional(),
    sortBy: z
      .enum(["name", "sku", "costPrice", "sellingPrice", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.maxPrice >= data.minPrice;
      }
      return true;
    },
    {
      message: "maxPrice must be greater than or equal to minPrice.",
    },
  );

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
