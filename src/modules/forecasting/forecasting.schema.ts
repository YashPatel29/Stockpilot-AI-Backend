import { z } from "zod";
import { ForecastRunStatus } from "@prisma/client";

export const forecastOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export const forecastIdParamSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    forecastId: z.string().uuid("Invalid forecast ID format."),
  })
  .strict();

export const createDemandForecastSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID format.").optional(),
    productIds: z
      .array(z.string().uuid("Invalid product ID format."))
      .min(1, "Product IDs array must contain at least 1 product.")
      .max(50, "Cannot forecast for more than 50 products simultaneously.")
      .optional(),
    horizonDays: z.coerce
      .number({ invalid_type_error: "Horizon days must be a number." })
      .int("Horizon days must be an integer.")
      .min(1, "Horizon days must be at least 1 day.")
      .max(90, "Horizon days cannot exceed 90 days.")
      .default(14),
    lookbackDays: z.coerce
      .number({ invalid_type_error: "Lookback days must be a number." })
      .int("Lookback days must be an integer.")
      .min(14, "Lookback days must be at least 14 days to capture weekly cycles.")
      .max(365, "Lookback days cannot exceed 365 days.")
      .default(30),
    granularity: z.literal("DAILY").default("DAILY"),
  })
  .strict()
  .transform((data) => {
    // Normalize single productId into productIds array if present
    let productIds = data.productIds;
    if (data.productId && !productIds) {
      productIds = [data.productId];
    } else if (data.productId && productIds && !productIds.includes(data.productId)) {
      productIds = [...productIds, data.productId];
    }
    return {
      ...data,
      productIds,
    };
  });

export type CreateDemandForecastSchema = z.infer<typeof createDemandForecastSchema>;

export const listForecastRunsQuerySchema = z
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
    status: z.nativeEnum(ForecastRunStatus).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
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

export type ListForecastRunsQuery = z.infer<typeof listForecastRunsQuerySchema>;
