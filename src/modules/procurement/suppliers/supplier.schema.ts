import { z } from "zod";

export const supplierOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type SupplierOrgParams = z.infer<typeof supplierOrgParamsSchema>;

export const supplierRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    supplierId: z.string().uuid("Invalid supplier ID format."),
  })
  .strict();

export type SupplierRouteParams = z.infer<typeof supplierRouteParamsSchema>;

export const createSupplierSchema = z
  .object({
    name: z
      .string({ required_error: "Supplier name is required." })
      .trim()
      .min(1, "Supplier name cannot be empty.")
      .max(100, "Supplier name cannot exceed 100 characters."),
    code: z
      .string()
      .trim()
      .min(1, "Supplier code cannot be empty.")
      .max(50, "Supplier code cannot exceed 50 characters.")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .email("Invalid email format.")
      .max(255, "Email cannot exceed 255 characters.")
      .toLowerCase()
      .optional()
      .nullable(),
    phone: z
      .string()
      .trim()
      .max(50, "Phone number cannot exceed 50 characters.")
      .optional()
      .nullable(),
    contactPerson: z
      .string()
      .trim()
      .max(100, "Contact person cannot exceed 100 characters.")
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(255, "Address cannot exceed 255 characters.")
      .optional()
      .nullable(),
    taxIdentifier: z
      .string()
      .trim()
      .max(50, "Tax identifier cannot exceed 50 characters.")
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Supplier name cannot be empty.")
      .max(100, "Supplier name cannot exceed 100 characters.")
      .optional(),
    code: z
      .string()
      .trim()
      .min(1, "Supplier code cannot be empty.")
      .max(50, "Supplier code cannot exceed 50 characters.")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .email("Invalid email format.")
      .max(255, "Email cannot exceed 255 characters.")
      .toLowerCase()
      .optional()
      .nullable(),
    phone: z
      .string()
      .trim()
      .max(50, "Phone number cannot exceed 50 characters.")
      .optional()
      .nullable(),
    contactPerson: z
      .string()
      .trim()
      .max(100, "Contact person cannot exceed 100 characters.")
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .max(255, "Address cannot exceed 255 characters.")
      .optional()
      .nullable(),
    taxIdentifier: z
      .string()
      .trim()
      .max(50, "Tax identifier cannot exceed 50 characters.")
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersQuerySchema = z
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
    isActive: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const lower = val.toLowerCase();
          if (lower === "true") return true;
          if (lower === "false") return false;
          if (lower === "all") return undefined;
        }
        return val;
      }, z.boolean().optional())
      .optional(),
    sortBy: z.enum(["name", "code", "createdAt", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
