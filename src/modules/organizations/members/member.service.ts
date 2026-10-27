import { PrismaClient, OrganizationRole, NotificationType } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { logger } from "../../../infrastructure/logging/logger";
import { NotFoundError } from "../../../common/errors/http-errors";
import { PermissionPolicy } from "../rbac/permission.policy";
import { AuditService } from "../../audit/audit.service";
import { AuditAction, AuditResourceType } from "../../audit/audit.types";
import { NotificationService } from "../../notifications/notification.service";
import type { ListMembersQuery } from "./member.schema";
import type { OrganizationMemberDto, PaginatedMembersResult } from "./member.types";

/**
 * Service managing organization team members, role assignments, and safe removal.
 * Invariant: Never imports Express types (Request, Response).
 */
export class MemberService {
  private readonly audit: AuditService;
  private readonly notifications: NotificationService;

  constructor(
    private readonly db: PrismaClient = prisma,
    audit?: AuditService,
    notifications?: NotificationService,
  ) {
    this.audit = audit ?? new AuditService(this.db);
    this.notifications = notifications ?? new NotificationService(this.db);
  }

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

    await this.audit.recordAudit({
      organizationId,
      actorUserId,
      action: AuditAction.MEMBERSHIP_ROLE_UPDATED,
      resourceType: AuditResourceType.ORGANIZATION_MEMBERSHIP,
      resourceId: updated.id,
      metadata: {
        targetUserId: updated.userId,
        previousRole: targetMembership.role,
        newRole: updated.role,
      },
    });

    await this.notifications.createNotification({
      organizationId,
      recipientUserId: updated.userId,
      type: NotificationType.ROLE_UPDATED,
      title: "Role Updated",
      message: `Your role in the organization has been updated to ${updated.role}.`,
      data: {
        organizationId,
        previousRole: targetMembership.role,
        newRole: updated.role,
      },
    });

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

    await this.audit.recordAudit({
      organizationId,
      actorUserId,
      action: AuditAction.MEMBERSHIP_REMOVED,
      resourceType: AuditResourceType.ORGANIZATION_MEMBERSHIP,
      resourceId: membershipId,
      metadata: {
        removedUserId: targetMembership.userId,
        removedRole: targetMembership.role,
      },
    });
  }
}

export const memberService = new MemberService();
