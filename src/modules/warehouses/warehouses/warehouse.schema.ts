import { z } from "zod";
import { WarehouseStatus } from "./warehouse.types";

export const warehouseOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type WarehouseOrgParams = z.infer<typeof warehouseOrgParamsSchema>;

export const warehouseRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    warehouseId: z.string().uuid("Invalid warehouse ID format."),
  })
  .strict();

export type WarehouseRouteParams = z.infer<typeof warehouseRouteParamsSchema>;

export const createWarehouseSchema = z
  .object({
    code: z
      .string({ required_error: "Warehouse code is required." })
      .trim()
      .min(1, "Warehouse code cannot be empty.")
      .max(50, "Warehouse code cannot exceed 50 characters."),
    name: z
      .string({ required_error: "Warehouse name is required." })
      .trim()
      .min(1, "Warehouse name cannot be empty.")
      .max(150, "Warehouse name cannot exceed 150 characters."),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    addressLine1: z
      .string()
      .trim()
      .max(255, "Address line 1 cannot exceed 255 characters.")
      .optional()
      .nullable(),
    addressLine2: z
      .string()
      .trim()
      .max(255, "Address line 2 cannot exceed 255 characters.")
      .optional()
      .nullable(),
    city: z.string().trim().max(100, "City cannot exceed 100 characters.").optional().nullable(),
    state: z
      .string()
      .trim()
      .max(100, "State/region cannot exceed 100 characters.")
      .optional()
      .nullable(),
    postalCode: z
      .string()
      .trim()
      .max(30, "Postal code cannot exceed 30 characters.")
      .optional()
      .nullable(),
    country: z
      .string()
      .trim()
      .max(100, "Country cannot exceed 100 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Warehouse code cannot be empty.")
      .max(50, "Warehouse code cannot exceed 50 characters.")
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, "Warehouse name cannot be empty.")
      .max(150, "Warehouse name cannot exceed 150 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    addressLine1: z
      .string()
      .trim()
      .max(255, "Address line 1 cannot exceed 255 characters.")
      .optional()
      .nullable(),
    addressLine2: z
      .string()
      .trim()
      .max(255, "Address line 2 cannot exceed 255 characters.")
      .optional()
      .nullable(),
    city: z.string().trim().max(100, "City cannot exceed 100 characters.").optional().nullable(),
    state: z
      .string()
      .trim()
      .max(100, "State/region cannot exceed 100 characters.")
      .optional()
      .nullable(),
    postalCode: z
      .string()
      .trim()
      .max(30, "Postal code cannot exceed 30 characters.")
      .optional()
      .nullable(),
    country: z
      .string()
      .trim()
      .max(100, "Country cannot exceed 100 characters.")
      .optional()
      .nullable(),
    status: z.nativeEnum(WarehouseStatus).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

export const listWarehousesQuerySchema = z
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
    status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
    sortBy: z.enum(["name", "code", "createdAt", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListWarehousesQuery = z.infer<typeof listWarehousesQuerySchema>;
