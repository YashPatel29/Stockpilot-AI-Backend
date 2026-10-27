import { z } from "zod";
import { PurchaseOrderStatus } from "./purchase-order.types";

export const purchaseOrderOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type PurchaseOrderOrgParams = z.infer<typeof purchaseOrderOrgParamsSchema>;

export const purchaseOrderRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    purchaseOrderId: z.string().uuid("Invalid purchase order ID format."),
  })
  .strict();

export type PurchaseOrderRouteParams = z.infer<typeof purchaseOrderRouteParamsSchema>;

export const purchaseOrderItemInputSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID format."),
    quantityOrdered: z.coerce
      .number({ invalid_type_error: "Quantity ordered must be a valid number." })
      .positive("Quantity ordered must be greater than 0."),
    unitCost: z.coerce
      .number({ invalid_type_error: "Unit cost must be a valid number." })
      .nonnegative("Unit cost must be greater than or equal to 0."),
  })
  .strict();

export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;

export const createPurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid("Invalid supplier ID format."),
    orderDate: z.coerce.date().optional(),
    expectedDeliveryDate: z.coerce.date().optional().nullable(),
    currency: z
      .string()
      .trim()
      .length(3, "Currency must be a 3-letter ISO code.")
      .toUpperCase()
      .default("USD"),
    taxAmount: z.coerce
      .number({ invalid_type_error: "Tax amount must be a number." })
      .nonnegative("Tax amount cannot be negative.")
      .default(0),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    items: z
      .array(purchaseOrderItemInputSchema)
      .min(1, "At least one line item is required in a purchase order.")
      .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
        message:
          "Duplicate product in purchase order line items is not allowed. Please consolidate quantities.",
      }),
  })
  .strict();

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid("Invalid supplier ID format.").optional(),
    orderDate: z.coerce.date().optional(),
    expectedDeliveryDate: z.coerce.date().optional().nullable(),
    currency: z
      .string()
      .trim()
      .length(3, "Currency must be a 3-letter ISO code.")
      .toUpperCase()
      .optional(),
    taxAmount: z.coerce
      .number({ invalid_type_error: "Tax amount must be a number." })
      .nonnegative("Tax amount cannot be negative.")
      .optional(),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    items: z
      .array(purchaseOrderItemInputSchema)
      .min(1, "At least one line item is required in a purchase order.")
      .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
        message:
          "Duplicate product in purchase order line items is not allowed. Please consolidate quantities.",
      })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export const receivePurchaseOrderItemsSchema = z
  .object({
    locationId: z.string().uuid("Invalid location ID format."),
    reference: z
      .string()
      .trim()
      .max(100, "Reference cannot exceed 100 characters.")
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes cannot exceed 1000 characters.")
      .optional()
      .nullable(),
    idempotencyKey: z
      .string()
      .trim()
      .max(100, "Idempotency key cannot exceed 100 characters.")
      .optional()
      .nullable(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid("Invalid product ID format."),
            quantity: z.coerce
              .number({ invalid_type_error: "Quantity must be a valid number." })
              .positive("Quantity received must be greater than 0."),
          })
          .strict(),
      )
      .min(1, "At least one product item must be received.")
      .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
        message:
          "Duplicate product in receipt items is not allowed. Please consolidate quantities.",
      }),
  })
  .strict();

export type ReceivePurchaseOrderItemsInput = z.infer<typeof receivePurchaseOrderItemsSchema>;

export const listPurchaseOrdersQuerySchema = z
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
    supplierId: z.string().uuid("Invalid supplier ID format.").optional(),
    status: z.nativeEnum(PurchaseOrderStatus).optional(),
    search: z.string().trim().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    sortBy: z
      .enum(["orderNumber", "orderDate", "status", "totalAmount", "createdAt", "updatedAt"])
      .default("orderDate"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
