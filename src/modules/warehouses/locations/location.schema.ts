import { z } from "zod";
import { LocationStatus } from "./location.types";

export const locationWarehouseParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    warehouseId: z.string().uuid("Invalid warehouse ID format."),
  })
  .strict();

export type LocationWarehouseParams = z.infer<typeof locationWarehouseParamsSchema>;

export const locationRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    warehouseId: z.string().uuid("Invalid warehouse ID format."),
    locationId: z.string().uuid("Invalid location ID format."),
  })
  .strict();

export type LocationRouteParams = z.infer<typeof locationRouteParamsSchema>;

export const createLocationSchema = z
  .object({
    code: z
      .string({ required_error: "Location code is required." })
      .trim()
      .min(1, "Location code cannot be empty.")
      .max(50, "Location code cannot exceed 50 characters."),
    name: z
      .string({ required_error: "Location name is required." })
      .trim()
      .min(1, "Location name cannot be empty.")
      .max(150, "Location name cannot exceed 150 characters."),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    type: z
      .string()
      .trim()
      .max(50, "Location type cannot exceed 50 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Location code cannot be empty.")
      .max(50, "Location code cannot exceed 50 characters.")
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, "Location name cannot be empty.")
      .max(150, "Location name cannot exceed 150 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    type: z
      .string()
      .trim()
      .max(50, "Location type cannot exceed 50 characters.")
      .optional()
      .nullable(),
    status: z.nativeEnum(LocationStatus).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const listLocationsQuerySchema = z
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
    type: z.string().trim().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
    sortBy: z.enum(["code", "name", "type", "createdAt", "updatedAt"]).default("code"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;
