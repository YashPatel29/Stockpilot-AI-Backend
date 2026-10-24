import { z } from "zod";

export const categoryRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    categoryId: z.string().uuid("Invalid category ID format."),
  })
  .strict();

export type CategoryRouteParams = z.infer<typeof categoryRouteParamsSchema>;

export const categoryOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type CategoryOrgParams = z.infer<typeof categoryOrgParamsSchema>;

export const createCategorySchema = z
  .object({
    name: z
      .string({ required_error: "Category name is required." })
      .trim()
      .min(1, "Category name cannot be empty.")
      .max(100, "Category name cannot exceed 100 characters."),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Category name cannot be empty.")
      .max(100, "Category name cannot exceed 100 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters.")
      .optional()
      .nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesQuerySchema = z
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
    sortBy: z.enum(["name", "createdAt"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
