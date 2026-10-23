import type { Request, Response, NextFunction, CookieOptions } from "express";
import { appConfig } from "../../config/app.config";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { parseDurationToMs } from "../../common/utils/token.util";
import { AuthService, authService } from "./auth.service";
import type { RegisterInput, LoginInput, RefreshInput } from "./auth.schema";

/**
 * Controller translating HTTP auth interactions, managing secure cookies,
 * and formatting responses conforming to StockPilot API standards.
 */
export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  /**
   * Helper to compute standard HttpOnly cookie configuration.
   */
  private getRefreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: appConfig.auth.cookieSecure,
      sameSite: appConfig.auth.cookieSameSite,
      domain: appConfig.auth.cookieDomain,
      path: `${appConfig.api.fullPrefix}/auth`,
      maxAge: parseDurationToMs(appConfig.auth.jwtRefreshExpiresIn),
    };
  }

  /**
   * Helper to extract refresh token from either HttpOnly cookie or request body.
   */
  private extractRefreshToken(req: Request): string | undefined {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[
      appConfig.auth.cookieName
    ];
    if (fromCookie) return fromCookie;

    const fromBody = (req.body as RefreshInput | undefined)?.refreshToken;
    if (fromBody) return fromBody;

    return undefined;
  }

  /**
   * POST /api/v1/auth/register
   * Registers a new account and establishes an authenticated session.
   */
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as RegisterInput;
      const result = await this.service.register(input);

      // Issue refresh token in HttpOnly cookie
      res.cookie(appConfig.auth.cookieName, result.rawRefreshToken, this.getRefreshCookieOptions());

      sendSuccess(
        res,
        {
          user: result.user,
          accessToken: result.accessToken,
        },
        HttpStatus.CREATED,
      );
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/login
   * Authenticates user credentials and issues session tokens.
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as LoginInput;
      const result = await this.service.login(input);

      // Issue refresh token in HttpOnly cookie
      res.cookie(appConfig.auth.cookieName, result.rawRefreshToken, this.getRefreshCookieOptions());

      sendSuccess(
        res,
        {
          user: result.user,
          accessToken: result.accessToken,
        },
        HttpStatus.OK,
      );
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/logout
   * Revokes current session and clears refresh token cookie.
   */
  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractRefreshToken(req);
      if (token) {
        await this.service.logout(token);
      }

      // Clear cookie with identical path and security flags
      const clearOptions = { ...this.getRefreshCookieOptions() };
      delete clearOptions.maxAge;
      res.clearCookie(appConfig.auth.cookieName, clearOptions);

      sendSuccess(res, { message: "Logged out successfully." }, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/refresh
   * Rotates session tokens and issues a replacement pair.
   */
  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractRefreshToken(req);
      const result = await this.service.refreshSession(token);

      // Attach new rotated refresh token in HttpOnly cookie
      res.cookie(appConfig.auth.cookieName, result.rawRefreshToken, this.getRefreshCookieOptions());

      sendSuccess(
        res,
        {
          user: result.user,
          accessToken: result.accessToken,
        },
        HttpStatus.OK,
      );
    } catch (error) {
      // Clear cookie if session is invalid or compromised
      const clearOptions = { ...this.getRefreshCookieOptions() };
      delete clearOptions.maxAge;
      res.clearCookie(appConfig.auth.cookieName, clearOptions);
      next(error);
    }
  };

  /**
   * GET /api/v1/auth/me
   * Retrieves profile for the currently authenticated user session.
   */
  public me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const user = await this.service.getCurrentUser(userId);

      sendSuccess(res, { user }, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
