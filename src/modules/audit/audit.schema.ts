import { z } from "zod";

/**
 * Route parameter validation schema for organization-scoped audit queries.
 */
export const auditOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type AuditOrgParams = z.infer<typeof auditOrgParamsSchema>;

/**
 * Query parameter schema for filtering and paginating audit logs.
 */
export const listAuditLogsQuerySchema = z
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
    action: z.string().trim().min(1).max(100).optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
    resourceId: z.string().trim().max(100).optional(),
    actorUserId: z.string().uuid("Invalid actor user ID format.").optional(),
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

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
