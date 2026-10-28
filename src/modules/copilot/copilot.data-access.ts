import type {
  CopilotConversation,
  CopilotMessage,
  CopilotMessageRole,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import type {
  CopilotSourceDto,
  SafeCopilotConversationDto,
  SafeCopilotMessageDto,
} from "./copilot.types";

export type ConversationWithDetails = CopilotConversation & {
  _count?: { messages: number };
  messages?: CopilotMessage[];
};

export function toSafeCopilotMessage(msg: CopilotMessage): SafeCopilotMessageDto {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content,
    sources: (msg.sources as unknown as CopilotSourceDto[]) ?? [],
    tokensUsed: msg.tokensUsed,
    createdAt: msg.createdAt.toISOString(),
  };
}

export function toSafeCopilotConversation(
  conv: ConversationWithDetails,
): SafeCopilotConversationDto {
  const lastMsg = conv.messages && conv.messages.length > 0 ? conv.messages[0] : null;

  return {
    id: conv.id,
    organizationId: conv.organizationId,
    userId: conv.userId,
    title: conv.title,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    messageCount: conv._count?.messages,
    lastMessage: lastMsg ? toSafeCopilotMessage(lastMsg) : null,
  };
}

export class CopilotDataAccess {
  constructor(private readonly db: PrismaClient = prisma) {}

  public async findConversations(
    organizationId: string,
    userId: string,
    skip: number,
    take: number,
  ): Promise<ConversationWithDetails[]> {
    return this.db.copilotConversation.findMany({
      where: {
        organizationId,
        userId,
      },
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  public async countConversations(organizationId: string, userId: string): Promise<number> {
    return this.db.copilotConversation.count({
      where: {
        organizationId,
        userId,
      },
    });
  }

  public async findConversationById(
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<ConversationWithDetails | null> {
    return this.db.copilotConversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
        userId,
      },
      include: {
        _count: { select: { messages: true } },
      },
    });
  }

  public async createConversation(
    organizationId: string,
    userId: string,
    title: string,
  ): Promise<CopilotConversation> {
    return this.db.copilotConversation.create({
      data: {
        organizationId,
        userId,
        title,
      },
    });
  }

  public async updateConversation(
    conversationId: string,
    data: Prisma.CopilotConversationUpdateInput,
  ): Promise<CopilotConversation> {
    return this.db.copilotConversation.update({
      where: { id: conversationId },
      data,
    });
  }

  public async deleteConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<CopilotConversation> {
    return this.db.copilotConversation.delete({
      where: {
        id: conversationId,
        organizationId,
        userId,
      },
    });
  }

  public async findRecentMessages(conversationId: string, take = 10): Promise<CopilotMessage[]> {
    const msgs = await this.db.copilotMessage.findMany({
      where: { conversationId },
      take,
      orderBy: { createdAt: "desc" },
    });
    return msgs.reverse();
  }

  public async findMessages(
    conversationId: string,
    skip: number,
    take: number,
  ): Promise<CopilotMessage[]> {
    return this.db.copilotMessage.findMany({
      where: { conversationId },
      skip,
      take,
      orderBy: { createdAt: "asc" },
    });
  }

  public async countMessages(conversationId: string): Promise<number> {
    return this.db.copilotMessage.count({
      where: { conversationId },
    });
  }

  public async createMessage(
    conversationId: string,
    role: CopilotMessageRole,
    content: string,
    sources: CopilotSourceDto[] = [],
    tokensUsed: number | null = null,
  ): Promise<CopilotMessage> {
    return this.db.copilotMessage.create({
      data: {
        conversationId,
        role,
        content,
        sources: sources as unknown as Prisma.InputJsonValue,
        tokensUsed,
      },
    });
  }
}

export const copilotDataAccess = new CopilotDataAccess();
