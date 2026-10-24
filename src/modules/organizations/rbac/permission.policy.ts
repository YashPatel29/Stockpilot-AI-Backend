import { OrganizationRole } from "@prisma/client";
import { ForbiddenError, BadRequestError } from "../../../common/errors/http-errors";

export interface PolicyCheckResult {
  allowed: boolean;
  message?: string;
}

/**
 * Centralized policy service enforcing domain invariants, hierarchy rules,
 * and safeguards against leaving an organization without an OWNER.
 */
export class PermissionPolicy {
  /**
   * Asserts whether an actor can assign a new role to a target member.
   * Rules:
   * 1. Only OWNER can change member roles.
   * 2. Cannot promote anyone to OWNER through member management.
   * 3. Cannot change/demote the OWNER's role.
   */
  public static assertCanAssignRole(
    actorRole: OrganizationRole,
    targetCurrentRole: OrganizationRole,
    newRole: OrganizationRole,
  ): void {
    if (actorRole !== OrganizationRole.OWNER) {
      throw new ForbiddenError("Only organization owners can modify team member roles.");
    }

    if (targetCurrentRole === OrganizationRole.OWNER) {
      throw new BadRequestError("The organization OWNER cannot be demoted or modified.");
    }

    if (newRole === OrganizationRole.OWNER) {
      throw new BadRequestError(
        "Promoting members to OWNER is prohibited. Direct ownership transfer is not supported through role updates.",
      );
    }
  }

  /**
   * Asserts whether an actor can remove a target member from the organization.
   * Rules:
   * 1. The OWNER can never be removed through ordinary member management endpoints.
   * 2. MEMBERs cannot remove anyone.
   * 3. ADMINs can only remove MEMBERs (cannot remove other ADMINs or the OWNER).
   * 4. OWNERs can remove any non-OWNER member (ADMIN or MEMBER).
   */
  public static assertCanRemoveMember(
    actorRole: OrganizationRole,
    targetRole: OrganizationRole,
  ): void {
    if (targetRole === OrganizationRole.OWNER) {
      throw new BadRequestError("The organization OWNER cannot be removed.");
    }

    if (actorRole === OrganizationRole.MEMBER) {
      throw new ForbiddenError("Members do not have permission to remove team members.");
    }

    if (actorRole === OrganizationRole.ADMIN && targetRole !== OrganizationRole.MEMBER) {
      throw new ForbiddenError("Administrators can only remove regular members.");
    }
  }

  /**
   * Asserts whether an actor can create an invitation for the specified role.
   * Rules:
   * 1. Only OWNER or ADMIN can create invitations.
   * 2. Cannot invite users directly as OWNER.
   */
  public static assertCanCreateInvitation(
    actorRole: OrganizationRole,
    invitedRole: OrganizationRole,
  ): void {
    if (actorRole !== OrganizationRole.OWNER && actorRole !== OrganizationRole.ADMIN) {
      throw new ForbiddenError(
        "Only organization owners and administrators can create invitations.",
      );
    }

    if (invitedRole === OrganizationRole.OWNER) {
      throw new BadRequestError("Invitations cannot be issued for the OWNER role.");
    }
  }

  /**
   * Asserts whether an actor can revoke a pending invitation.
   * Rules:
   * 1. Only OWNER or ADMIN can revoke invitations.
   */
  public static assertCanRevokeInvitation(actorRole: OrganizationRole): void {
    if (actorRole !== OrganizationRole.OWNER && actorRole !== OrganizationRole.ADMIN) {
      throw new ForbiddenError(
        "Only organization owners and administrators can revoke invitations.",
      );
    }
  }
}
