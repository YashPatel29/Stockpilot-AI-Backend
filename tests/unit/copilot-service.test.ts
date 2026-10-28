import { describe, it, expect, vi, beforeEach } from "vitest";
import { CopilotService } from "../../src/modules/copilot/copilot.service";
import { MockAiProvider, NullAiProvider } from "../../src/infrastructure/ai/ai.factory";
import { NotFoundError } from "../../src/common/errors/http-errors";
import { HttpStatus } from "../../src/common/constants/http-status";

describe("CopilotService Unit Tests", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";
  const userId = "22222222-2222-2222-2222-222222222222";
  const convId = "33333333-3333-3333-3333-333333333333";

  let mockDataAccess: {
    findConversations: ReturnType<typeof vi.fn>;
    countConversations: ReturnType<typeof vi.fn>;
    findConversationById: ReturnType<typeof vi.fn>;
    createConversation: ReturnType<typeof vi.fn>;
    updateConversation: ReturnType<typeof vi.fn>;
    deleteConversation: ReturnType<typeof vi.fn>;
    findRecentMessages: ReturnType<typeof vi.fn>;
    findMessages: ReturnType<typeof vi.fn>;
    countMessages: ReturnType<typeof vi.fn>;
    createMessage: ReturnType<typeof vi.fn>;
  };

  let mockAudit: {
    recordAudit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDataAccess = {
      findConversations: vi.fn(),
      countConversations: vi.fn(),
      findConversationById: vi.fn(),
      createConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      findRecentMessages: vi.fn().mockResolvedValue([]),
      findMessages: vi.fn(),
      countMessages: vi.fn(),
      createMessage: vi.fn(),
    };

    mockAudit = {
      recordAudit: vi.fn().mockResolvedValue(null),
    };
  });

  it("should fail chat with 503 SERVICE_UNAVAILABLE when AI is disabled", async () => {
    const service = new CopilotService(
      {} as unknown as never,
      mockDataAccess as unknown as never,
      new NullAiProvider(),
      mockAudit as unknown as never,
    );

    await expect(
      service.chat(orgId, userId, { message: "What is my stock status?" }),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });

  it("should throw NotFoundError if specified conversationId does not exist", async () => {
    mockDataAccess.findConversationById.mockResolvedValue(null);

    const service = new CopilotService(
      {} as unknown as never,
      mockDataAccess as unknown as never,
      new MockAiProvider(),
      mockAudit as unknown as never,
    );

    await expect(
      service.chat(orgId, userId, {
        message: "Hello",
        conversationId: "non-existent-id",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("should create new conversation if no conversationId provided and return assistant response", async () => {
    const fakeConv = {
      id: convId,
      organizationId: orgId,
      userId,
      title: "How many drills do we have in stock?",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockDataAccess.createConversation.mockResolvedValue(fakeConv);
    mockDataAccess.createMessage.mockImplementation((cId, role, content, sources, tokens) => {
      return Promise.resolve({
        id: `msg-${Date.now()}-${role}`,
        conversationId: cId,
        role,
        content,
        sources: sources ?? [],
        tokensUsed: tokens ?? null,
        createdAt: new Date(),
      });
    });
    mockDataAccess.updateConversation.mockResolvedValue(fakeConv);

    const service = new CopilotService(
      {} as unknown as never,
      mockDataAccess as unknown as never,
      new MockAiProvider(),
      mockAudit as unknown as never,
    );

    const res = await service.chat(orgId, userId, {
      message: "How many drills do we have in stock?",
    });

    expect(mockDataAccess.createConversation).toHaveBeenCalledWith(
      orgId,
      userId,
      "How many drills do we have in stock?",
    );
    expect(res.conversationId).toBe(convId);
    expect(res.message.role).toBe("ASSISTANT");
    expect(res.message.content).toContain("Grounded insight");
    expect(mockAudit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "copilot.query",
        resourceType: "CopilotConversation",
        resourceId: convId,
      }),
    );
  });

  it("should list conversations paginated", async () => {
    mockDataAccess.countConversations.mockResolvedValue(1);
    mockDataAccess.findConversations.mockResolvedValue([
      {
        id: convId,
        organizationId: orgId,
        userId,
        title: "Test Thread",
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { messages: 2 },
        messages: [
          {
            id: "msg-1",
            conversationId: convId,
            role: "ASSISTANT",
            content: "Hello",
            sources: [],
            tokensUsed: null,
            createdAt: new Date(),
          },
        ],
      },
    ]);

    const service = new CopilotService(
      {} as unknown as never,
      mockDataAccess as unknown as never,
      new MockAiProvider(),
      mockAudit as unknown as never,
    );

    const result = await service.listConversations(orgId, userId, { page: 1, limit: 20 });
    expect(result.conversations).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(result.conversations[0]?.title).toBe("Test Thread");
    expect(result.conversations[0]?.messageCount).toBe(2);
  });

  it("should get conversation details with messages", async () => {
    mockDataAccess.findConversationById.mockResolvedValue({
      id: convId,
      organizationId: orgId,
      userId,
      title: "Test Thread",
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { messages: 1 },
    });
    mockDataAccess.countMessages.mockResolvedValue(1);
    mockDataAccess.findMessages.mockResolvedValue([
      {
        id: "msg-1",
        conversationId: convId,
        role: "USER",
        content: "What is low stock?",
        sources: [],
        tokensUsed: null,
        createdAt: new Date(),
      },
    ]);

    const service = new CopilotService(
      {} as unknown as never,
      mockDataAccess as unknown as never,
      new MockAiProvider(),
      mockAudit as unknown as never,
    );

    const result = await service.getConversation(orgId, userId, convId, { page: 1, limit: 50 });
    expect(result.conversation.id).toBe(convId);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe("What is low stock?");
  });

  it("should delete conversation and write audit log", async () => {
    mockDataAccess.findConversationById.mockResolvedValue({
      id: convId,
      organizationId: orgId,
      userId,
      title: "Thread to delete",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockDataAccess.deleteConversation.mockResolvedValue({
      id: convId,
      organizationId: orgId,
      userId,
      title: "Thread to delete",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new CopilotService(
      {} as unknown as never,
      mockDataAccess as unknown as never,
      new MockAiProvider(),
      mockAudit as unknown as never,
    );

    const result = await service.deleteConversation(orgId, userId, convId);
    expect(result.id).toBe(convId);
    expect(mockDataAccess.deleteConversation).toHaveBeenCalledWith(orgId, userId, convId);
    expect(mockAudit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "copilot.conversation_deleted",
        resourceType: "CopilotConversation",
        resourceId: convId,
      }),
    );
  });
});
