import { z } from "zod";
import { OrganizationRole } from "@prisma/client";

/**
 * Route parameter validation schema for member endpoints requiring membershipId.
 */
export const memberRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    membershipId: z.string().uuid("Invalid membership ID format."),
  })
  .strict();

export type MemberRouteParams = z.infer<typeof memberRouteParamsSchema>;

/**
 * Schema for updating an organization member's role.
 * Invariant: Only ADMIN and MEMBER can be assigned. Direct promotion to OWNER is rejected.
 */
export const updateMemberRoleSchema = z
  .object({
    role: z.enum([OrganizationRole.ADMIN, OrganizationRole.MEMBER], {
      errorMap: () => ({
        message: "Role must be either ADMIN or MEMBER.",
      }),
    }),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/**
 * Query schema for paginating organization members.
 */
export const listMembersQuerySchema = z
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
  })
  .strict();

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
