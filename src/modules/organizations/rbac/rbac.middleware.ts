import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../../../common/errors/http-errors";
import { hasPermission, type Permission } from "./permissions";

/**
 * Express middleware requiring the caller to hold a specific permission in the active organization.
 * Invariant: Must always be preceded by requireOrgMember middleware in the route chain.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.membership) {
        throw new UnauthorizedError("Organization membership context not established.");
      }

      if (!hasPermission(req.membership.role, permission)) {
        throw new ForbiddenError("You do not have permission to perform this action.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
