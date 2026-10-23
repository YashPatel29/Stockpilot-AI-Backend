import type { Request, Response, NextFunction } from "express";
import { PrismaClient, OrganizationRole } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { NotFoundError, ForbiddenError, UnauthorizedError } from "../../common/errors/http-errors";
import { toSafeOrganization } from "./organization.types";

/**
 * Higher-order middleware factory verifying caller's membership in the target organization.
 * Prevents Insecure Direct Object References (IDOR) by returning generic 404 for non-members.
 * Attaches verified organization and membership to Express Request context.
 */
export function createRequireOrgMember(db: PrismaClient = prisma) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const rawOrgId = req.params["organizationId"];
      if (!rawOrgId || typeof rawOrgId !== "string") {
        throw new NotFoundError("Organization not found.");
      }
      const organizationId: string = rawOrgId;

      const membership = await db.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId,
          },
        },
        include: { organization: true },
      });

      if (!membership || membership.organization.status === "DEACTIVATED") {
        throw new NotFoundError("Organization not found.");
      }

      req.organization = toSafeOrganization(membership.organization);
      req.membership = {
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authorization guard requiring caller to hold the OWNER role in the active organization context.
 * Must be preceded by requireOrgMember middleware.
 */
export function requireOrgOwner(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!req.membership) {
      throw new UnauthorizedError("Organization context not established.");
    }

    if (req.membership.role !== OrganizationRole.OWNER) {
      throw new ForbiddenError("Only organization owners can perform this action.");
    }

    next();
  } catch (error) {
    next(error);
  }
}

export const requireOrgMember = createRequireOrgMember();
