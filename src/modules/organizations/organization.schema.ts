import { z } from "zod";

/**
 * Organization creation request schema.
 */
export const createOrganizationSchema = z
  .object({
    name: z
      .string({ required_error: "Organization name is required." })
      .trim()
      .min(2, "Organization name must be at least 2 characters.")
      .max(100, "Organization name cannot exceed 100 characters."),
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/**
 * Organization update request schema.
 * Rejects unsupported fields strictly.
 */
export const updateOrganizationSchema = z
  .object({
    name: z
      .string({ required_error: "Organization name is required." })
      .trim()
      .min(2, "Organization name must be at least 2 characters.")
      .max(100, "Organization name cannot exceed 100 characters.")
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one valid field must be provided to update.",
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/**
 * URL parameter schema for endpoints scoped by :organizationId.
 */
export const organizationIdParamSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID format. Must be a valid UUID."),
});

export type OrganizationIdParam = z.infer<typeof organizationIdParamSchema>;

/**
 * Query schema for listing organizations with pagination.
 */
export const listOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;

