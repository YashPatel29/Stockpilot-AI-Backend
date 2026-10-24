import type { OrganizationRole } from "@prisma/client";
import type { PaginationMeta, SafeOrganizationDto } from "../organization.types";

/**
 * Public inviter profile attached to invitation records.
 */
export interface SafeInviterDto {
  id: string;
  name: string;
  email: string;
}

/**
 * Safe invitation representation exposed to API consumers.
 * Invariant: Never exposes tokenHash to consumers.
 */
export interface SafeInvitationDto {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
  createdAt: string;
  invitedBy?: SafeInviterDto;
}

/**
 * Paginated list result for pending invitations.
 */
export interface PaginatedInvitationsResult {
  items: SafeInvitationDto[];
  pagination: PaginationMeta;
}

/**
 * Result returned upon successful invitation creation.
 */
export interface CreateInvitationResponseDto {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
  createdAt: string;
  devRawToken?: string;
}

/**
 * Result returned upon successfully accepting an invitation.
 */
export interface AcceptInvitationResultDto {
  membership: {
    id: string;
    organizationId: string;
    role: OrganizationRole;
    createdAt: string;
  };
  organization: SafeOrganizationDto;
}

/**
 * Public invitation metadata returned to unauthenticated or authenticated receivers
 * to preview the invitation details before accepting.
 */
export interface PublicInvitationDetailsDto {
  id: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    name: string;
  };
}

/**
 * Representation of an invitation received by the currently authenticated user.
 */
export interface UserReceivedInvitationDto {
  id: string;
  role: OrganizationRole;
  expiresAt: string;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    name: string;
    email: string;
  };
}
