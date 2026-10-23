import type { User } from "@prisma/client";

/**
 * Safe User Data Transfer Object exposed to API consumers.
 * Strict invariant: Never exposes passwordHash or sensitive credentials.
 */
export interface SafeUserDto {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Converts a raw Prisma User record into a SafeUserDto.
 */
export function toSafeUser(user: User): SafeUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Internal service result returned after authenticating or establishing a session.
 * Contains the raw refresh token that the controller attaches as an HttpOnly cookie.
 */
export interface AuthSessionResult {
  user: SafeUserDto;
  accessToken: string;
  rawRefreshToken: string;
}

/**
 * Standard public payload returned in JSON response bodies.
 */
export interface AuthResponseData {
  user: SafeUserDto;
  accessToken: string;
}
