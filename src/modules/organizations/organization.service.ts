import crypto from "crypto";
import { PrismaClient, OrganizationRole } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { logger } from "../../infrastructure/logging/logger";
import { NotFoundError, ForbiddenError } from "../../common/errors/http-errors";
import { slugify } from "../../common/utils/slug.util";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationsQuery,
} from "./organization.schema";
import {
  toSafeOrganization,
  type OrganizationDetailResult,
  type PaginatedOrganizationsResult,
  type SafeOrganizationDto,
} from "./organization.types";

/**
 * Service encapsulating multi-tenant organization lifecycle,
 * owner authorization boundaries, and membership assignments.
 * Invariant: Never imports Express types (Request, Response).
 */
export class OrganizationService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Creates an organization and its initial OWNER membership in an atomic transaction.
   */
  public async createOrganization(
    userId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDetailResult> {
    const trimmedName = input.name.trim();
    const slug = await this.generateUniqueSlug(trimmedName);

    const result = await this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: trimmedName,
          slug,
          status: "ACTIVE",
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          userId,
          organizationId: org.id,
          role: OrganizationRole.OWNER,
        },
      });

      return { org, role: membership.role };
    });

    logger.info(
      { organizationId: result.org.id, userId },
      "New organization created with initial OWNER membership",
    );

    return {
      organization: toSafeOrganization(result.org),
      role: result.role,
    };
  }

  /**
   * Lists organizations the authenticated user belongs to with pagination.
   */
  public async listUserOrganizations(
    userId: string,
    query: ListOrganizationsQuery,
  ): Promise<PaginatedOrganizationsResult> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      organization: {
        status: { not: "DEACTIVATED" },
      },
    };

    const [total, memberships] = await Promise.all([
      this.db.organizationMembership.count({ where }),
      this.db.organizationMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { organization: true },
      }),
    ]);

    const organizations = memberships.map((m) => ({
      ...toSafeOrganization(m.organization),
      role: m.role,
    }));

    return {
      organizations,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves an organization by ID only if the caller is an active member.
   * Returns generic 404 to non-members to prevent tenant ID enumeration (IDOR prevention).
   */
  public async getOrganizationById(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationDetailResult> {
    const membership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: { organization: true },
    });

    if (!membership || membership.organization.status === "DEACTIVATED") {
      throw new NotFoundError("Organization not found.");
    }

    return {
      organization: toSafeOrganization(membership.organization),
      role: membership.role,
    };
  }

  /**
   * Updates organization details. Restricted to organization OWNERs only.
   */
  public async updateOrganization(
    userId: string,
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<SafeOrganizationDto> {
    const membership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: { organization: true },
    });

    if (!membership || membership.organization.status === "DEACTIVATED") {
      throw new NotFoundError("Organization not found.");
    }

    if (membership.role !== OrganizationRole.OWNER) {
      throw new ForbiddenError("Only organization owners can modify organization details.");
    }

    const data: { name?: string; slug?: string } = {};

    if (input.name) {
      const trimmedName = input.name.trim();
      data.name = trimmedName;

      // Only regenerate slug if name changed
      if (trimmedName.toLowerCase() !== membership.organization.name.toLowerCase()) {
        data.slug = await this.generateUniqueSlug(trimmedName);
      }
    }

    const updated = await this.db.organization.update({
      where: { id: organizationId },
      data,
    });

    logger.info({ organizationId, userId }, "Organization updated successfully");

    return toSafeOrganization(updated);
  }

  /**
   * Safely deactivates an organization. Restricted to organization OWNERs only.
   * Uses safe deactivation policy to preserve data integrity and audit trails.
   */
  public async deactivateOrganization(userId: string, organizationId: string): Promise<void> {
    const membership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: { organization: true },
    });

    if (!membership || membership.organization.status === "DEACTIVATED") {
      throw new NotFoundError("Organization not found.");
    }

    if (membership.role !== OrganizationRole.OWNER) {
      throw new ForbiddenError("Only organization owners can deactivate an organization.");
    }

    await this.db.organization.update({
      where: { id: organizationId },
      data: { status: "DEACTIVATED" },
    });

    logger.info({ organizationId, userId }, "Organization deactivated successfully");
  }

  /**
   * Helper that produces a guaranteed unique slug for an organization name.
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = slugify(name);
    let candidate = baseSlug;
    let attempts = 0;

    while (attempts < 10) {
      const existing = await this.db.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }

      attempts++;
      candidate = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
    }

    return `${baseSlug}-${Date.now()}`;
  }
}

export const organizationService = new OrganizationService();
