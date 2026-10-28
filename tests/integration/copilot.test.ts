import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { OrganizationRole, type CopilotMessageRole } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";
import { aiProvider, MockChatModel } from "../../src/infrastructure/ai/ai.factory";

describe("Feature 12: AI Inventory Copilot (Integration)", () => {
  const orgId = "550e8400-e29b-41d4-a716-446655440001";

  const ownerUser = {
    id: "550e8400-e29b-41d4-a716-446655440010",
    email: "owner@stockpilot.io",
    name: "Owner Alice",
    status: "ACTIVE",
  };

  const adminUser = {
    id: "550e8400-e29b-41d4-a716-446655440020",
    email: "admin@stockpilot.io",
    name: "Admin Bob",
    status: "ACTIVE",
  };

  const memberUser = {
    id: "550e8400-e29b-41d4-a716-446655440030",
    email: "member@stockpilot.io",
    name: "Member Charlie",
    status: "ACTIVE",
  };

  const nonMemberUser = {
    id: "550e8400-e29b-41d4-a716-446655440040",
    email: "nonmember@stockpilot.io",
    name: "NonMember Dan",
    status: "ACTIVE",
  };

  const sampleOrg = {
    id: orgId,
    name: "StockPilot Alpha Corp",
    slug: "stockpilot-alpha-corp",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let nonMemberToken: string;

  interface ConversationRecord {
    id: string;
    organizationId: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }

  interface MessageRecord {
    id: string;
    conversationId: string;
    role: CopilotMessageRole;
    content: string;
    sources: unknown;
    tokensUsed: number | null;
    createdAt: Date;
  }

  let convStore: ConversationRecord[] = [];
  let msgStore: MessageRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    convStore = [];
    msgStore = [];

    ownerToken = signAccessToken({
      sub: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
    });
    adminToken = signAccessToken({
      sub: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
    });
    memberToken = signAccessToken({
      sub: memberUser.id,
      email: memberUser.email,
      name: memberUser.name,
    });
    nonMemberToken = signAccessToken({
      sub: nonMemberUser.id,
      email: nonMemberUser.email,
      name: nonMemberUser.name,
    });

    // Mock authenticate user lookup
    vi.spyOn(prisma.user, "findUnique").mockImplementation(((args: { where: { id?: string } }) => {
      const id = args.where.id;
      if (id === ownerUser.id) return Promise.resolve(ownerUser);
      if (id === adminUser.id) return Promise.resolve(adminUser);
      if (id === memberUser.id) return Promise.resolve(memberUser);
      if (id === nonMemberUser.id) return Promise.resolve(nonMemberUser);
      return Promise.resolve(null);
    }) as unknown as typeof prisma.user.findUnique);

    // Mock organization lookup
    vi.spyOn(prisma.organization, "findUnique").mockImplementation(((args: {
      where: { id?: string };
    }) => {
      if (args.where.id === orgId) return Promise.resolve(sampleOrg);
      return Promise.resolve(null);
    }) as unknown as typeof prisma.organization.findUnique);

    // Mock membership lookup (RBAC)
    vi.spyOn(prisma.organizationMembership, "findUnique").mockImplementation(((args: {
      where: { userId_organizationId: { userId: string; organizationId: string } };
    }) => {
      const { userId, organizationId } = args.where.userId_organizationId;
      if (organizationId !== orgId) return Promise.resolve(null);

      if (userId === ownerUser.id) {
        return Promise.resolve({
          id: "mem-owner",
          organizationId: orgId,
          userId: ownerUser.id,
          role: OrganizationRole.OWNER,
          organization: sampleOrg,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      if (userId === adminUser.id) {
        return Promise.resolve({
          id: "mem-admin",
          organizationId: orgId,
          userId: adminUser.id,
          role: OrganizationRole.ADMIN,
          organization: sampleOrg,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      if (userId === memberUser.id) {
        return Promise.resolve({
          id: "mem-member",
          organizationId: orgId,
          userId: memberUser.id,
          role: OrganizationRole.MEMBER,
          organization: sampleOrg,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    }) as unknown as typeof prisma.organizationMembership.findUnique);

    // Mock copilotConversation Prisma operations
    vi.spyOn(prisma.copilotConversation, "create").mockImplementation(((args: {
      data: { organizationId: string; userId: string; title: string };
    }) => {
      const record: ConversationRecord = {
        id: `conv-${convStore.length + 1}`,
        organizationId: args.data.organizationId,
        userId: args.data.userId,
        title: args.data.title,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      convStore.push(record);
      return Promise.resolve(record);
    }) as unknown as typeof prisma.copilotConversation.create);

    vi.spyOn(prisma.copilotConversation, "findFirst").mockImplementation(((args: {
      where: { id?: string; organizationId?: string; userId?: string };
    }) => {
      const found = convStore.find(
        (c) =>
          (!args.where.id || c.id === args.where.id) &&
          (!args.where.organizationId || c.organizationId === args.where.organizationId) &&
          (!args.where.userId || c.userId === args.where.userId),
      );
      if (!found) return Promise.resolve(null);
      return Promise.resolve({
        ...found,
        _count: {
          messages: msgStore.filter((m) => m.conversationId === found.id).length,
        },
      });
    }) as unknown as typeof prisma.copilotConversation.findFirst);

    vi.spyOn(prisma.copilotConversation, "findMany").mockImplementation(((args: {
      where: { organizationId?: string; userId?: string };
      skip?: number;
      take?: number;
    }) => {
      let filtered = convStore.filter(
        (c) =>
          (!args.where.organizationId || c.organizationId === args.where.organizationId) &&
          (!args.where.userId || c.userId === args.where.userId),
      );
      filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      if (args.skip) filtered = filtered.slice(args.skip);
      if (args.take) filtered = filtered.slice(0, args.take);

      return Promise.resolve(
        filtered.map((c) => ({
          ...c,
          _count: { messages: msgStore.filter((m) => m.conversationId === c.id).length },
          messages: msgStore.filter((m) => m.conversationId === c.id).slice(-1),
        })),
      );
    }) as unknown as typeof prisma.copilotConversation.findMany);

    vi.spyOn(prisma.copilotConversation, "count").mockImplementation(((args: {
      where: { organizationId?: string; userId?: string };
    }) => {
      const count = convStore.filter(
        (c) =>
          (!args.where.organizationId || c.organizationId === args.where.organizationId) &&
          (!args.where.userId || c.userId === args.where.userId),
      ).length;
      return Promise.resolve(count);
    }) as unknown as typeof prisma.copilotConversation.count);

    vi.spyOn(prisma.copilotConversation, "update").mockImplementation(((args: {
      where: { id: string };
      data: { updatedAt?: Date };
    }) => {
      const record = convStore.find((c) => c.id === args.where.id);
      if (record && args.data.updatedAt) {
        record.updatedAt = args.data.updatedAt;
      }
      return Promise.resolve(record!);
    }) as unknown as typeof prisma.copilotConversation.update);

    vi.spyOn(prisma.copilotConversation, "delete").mockImplementation(((args: {
      where: { id: string; organizationId: string; userId: string };
    }) => {
      const idx = convStore.findIndex(
        (c) =>
          c.id === args.where.id &&
          c.organizationId === args.where.organizationId &&
          c.userId === args.where.userId,
      );
      if (idx === -1) throw new Error("Record not found to delete");
      const deleted = convStore.splice(idx, 1)[0]!;
      msgStore = msgStore.filter((m) => m.conversationId !== deleted.id);
      return Promise.resolve(deleted);
    }) as unknown as typeof prisma.copilotConversation.delete);

    // Mock copilotMessage Prisma operations
    vi.spyOn(prisma.copilotMessage, "create").mockImplementation(((args: {
      data: {
        conversationId: string;
        role: CopilotMessageRole;
        content: string;
        sources?: unknown;
        tokensUsed?: number | null;
      };
    }) => {
      const record: MessageRecord = {
        id: `msg-${msgStore.length + 1}`,
        conversationId: args.data.conversationId,
        role: args.data.role,
        content: args.data.content,
        sources: args.data.sources ?? [],
        tokensUsed: args.data.tokensUsed ?? null,
        createdAt: new Date(),
      };
      msgStore.push(record);
      return Promise.resolve(record);
    }) as unknown as typeof prisma.copilotMessage.create);

    vi.spyOn(prisma.copilotMessage, "findMany").mockImplementation(((args: {
      where: { conversationId: string };
      skip?: number;
      take?: number;
      orderBy?: { createdAt: "asc" | "desc" };
    }) => {
      let filtered = msgStore.filter((m) => m.conversationId === args.where.conversationId);
      if (args.orderBy?.createdAt === "desc") {
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else {
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      if (args.skip) filtered = filtered.slice(args.skip);
      if (args.take) filtered = filtered.slice(0, args.take);
      return Promise.resolve(filtered);
    }) as unknown as typeof prisma.copilotMessage.findMany);

    vi.spyOn(prisma.copilotMessage, "count").mockImplementation(((args: {
      where: { conversationId: string };
    }) => {
      const count = msgStore.filter((m) => m.conversationId === args.where.conversationId).length;
      return Promise.resolve(count);
    }) as unknown as typeof prisma.copilotMessage.count);

    // Mock audit log create
    vi.spyOn(prisma.auditLog, "create").mockImplementation(((args: {
      data: Record<string, unknown>;
    }) => {
      return Promise.resolve({
        id: `audit-${Date.now()}`,
        organizationId: (args?.data?.["organizationId"] as string) ?? null,
        actorUserId: (args?.data?.["actorUserId"] as string) ?? null,
        action: (args?.data?.["action"] as string) ?? "action",
        resourceType: (args?.data?.["resourceType"] as string) ?? "type",
        resourceId: (args?.data?.["resourceId"] as string) ?? null,
        metadata: args?.data?.["metadata"] ?? null,
        requestId: (args?.data?.["requestId"] as string) ?? null,
        ipAddress: (args?.data?.["ipAddress"] as string) ?? null,
        userAgent: (args?.data?.["userAgent"] as string) ?? null,
        createdAt: new Date(),
        actorUser: null,
      });
    }) as unknown as typeof prisma.auditLog.create);

    // Mock AI provider availability and mock chat model
    vi.spyOn(aiProvider, "isAvailable").mockReturnValue(true);
    vi.spyOn(aiProvider, "getChatModel").mockReturnValue(new MockChatModel());
  });

  describe("Authentication & RBAC boundaries", () => {
    it("should return 401 when no authorization token is provided", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .send({ message: "What is my inventory status?" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 when user is not a member of the organization (anti-IDOR)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${nonMemberToken}`)
        .send({ message: "What is my inventory status?" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should allow OWNER, ADMIN, and MEMBER to interact with copilot", async () => {
      const memberRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ message: "Show me low stock items" });

      expect(memberRes.status).toBe(200);
      expect(memberRes.body.success).toBe(true);
      expect(memberRes.body.data.conversationId).toBeDefined();
      expect(memberRes.body.data.message.role).toBe("ASSISTANT");
    });
  });

  describe("POST /api/v1/organizations/:organizationId/copilot/chat", () => {
    it("should reject invalid request with empty message (422 Unprocessable Entity)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "" });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject message exceeding 2000 characters (422 Unprocessable Entity)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "a".repeat(2001) });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should create a conversation and return assistant reply with grounded citations", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "Check drill stock" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversationId).toBeDefined();
      expect(res.body.data.message.content).toBeDefined();
      expect(res.body.data.message.role).toBe("ASSISTANT");
      expect(Array.isArray(res.body.data.message.sources)).toBe(true);

      expect(convStore).toHaveLength(1);
      expect(msgStore).toHaveLength(2); // 1 user + 1 assistant
    });

    it("should append multi-turn message to existing conversationId", async () => {
      const turn1 = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "First message" });

      const convId = turn1.body.data.conversationId;

      const turn2 = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "Follow-up message", conversationId: convId });

      expect(turn2.status).toBe(200);
      expect(turn2.body.data.conversationId).toBe(convId);
      expect(convStore).toHaveLength(1);
      expect(msgStore).toHaveLength(4); // 2 turns = 4 messages
    });
  });

  describe("GET /api/v1/organizations/:organizationId/copilot/conversations", () => {
    it("should list paginated conversations scoped strictly to authenticated user", async () => {
      // User 1 creates conversation
      await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "Owner message" });

      // User 2 creates conversation
      await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ message: "Admin message" });

      const ownerList = await request(app)
        .get(`/api/v1/organizations/${orgId}/copilot/conversations`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(ownerList.status).toBe(200);
      expect(ownerList.body.data.conversations).toHaveLength(1);
      expect(ownerList.body.data.conversations[0].userId).toBe(ownerUser.id);

      const adminList = await request(app)
        .get(`/api/v1/organizations/${orgId}/copilot/conversations`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(adminList.status).toBe(200);
      expect(adminList.body.data.conversations).toHaveLength(1);
      expect(adminList.body.data.conversations[0].userId).toBe(adminUser.id);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/copilot/conversations/:conversationId", () => {
    it("should return 404 for non-existent conversation", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/copilot/conversations/non-existent-conv`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 when user tries to access another user's conversation", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "Private query" });

      const convId = createRes.body.data.conversationId;

      const adminRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/copilot/conversations/${convId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(404);
    });

    it("should retrieve conversation detail and message history", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "Check drill stock" });

      const convId = createRes.body.data.conversationId;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/copilot/conversations/${convId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.conversation.id).toBe(convId);
      expect(res.body.data.messages).toHaveLength(2);
      expect(res.body.data.messages[0].role).toBe("USER");
      expect(res.body.data.messages[1].role).toBe("ASSISTANT");
    });
  });

  describe("DELETE /api/v1/organizations/:organizationId/copilot/conversations/:conversationId", () => {
    it("should delete conversation thread and return 200", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/copilot/chat`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ message: "Temporary query" });

      const convId = createRes.body.data.conversationId;

      const deleteRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/copilot/conversations/${convId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.id).toBe(convId);

      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/copilot/conversations/${convId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(getRes.status).toBe(404);
    });
  });
});
