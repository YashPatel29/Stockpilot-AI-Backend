import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { CopilotController, copilotController } from "./copilot.controller";
import {
  copilotOrgParamsSchema,
  copilotChatSchema,
  copilotConversationParamSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
} from "./copilot.schema";

/**
 * Creates and configures routes for AI Inventory Copilot interactions and conversation history.
 * Mounted under: /api/v1/organizations/:organizationId/copilot
 */
export function createCopilotRouter(controller: CopilotController = copilotController): Router {
  const router = Router({ mergeParams: true });

  // Organization membership required for all copilot interactions
  router.use(requireOrgMember);

  // POST /chat - Submit conversational query and receive grounded citations
  router.post(
    "/chat",
    requirePermission(Permissions.COPILOT_CHAT),
    validateRequest({
      params: copilotOrgParamsSchema,
      body: copilotChatSchema,
    }),
    controller.chat,
  );

  // GET /conversations - List user's conversation threads in this organization
  router.get(
    "/conversations",
    requirePermission(Permissions.COPILOT_CHAT),
    validateRequest({
      params: copilotOrgParamsSchema,
      query: listConversationsQuerySchema,
    }),
    controller.listConversations,
  );

  // GET /conversations/:conversationId - Retrieve thread with paginated messages
  router.get(
    "/conversations/:conversationId",
    requirePermission(Permissions.COPILOT_CHAT),
    validateRequest({
      params: copilotConversationParamSchema,
      query: listMessagesQuerySchema,
    }),
    controller.getConversation,
  );

  // DELETE /conversations/:conversationId - Delete conversation thread and its messages
  router.delete(
    "/conversations/:conversationId",
    requirePermission(Permissions.COPILOT_CHAT),
    validateRequest({
      params: copilotConversationParamSchema,
    }),
    controller.deleteConversation,
  );

  return router;
}

export const copilotRouter = createCopilotRouter();
