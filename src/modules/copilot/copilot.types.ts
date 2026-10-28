import type { CopilotMessageRole } from "@prisma/client";

/**
 * Supported citation source categories returned by copilot tools.
 */
export type CopilotSourceType =
  | "product"
  | "inventory_balance"
  | "transaction"
  | "low_stock"
  | "warehouse_inventory"
  | "purchase_order"
  | "demand_forecast"
  | "anomaly"
  | "dashboard_summary";

/**
 * Grounded source citation attached to assistant responses.
 */
export interface CopilotSourceDto {
  type: CopilotSourceType;
  id?: string;
  name?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Safe external DTO representing a conversation message.
 */
export interface SafeCopilotMessageDto {
  id: string;
  conversationId: string;
  role: CopilotMessageRole;
  content: string;
  sources: CopilotSourceDto[];
  tokensUsed: number | null;
  createdAt: string;
}

/**
 * Safe external DTO representing a user's conversation thread.
 */
export interface SafeCopilotConversationDto {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: SafeCopilotMessageDto | null;
}

/**
 * Response payload for POST /chat.
 */
export interface CopilotChatResponseDto {
  conversationId: string;
  message: SafeCopilotMessageDto;
}

/**
 * Paginated list of user conversations.
 */
export interface PaginatedConversationsResult {
  conversations: SafeCopilotConversationDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated messages in a conversation.
 */
export interface PaginatedMessagesResult {
  conversation: SafeCopilotConversationDto;
  messages: SafeCopilotMessageDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
