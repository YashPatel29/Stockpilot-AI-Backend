import { z } from "zod";

export const copilotOrgParamsSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
  })
  .strict();

export type CopilotOrgParams = z.infer<typeof copilotOrgParamsSchema>;

export const copilotChatSchema = z
  .object({
    message: z
      .string({ required_error: "Message is required." })
      .trim()
      .min(1, "Message cannot be empty.")
      .max(2000, "Message cannot exceed 2000 characters."),
    conversationId: z.string().min(1, "Conversation ID cannot be empty.").optional(),
  })
  .strict();

export type CopilotChatInput = z.infer<typeof copilotChatSchema>;

export const copilotConversationParamSchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format."),
    conversationId: z.string().min(1, "Conversation ID is required."),
  })
  .strict();

export type CopilotConversationParams = z.infer<typeof copilotConversationParamSchema>;

export const listConversationsQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .min(1, "Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
  })
  .strict();

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listMessagesQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .min(1, "Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(50),
  })
  .strict();

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
