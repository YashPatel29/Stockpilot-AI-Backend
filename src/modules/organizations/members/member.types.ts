import type { OrganizationRole } from "@prisma/client";
import type { PaginationMeta } from "../organization.types";

/**
 * Safe user projection exposed inside organization member lists.
 * Invariant: Never exposes passwordHash or private session state.
 */
export interface SafeMemberUserDto {
  id: string;
  name: string;
  email: string;
}

/**
 * Organization member record returned to API consumers.
 */
export interface OrganizationMemberDto {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
  user: SafeMemberUserDto;
}

/**
 * Paginated list result for organization members.
 */
export interface PaginatedMembersResult {
  items: OrganizationMemberDto[];
  pagination: PaginationMeta;
}
