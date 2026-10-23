import { z } from "zod";

/**
 * Normalization helper: trims and lowercases email strings.
 */
const emailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Please provide a valid email address")
  .max(255, "Email cannot exceed 255 characters");

/**
 * Registration request body schema.
 * Enforces name, normalized email, and password complexity bounds.
 */
export const registerSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  email: emailSchema,
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password cannot exceed 128 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login request body schema.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required")
    .max(128, "Password cannot exceed 128 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Refresh session request schema.
 * Supports receiving the refresh token optionally in the request body for non-browser clients,
 * while default browser flows read from the HttpOnly cookie.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RefreshInput = z.infer<typeof refreshSchema>;
