import type { Organization, OrganizationRole } from "@prisma/client";

/**
 * Organization Data Transfer Object exposed to API consumers.
 */
export interface SafeOrganizationDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Organization DTO enriched with the caller's specific membership role.
 */
export interface OrganizationWithRoleDto extends SafeOrganizationDto {
  role: OrganizationRole;
}

/**
 * Converts a raw Prisma Organization record to SafeOrganizationDto.
 */
export function toSafeOrganization(org: Organization): SafeOrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

/**
 * Paginated response metadata.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated list result.
 */
export interface PaginatedOrganizationsResult {
  organizations: OrganizationWithRoleDto[];
  meta: PaginationMeta;
}

/**
 * Result returned upon creating or fetching an organization.
 */
export interface OrganizationDetailResult {
  organization: SafeOrganizationDto;
  role: OrganizationRole;
}

