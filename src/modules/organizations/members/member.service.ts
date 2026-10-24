import { PrismaClient, OrganizationRole } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { logger } from "../../../infrastructure/logging/logger";
import { NotFoundError } from "../../../common/errors/http-errors";
import { PermissionPolicy } from "../rbac/permission.policy";
import type { ListMembersQuery } from "./member.schema";
import type { OrganizationMemberDto, PaginatedMembersResult } from "./member.types";

/**
 * Service managing organization team members, role assignments, and safe removal.
 * Invariant: Never imports Express types (Request, Response).
 */
export class MemberService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Lists all members of the specified organization with pagination and user profile data.
   */
  public async listMembers(
    organizationId: string,
    query: ListMembersQuery,
  ): Promise<PaginatedMembersResult> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where = { organizationId };

    const [total, memberships] = await Promise.all([
      this.db.organizationMembership.count({ where }),
      this.db.organizationMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const items: OrganizationMemberDto[] = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      organizationId: m.organizationId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
      },
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Modifies an organization member's role.
   * Enforces OWNER-only modification and prevents OWNER demotion or promotion.
   */
  public async updateMemberRole(
    actorUserId: string,
    organizationId: string,
    membershipId: string,
    newRole: OrganizationRole,
  ): Promise<OrganizationMemberDto> {
    // 1. Fetch actor's membership
    const actorMembership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
    });

    if (!actorMembership) {
      throw new NotFoundError("Organization not found.");
    }

    // 2. Fetch target membership and verify tenant isolation
    const targetMembership = await this.db.organizationMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      throw new NotFoundError("Member not found.");
    }

    // 3. Centralized RBAC policy validation
    PermissionPolicy.assertCanAssignRole(actorMembership.role, targetMembership.role, newRole);

    // 4. Update member role
    const updated = await this.db.organizationMembership.update({
      where: { id: membershipId },
      data: { role: newRole },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.info(
      {
        organizationId,
        actorUserId,
        targetUserId: updated.userId,
        targetMembershipId: updated.id,
        previousRole: targetMembership.role,
        newRole: updated.role,
      },
      "Member role updated successfully",
    );

    return {
      id: updated.id,
      userId: updated.userId,
      organizationId: updated.organizationId,
      role: updated.role,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      user: {
        id: updated.user.id,
        name: updated.user.name,
        email: updated.user.email,
      },
    };
  }

  /**
   * Removes a member from an organization.
   * Enforces hierarchy rules and prevents removing the OWNER.
   */
  public async removeMember(
    actorUserId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<void> {
    // 1. Fetch actor's membership
    const actorMembership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
    });

    if (!actorMembership) {
      throw new NotFoundError("Organization not found.");
    }

    // 2. Fetch target membership and verify tenant isolation
    const targetMembership = await this.db.organizationMembership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      throw new NotFoundError("Member not found.");
    }

    // 3. Centralized RBAC policy validation
    PermissionPolicy.assertCanRemoveMember(actorMembership.role, targetMembership.role);

    // 4. Remove membership
    await this.db.organizationMembership.delete({
      where: { id: membershipId },
    });

    logger.info(
      {
        organizationId,
        actorUserId,
        removedMembershipId: membershipId,
        removedUserId: targetMembership.userId,
        removedRole: targetMembership.role,
      },
      "Member removed from organization",
    );
  }
}

export const memberService = new MemberService();
