import { z } from "zod";
import {
  AnomalyCategory,
  AnomalySeverity,
  AnomalyStatus,
  DetectionRunStatus,
} from "@prisma/client";

export const anomalyOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export const anomalyIdParamSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    anomalyId: z.string().uuid("Invalid anomaly ID format."),
  })
  .strict();

export const detectionRunIdParamSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    runId: z.string().uuid("Invalid detection run ID format."),
  })
  .strict();

export const triggerAnomalyDetectionSchema = z
  .object({
    windowDays: z.coerce
      .number({ invalid_type_error: "Window days must be a number." })
      .int("Window days must be an integer.")
      .min(1, "Window days must be at least 1 day.")
      .max(90, "Window days cannot exceed 90 days.")
      .default(30),
    productId: z.string().uuid("Invalid product ID format.").optional(),
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    categories: z
      .array(
        z.nativeEnum(AnomalyCategory, {
          errorMap: () => ({ message: "Invalid anomaly category." }),
        }),
      )
      .min(1, "Categories array must not be empty.")
      .optional(),
    minSeverity: z
      .nativeEnum(AnomalySeverity, { errorMap: () => ({ message: "Invalid anomaly severity." }) })
      .optional(),
  })
  .strict();

export type TriggerAnomalyDetectionSchema = z.infer<typeof triggerAnomalyDetectionSchema>;

export const listAnomaliesQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int("Page must be an integer.")
      .min(1, "Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    category: z
      .nativeEnum(AnomalyCategory, { errorMap: () => ({ message: "Invalid anomaly category." }) })
      .optional(),
    severity: z
      .nativeEnum(AnomalySeverity, { errorMap: () => ({ message: "Invalid anomaly severity." }) })
      .optional(),
    status: z
      .nativeEnum(AnomalyStatus, { errorMap: () => ({ message: "Invalid anomaly status." }) })
      .optional(),
    productId: z.string().uuid("Invalid product ID format.").optional(),
    warehouseId: z.string().uuid("Invalid warehouse ID format.").optional(),
    detectionRunId: z.string().uuid("Invalid detection run ID format.").optional(),
    startDate: z
      .string()
      .datetime({ message: "Start date must be an ISO 8601 string." })
      .optional(),
    endDate: z.string().datetime({ message: "End date must be an ISO 8601 string." }).optional(),
    sortBy: z.enum(["createdAt", "detectedAt", "severity", "score"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListAnomaliesQuery = z.infer<typeof listAnomaliesQuerySchema>;

export const listDetectionRunsQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int("Page must be an integer.")
      .min(1, "Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    status: z
      .nativeEnum(DetectionRunStatus, { errorMap: () => ({ message: "Invalid run status." }) })
      .optional(),
  })
  .strict();

export type ListDetectionRunsQuery = z.infer<typeof listDetectionRunsQuerySchema>;

export const updateAnomalyStatusSchema = z
  .object({
    status: z.enum([AnomalyStatus.ACKNOWLEDGED, AnomalyStatus.RESOLVED, AnomalyStatus.DISMISSED], {
      errorMap: () => ({
        message: "Status must be one of: ACKNOWLEDGED, RESOLVED, DISMISSED.",
      }),
    }),
    resolutionNote: z
      .string()
      .trim()
      .max(1000, "Resolution note cannot exceed 1000 characters.")
      .optional(),
  })
  .strict();

export type UpdateAnomalyStatusSchema = z.infer<typeof updateAnomalyStatusSchema>;
