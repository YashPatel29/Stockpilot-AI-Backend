import { z } from "zod";
import { OrganizationRole } from "@prisma/client";

/**
 * Request body schema for issuing a new organization invitation.
 * Invariant: Direct invitations as OWNER are forbidden.
 */
export const createInvitationSchema = z
  .object({
    email: z
      .string({ required_error: "Email is required." })
      .email("Invalid email address format.")
      .max(255, "Email address is too long.")
      .transform((val) => val.trim().toLowerCase()),
    role: z.enum([OrganizationRole.ADMIN, OrganizationRole.MEMBER], {
      errorMap: () => ({
        message: "Role must be either ADMIN or MEMBER.",
      }),
    }),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * Route parameter validation schema for organization invitation subroutes.
 */
export const invitationRouteParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    invitationId: z.string().uuid("Invalid invitation ID format."),
  })
  .strict();

export type InvitationRouteParams = z.infer<typeof invitationRouteParamsSchema>;

/**
 * Query schema for listing pending invitations.
 */
export const listInvitationsQuerySchema = z
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

export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;

/**
 * Request body schema for accepting an invitation token or ID.
 */
export const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, "Invitation token cannot be empty.")
      .max(256, "Invitation token format is invalid.")
      .optional(),
    invitationId: z.string().trim().min(1, "Invitation ID cannot be empty.").optional(),
  })
  .refine((data) => Boolean(data.token || data.invitationId), {
    message: "Either invitation token or invitationId must be provided.",
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * Request body schema for rejecting an invitation.
 */
export const rejectInvitationSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, "Invitation token cannot be empty.")
      .max(256, "Invitation token format is invalid.")
      .optional(),
    invitationId: z.string().trim().min(1, "Invitation ID cannot be empty.").optional(),
  })
  .refine((data) => Boolean(data.token || data.invitationId), {
    message: "Either invitation token or invitationId must be provided.",
  });

export type RejectInvitationInput = z.infer<typeof rejectInvitationSchema>;
