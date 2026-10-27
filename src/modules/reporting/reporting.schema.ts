import { z } from "zod";
import { InventoryTransactionType, PurchaseOrderStatus } from "@prisma/client";

export const reportingOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type ReportingOrgParams = z.infer<typeof reportingOrgParamsSchema>;

export const dashboardInventoryQuerySchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    recentLimit: z.coerce
      .number({ invalid_type_error: "Recent limit must be an integer." })
      .int()
      .min(1, "Recent limit must be at least 1.")
      .max(50, "Recent limit cannot exceed 50.")
      .default(10),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    { message: "Start date must be earlier than or equal to end date.", path: ["startDate"] },
  );

export type DashboardInventoryQuery = z.infer<typeof dashboardInventoryQuerySchema>;

export const warehouseInventoryQuerySchema = z
  .object({
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    categoryId: z.string().uuid("Invalid category ID format.").optional(),
  })
  .strict();

export type WarehouseInventoryQuery = z.infer<typeof warehouseInventoryQuerySchema>;

export const inventoryMovementsQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .positive("Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    type: z.nativeEnum(InventoryTransactionType).optional(),
    productId: z.string().uuid("Invalid product ID format.").optional(),
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    locationId: z.string().uuid("Invalid location ID format.").optional(),
    sortBy: z.enum(["createdAt", "quantity"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    { message: "Start date must be earlier than or equal to end date.", path: ["startDate"] },
  );

export type InventoryMovementsQuery = z.infer<typeof inventoryMovementsQuerySchema>;

export const productInventoryQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .positive("Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    productId: z.string().uuid("Invalid product ID format.").optional(),
    search: z.string().trim().optional(),
    categoryId: z.string().uuid("Invalid category ID format.").optional(),
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    locationId: z.string().uuid("Invalid location ID format.").optional(),
    sortBy: z.enum(["name", "sku", "createdAt"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export type ProductInventoryQuery = z.infer<typeof productInventoryQuerySchema>;

export const lowStockQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .positive("Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    categoryId: z.string().uuid("Invalid category ID format.").optional(),
    thresholdOverride: z.coerce
      .number({ invalid_type_error: "Threshold override must be an integer." })
      .int()
      .nonnegative("Threshold override cannot be negative.")
      .optional(),
    includeZeroThreshold: z.preprocess((val) => {
      if (typeof val === "string") {
        return val.toLowerCase() === "true";
      }
      return Boolean(val);
    }, z.boolean().default(false)),
    sortBy: z
      .enum(["deficit", "totalQuantityOnHand", "name", "sku", "lowStockThreshold"])
      .default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;

export const purchaseOrderReportQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .positive("Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    supplierId: z.string().uuid("Invalid supplier ID format.").optional(),
    status: z.nativeEnum(PurchaseOrderStatus).optional(),
    sortBy: z.enum(["orderDate", "totalAmount", "orderNumber"]).default("orderDate"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    { message: "Start date must be earlier than or equal to end date.", path: ["startDate"] },
  );

export type PurchaseOrderReportQuery = z.infer<typeof purchaseOrderReportQuerySchema>;

export const recentActivityQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
  })
  .strict();

export type RecentActivityQuery = z.infer<typeof recentActivityQuerySchema>;
