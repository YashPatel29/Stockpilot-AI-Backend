import type { OrganizationRole } from "@prisma/client";

export interface InvitationDeliveryPayload {
  toEmail: string;
  organizationName: string;
  inviterName: string;
  role: OrganizationRole;
  rawToken: string;
  expiresAt: Date;
}

/**
 * Adapter interface for dispatching organization invitations.
 * Decouples domain logic from concrete email service providers (SES, SendGrid, SMTP, etc.).
 */
export interface IInvitationDeliveryService {
  sendInvitation(payload: InvitationDeliveryPayload): Promise<void>;
}
