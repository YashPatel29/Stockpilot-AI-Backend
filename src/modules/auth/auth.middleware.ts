import type { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { UnauthorizedError } from "../../common/errors/http-errors";
import { verifyAccessToken } from "../../common/utils/token.util";

/**
 * Creates an authentication middleware instance.
 * Allows injecting a mock PrismaClient for isolated unit testing.
 */
export function createAuthMiddleware(db: PrismaClient = prisma) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedError("Authentication token is missing or malformed.");
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        throw new UnauthorizedError("Authentication token is missing.");
      }

      const payload = verifyAccessToken(token);

      const user = await db.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedError("User session is invalid or account is disabled.");
      }

      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const authenticate = createAuthMiddleware();
