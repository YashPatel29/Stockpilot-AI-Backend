import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { logger } from "../../../infrastructure/logging/logger";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../../../common/errors/http-errors";
import { hashToken } from "../../../common/utils/token.util";
import { toSafeOrganization } from "../organization.types";
import { PermissionPolicy } from "../rbac/permission.policy";
import type { IInvitationDeliveryService } from "./delivery/delivery.interface";
import { devInvitationDelivery } from "./delivery/dev-delivery";
import type { CreateInvitationInput, ListInvitationsQuery } from "./invitation.schema";
import type {
  SafeInvitationDto,
  PaginatedInvitationsResult,
  AcceptInvitationResultDto,
  PublicInvitationDetailsDto,
  UserReceivedInvitationDto,
} from "./invitation.types";

/**
 * Service orchestrating organization invitations, token hashing,
 * expiration, safe delivery, and atomic acceptance transactions.
 * Invariant: Never imports Express types (Request, Response).
 */
export class InvitationService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly deliveryService: IInvitationDeliveryService = devInvitationDelivery,
  ) {}

  /**
   * Creates a cryptographically secure, expiring organization invitation.
   * Invariant: Never stores raw tokens. Only stores deterministic SHA-256 hashes.
   */
  public async createInvitation(
    actorUserId: string,
    organizationId: string,
    input: CreateInvitationInput,
  ): Promise<{ invitation: SafeInvitationDto; rawToken: string }> {
    // 1. Fetch actor's membership & verify permissions
    const actorMembership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
      include: {
        organization: true,
        user: true,
      },
    });

    if (!actorMembership || actorMembership.organization.status === "DEACTIVATED") {
      throw new NotFoundError("Organization not found.");
    }

    PermissionPolicy.assertCanCreateInvitation(actorMembership.role, input.role);

    const normalizedEmail = input.email.trim().toLowerCase();

    // 2. Prevent duplicate membership if invitee is already an active member
    const existingMember = await this.db.organizationMembership.findFirst({
      where: {
        organizationId,
        user: {
          email: normalizedEmail,
        },
      },
    });

    if (existingMember) {
      throw new ConflictError("User is already a member of this organization.");
    }

    // 3. Invalidate any existing pending invitations for this email in this org
    await this.db.organizationInvitation.updateMany({
      where: {
        organizationId,
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // 4. Generate high-entropy token (256-bit entropy) and SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    // Default expiration: 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const record = await this.db.organizationInvitation.create({
      data: {
        organizationId,
        email: normalizedEmail,
        role: input.role,
        tokenHash,
        invitedById: actorUserId,
        expiresAt,
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // 5. Dispatch delivery adapter
    await this.deliveryService.sendInvitation({
      toEmail: record.email,
      organizationName: actorMembership.organization.name,
      inviterName: actorMembership.user?.name ?? "Team Admin",
      role: record.role,
      rawToken,
      expiresAt: record.expiresAt,
    });

    logger.info(
      {
        organizationId,
        invitationId: record.id,
        toEmail: record.email,
        role: record.role,
        invitedById: actorUserId,
      },
      "Organization invitation created and dispatched",
    );

    return {
      invitation: {
        id: record.id,
        organizationId: record.organizationId,
        email: record.email,
        role: record.role,
        expiresAt: record.expiresAt.toISOString(),
        createdAt: record.createdAt.toISOString(),
        invitedBy: {
          id: record.invitedBy.id,
          name: record.invitedBy.name,
          email: record.invitedBy.email,
        },
      },
      rawToken,
    };
  }

  /**
   * Lists pending invitations for an organization.
   * Strips all token hashes to preserve confidentiality.
   */
  public async listPendingInvitations(
    organizationId: string,
    query: ListInvitationsQuery,
  ): Promise<PaginatedInvitationsResult> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };

    const [total, records] = await Promise.all([
      this.db.organizationInvitation.count({ where }),
      this.db.organizationInvitation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const items: SafeInvitationDto[] = records.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      email: r.email,
      role: r.role,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      invitedBy: {
        id: r.invitedBy.id,
        name: r.invitedBy.name,
        email: r.invitedBy.email,
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
   * Revokes a pending invitation.
   * Enforces OWNER or ADMIN role and strict tenant isolation.
   */
  public async revokeInvitation(
    actorUserId: string,
    organizationId: string,
    invitationId: string,
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

    PermissionPolicy.assertCanRevokeInvitation(actorMembership.role);

    // 2. Fetch invitation and verify tenant ownership
    const invitation = await this.db.organizationInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== organizationId) {
      throw new NotFoundError("Invitation not found.");
    }

    if (invitation.acceptedAt !== null) {
      throw new BadRequestError("Cannot revoke an invitation that has already been accepted.");
    }

    if (invitation.revokedAt !== null) {
      // Idempotent: already revoked
      return;
    }

    await this.db.organizationInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    logger.info(
      { organizationId, invitationId, actorUserId },
      "Organization invitation revoked successfully",
    );
  }

  /**
   * Accepts an invitation and establishes organization membership atomically.
   */
  public async acceptInvitation(
    actorUserId: string,
    actorEmail: string,
    rawTokenOrId: string,
  ): Promise<AcceptInvitationResultDto> {
    const tokenHash = hashToken(rawTokenOrId.trim());

    // 1. Find invitation by hashed token OR by ID
    let invitation = await this.db.organizationInvitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation) {
      invitation = await this.db.organizationInvitation.findUnique({
        where: { id: rawTokenOrId.trim() },
        include: { organization: true },
      });
    }

    if (!invitation) {
      throw new BadRequestError("Invalid or expired invitation token.");
    }

    if (invitation.revokedAt !== null) {
      throw new BadRequestError("This invitation has been revoked.");
    }

    if (invitation.acceptedAt !== null) {
      throw new BadRequestError("This invitation has already been accepted.");
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestError("This invitation has expired.");
    }

    if (invitation.organization.status === "DEACTIVATED") {
      throw new BadRequestError("The invited organization is no longer active.");
    }

    // 2. Enforce email ownership: caller's normalized email MUST match invitee email
    const normalizedActorEmail = actorEmail.trim().toLowerCase();
    const normalizedInviteeEmail = invitation.email.trim().toLowerCase();

    if (normalizedActorEmail !== normalizedInviteeEmail) {
      throw new ForbiddenError(
        "This invitation was issued for a different email address. Please log in with the invited email.",
      );
    }

    // 3. Verify user is not already a member
    const existingMembership = await this.db.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId: invitation.organizationId,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictError("You are already a member of this organization.");
    }

    // 4. Atomic transaction: create membership and mark invitation accepted
    const result = await this.db.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.create({
        data: {
          userId: actorUserId,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return membership;
    });

    logger.info(
      {
        organizationId: invitation.organizationId,
        userId: actorUserId,
        role: result.role,
        invitationId: invitation.id,
      },
      "Organization invitation accepted and membership created atomically",
    );

    return {
      membership: {
        id: result.id,
        organizationId: result.organizationId,
        role: result.role,
        createdAt: result.createdAt.toISOString(),
      },
      organization: toSafeOrganization(invitation.organization),
    };
  }

  /**
   * Previews safe invitation details by token.
   * Enables frontend to show the invited organization, role, and inviter prior to acceptance.
   * Public: Does not disclose sensitive tokens or hashes.
   */
  public async getInvitationDetails(rawToken: string): Promise<PublicInvitationDetailsDto> {
    const tokenHash = hashToken(rawToken.trim());

    const invitation = await this.db.organizationInvitation.findUnique({
      where: { tokenHash },
      include: {
        organization: true,
        invitedBy: {
          select: { name: true },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundError("Invitation not found or invalid.");
    }

    if (invitation.revokedAt !== null) {
      throw new BadRequestError("This invitation has been revoked.");
    }

    if (invitation.acceptedAt !== null) {
      throw new BadRequestError("This invitation has already been accepted.");
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestError("This invitation has expired.");
    }

    if (invitation.organization.status === "DEACTIVATED") {
      throw new BadRequestError("The invited organization is no longer active.");
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
      },
      invitedBy: {
        name: invitation.invitedBy.name,
      },
    };
  }

  /**
   * Lists all active invitations received by the authenticated user's email address.
   */
  public async listUserReceivedInvitations(
    userEmail: string,
  ): Promise<UserReceivedInvitationDto[]> {
    const normalizedEmail = userEmail.trim().toLowerCase();

    const invitations = await this.db.organizationInvitation.findMany({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        organization: {
          status: { not: "DEACTIVATED" },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        organization: true,
        invitedBy: {
          select: { name: true, email: true },
        },
      },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      role: inv.role,
      expiresAt: inv.expiresAt ? inv.expiresAt.toISOString() : new Date().toISOString(),
      createdAt: inv.createdAt ? inv.createdAt.toISOString() : new Date().toISOString(),
      organization: {
        id: inv.organization.id,
        name: inv.organization.name,
        slug: inv.organization.slug,
      },
      invitedBy: {
        name: inv.invitedBy.name,
        email: inv.invitedBy.email,
      },
    }));
  }

  /**
   * Rejects an invitation on behalf of the invited recipient.
   */
  public async rejectInvitation(
    actorUserId: string,
    actorEmail: string,
    rawTokenOrId: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(rawTokenOrId.trim());

    let invitation = await this.db.organizationInvitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation) {
      invitation = await this.db.organizationInvitation.findUnique({
        where: { id: rawTokenOrId.trim() },
        include: { organization: true },
      });
    }

    if (!invitation) {
      throw new BadRequestError("Invalid or expired invitation token.");
    }

    if (invitation.acceptedAt !== null) {
      throw new BadRequestError("Cannot reject an invitation that has already been accepted.");
    }

    const normalizedActorEmail = actorEmail.trim().toLowerCase();
    const normalizedInviteeEmail = invitation.email.trim().toLowerCase();

    if (normalizedActorEmail !== normalizedInviteeEmail) {
      throw new ForbiddenError(
        "This invitation was issued for a different email address. Please log in with the invited email.",
      );
    }

    if (invitation.revokedAt === null) {
      await this.db.organizationInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
    }

    logger.info(
      {
        organizationId: invitation.organizationId,
        userId: actorUserId,
        invitationId: invitation.id,
      },
      "Organization invitation rejected by recipient",
    );

    return { message: "Invitation rejected successfully." };
  }
}

export const invitationService = new InvitationService();
