// Express Request augmentation for request tracking, correlation IDs, and authenticated user/org context

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: string;
}

export interface AuthenticatedOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: "OWNER" | "MEMBER";
  createdAt: string;
  updatedAt: string;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Unique request correlation identifier (UUID v4)
       */
      id: string;

      /**
       * High-resolution timestamp when the request entered the pipeline
       */
      startTime?: [number, number];

      /**
       * Authenticated user session context populated by auth middleware
       */
      user?: AuthenticatedUser;

      /**
       * Resolved organization context populated by requireOrgMember middleware
       */
      organization?: AuthenticatedOrganization;

      /**
       * Caller's membership record populated by requireOrgMember middleware
       */
      membership?: AuthenticatedMembership;
    }
  }
}

export {};
