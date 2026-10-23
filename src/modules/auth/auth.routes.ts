import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { AuthController, authController } from "./auth.controller";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schema";
import { authRateLimiter } from "./auth.rate-limiter";
import { authenticate } from "./auth.middleware";

/**
 * Creates and configures routes for the Authentication module.
 * Route prefix: /api/v1/auth
 */
export function createAuthRouter(controller: AuthController = authController): Router {
  const router = Router();

  // POST /api/v1/auth/register
  router.post(
    "/register",
    authRateLimiter,
    validateRequest({ body: registerSchema }),
    controller.register,
  );

  // POST /api/v1/auth/login
  router.post("/login", authRateLimiter, validateRequest({ body: loginSchema }), controller.login);

  // POST /api/v1/auth/logout
  router.post("/logout", controller.logout);

  // POST /api/v1/auth/refresh
  router.post(
    "/refresh",
    authRateLimiter,
    validateRequest({ body: refreshSchema }),
    controller.refresh,
  );

  // GET /api/v1/auth/me
  router.get("/me", authenticate, controller.me);

  return router;
}

export const authRouter = createAuthRouter();
