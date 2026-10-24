import { appConfig } from "../../../../config/app.config";
import { logger } from "../../../../infrastructure/logging/logger";
import type { IInvitationDeliveryService, InvitationDeliveryPayload } from "./delivery.interface";

/**
 * Development and testing invitation delivery adapter.
 * Retains delivered payloads in memory for test assertions and safe local debugging.
 * Invariant: Never logs raw invitation tokens in production.
 */
export class DevInvitationDeliveryAdapter implements IInvitationDeliveryService {
  private readonly dispatchedInvitations: InvitationDeliveryPayload[] = [];

  public async sendInvitation(payload: InvitationDeliveryPayload): Promise<void> {
    this.dispatchedInvitations.push({ ...payload });

    if (appConfig.server.nodeEnv === "production") {
      logger.info(
        {
          toEmail: payload.toEmail,
          organizationName: payload.organizationName,
          role: payload.role,
        },
        "Organization invitation dispatched",
      );
    } else {
      logger.debug(
        {
          toEmail: payload.toEmail,
          organizationName: payload.organizationName,
          role: payload.role,
          expiresAt: payload.expiresAt,
        },
        "[DEV] Organization invitation created. Testing adapter recorded token.",
      );
    }
  }

  /**
   * Returns copy of all dispatched invitation records (primarily for testing).
   */
  public getSentInvitations(): readonly InvitationDeliveryPayload[] {
    return [...this.dispatchedInvitations];
  }

  /**
   * Returns the most recent dispatched invitation for a given email address.
   */
  public getLatestInvitationForEmail(email: string): InvitationDeliveryPayload | undefined {
    return [...this.dispatchedInvitations]
      .reverse()
      .find((inv) => inv.toEmail.toLowerCase() === email.toLowerCase());
  }

  /**
   * Clears the in-memory delivery store (useful between test runs).
   */
  public clear(): void {
    this.dispatchedInvitations.length = 0;
  }
}

export const devInvitationDelivery = new DevInvitationDeliveryAdapter();
