import { z } from "zod";
import { InventoryTransactionType } from "./inventory.types";

/**
 * Shared regex pattern for validating decimal representation up to 4 decimal places.
 */
const POSITIVE_DECIMAL_REGEX = /^\d+(\.\d{1,4})?$/;
const SIGNED_DECIMAL_REGEX = /^[+-]?\d+(\.\d{1,4})?$/;

/**
 * Validates and normalizes a strictly positive Decimal string with at most 4 decimal places.
 */
export const positiveQuantitySchema = z
  .union([z.string().trim(), z.number()])
  .refine(
    (val) => {
      const str = String(val).trim();
      if (!POSITIVE_DECIMAL_REGEX.test(str)) {
        return false;
      }
      const num = Number(str);
      return !Number.isNaN(num) && num > 0;
    },
    {
      message: "Quantity must be a positive number with at most 4 decimal places.",
    },
  )
  .transform((val) => String(val).trim());

/**
 * Validates and normalizes a signed nonzero Decimal string with at most 4 decimal places.
 */
export const signedQuantityDeltaSchema = z
  .union([z.string().trim(), z.number()])
  .refine(
    (val) => {
      const str = String(val).trim();
      if (!SIGNED_DECIMAL_REGEX.test(str)) {
        return false;
      }
      const num = Number(str);
      return !Number.isNaN(num) && num !== 0;
    },
    {
      message: "Quantity delta must be a nonzero number with at most 4 decimal places.",
    },
  )
  .transform((val) => String(val).trim());

/**
 * Route parameter validation schema for organization-scoped inventory routes.
 */
export const inventoryOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type InventoryOrgParams = z.infer<typeof inventoryOrgParamsSchema>;

/**
 * Payload validation schema for receiving stock into a location.
 */
export const receiptSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID format."),
    locationId: z.string().uuid("Invalid location ID format."),
    quantity: positiveQuantitySchema,
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
      .min(1, "Idempotency key cannot be empty.")
      .max(128, "Idempotency key cannot exceed 128 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type ReceiptInput = z.infer<typeof receiptSchema>;

/**
 * Payload validation schema for issuing stock from a location.
 */
export const issueSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID format."),
    locationId: z.string().uuid("Invalid locationId format."),
    quantity: positiveQuantitySchema,
    reason: z
      .string()
      .trim()
      .max(100, "Reason cannot exceed 100 characters.")
      .optional()
      .nullable(),
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
      .min(1, "Idempotency key cannot be empty.")
      .max(128, "Idempotency key cannot exceed 128 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type IssueInput = z.infer<typeof issueSchema>;

/**
 * Payload validation schema for adjusting stock at a location.
 */
export const adjustmentSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID format."),
    locationId: z.string().uuid("Invalid location ID format."),
    quantityDelta: signedQuantityDeltaSchema,
    reason: z
      .string({ required_error: "Reason is required for stock adjustments." })
      .trim()
      .min(1, "Reason cannot be empty.")
      .max(100, "Reason cannot exceed 100 characters."),
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
      .min(1, "Idempotency key cannot be empty.")
      .max(128, "Idempotency key cannot exceed 128 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

/**
 * Payload validation schema for transferring stock between locations.
 */
export const transferSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID format."),
    sourceLocationId: z.string().uuid("Invalid source location ID format."),
    destinationLocationId: z.string().uuid("Invalid destination location ID format."),
    quantity: positiveQuantitySchema,
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
      .min(1, "Idempotency key cannot be empty.")
      .max(128, "Idempotency key cannot exceed 128 characters.")
      .optional()
      .nullable(),
  })
  .strict()
  .refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: "Source and destination locations must be distinct.",
    path: ["destinationLocationId"],
  });

export type TransferInput = z.infer<typeof transferSchema>;

/**
 * Query filters schema for listing inventory balances.
 */
export const listBalancesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "Page must be at least 1.").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    productId: z.string().uuid("Invalid product ID format.").optional(),
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    locationId: z.string().uuid("Invalid location ID format.").optional(),
    search: z.string().trim().max(100, "Search term cannot exceed 100 characters.").optional(),
  })
  .strict();

export type ListBalancesQuery = z.infer<typeof listBalancesQuerySchema>;

/**
 * Query filters schema for listing inventory transactions.
 */
export const listTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "Page must be at least 1.").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    productId: z.string().uuid("Invalid product ID format.").optional(),
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    locationId: z.string().uuid("Invalid location ID format.").optional(),
    type: z.nativeEnum(InventoryTransactionType).optional(),
    startDate: z
      .string()
      .datetime({ message: "startDate must be a valid ISO 8601 timestamp string." })
      .optional(),
    endDate: z
      .string()
      .datetime({ message: "endDate must be a valid ISO 8601 timestamp string." })
      .optional(),
    search: z.string().trim().max(100, "Search term cannot exceed 100 characters.").optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "startDate must not be after endDate.",
      path: ["startDate"],
    },
  );

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
