import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

// Explicit boundary avoids loading OpenAI recursive types into TypeScript type checker
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ChatOpenAI } = require("@langchain/openai") as {
  ChatOpenAI: new (options: Record<string, unknown>) => BaseChatModel;
};

// Explicit boundary avoids loading Google recursive types into TypeScript type checker
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai") as {
  ChatGoogleGenerativeAI: new (options: Record<string, unknown>) => BaseChatModel;
};
import type { IAiModelProvider, AiProviderType, AiWorkflowOptions } from "./ai.interface";
import type { AiConfiguration } from "./ai.config";
import { aiConfig } from "./ai.config";
import { AppError } from "../../common/errors/app-error";
import { HttpStatus } from "../../common/constants/http-status";
import { ErrorCodes } from "../../common/errors/error-codes";
import { logger } from "../logging/logger";

/**
 * Null Object pattern provider returned when AI is disabled or unconfigured.
 * Allows the application to run smoothly without AI keys or network access.
 */
export class NullAiProvider implements IAiModelProvider {
  public readonly providerName: AiProviderType = "none";
  public readonly modelName: string = "none";

  public isAvailable(): boolean {
    return false;
  }

  public async executePrompt(_prompt: string, _options?: AiWorkflowOptions): Promise<string> {
    throw new AppError(
      "AI features are not enabled or configured in this environment.",
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCodes.AI_SERVICE_ERROR,
    );
  }

  public getChatModel(_options?: AiWorkflowOptions): BaseChatModel {
    throw new AppError(
      "AI features are not enabled or configured in this environment.",
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCodes.AI_SERVICE_ERROR,
    );
  }
}

/**
 * Mock Chat Model implementation extending LangChain BaseChatModel.
 * Supports tool binding and customizable mock responses for isolated unit testing.
 */
export class MockChatModel extends BaseChatModel {
  private readonly defaultResponse: string;
  private queuedGenerations: ChatResult[];

  constructor(
    defaultResponse = "I have analyzed your inventory and operations data.",
    queuedGenerations?: ChatResult[],
  ) {
    super({});
    this.defaultResponse = defaultResponse;
    this.queuedGenerations = queuedGenerations ?? [];
  }

  public _llmType(): string {
    return "mock";
  }

  public async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    if (this.queuedGenerations.length > 0) {
      const next = this.queuedGenerations.shift();
      if (next) {
        return next;
      }
    }

    const lastMessage = messages[messages.length - 1];
    const userText = typeof lastMessage?.content === "string" ? lastMessage.content : "";
    const responseText = `${this.defaultResponse} Grounded insight for query: "${userText.substring(0, 40)}"`;

    return {
      generations: [
        {
          text: responseText,
          message: new AIMessage(responseText),
        },
      ],
    };
  }

  public bindTools(_tools: unknown[], _kwargs?: Record<string, unknown>): this {
    return this;
  }

  public queueGeneration(generation: ChatResult): void {
    this.queuedGenerations.push(generation);
  }
}

/**
 * Mock provider for testing and offline local development.
 */
export class MockAiProvider implements IAiModelProvider {
  public readonly providerName: AiProviderType = "mock";
  public readonly modelName: string = "mock-model";
  private customChatModel?: BaseChatModel;

  constructor(customChatModel?: BaseChatModel) {
    this.customChatModel = customChatModel;
  }

  public isAvailable(): boolean {
    return true;
  }

  public setChatModel(model: BaseChatModel): void {
    this.customChatModel = model;
  }

  public async executePrompt(prompt: string, _options?: AiWorkflowOptions): Promise<string> {
    return `[Mock AI Response for: ${prompt.substring(0, 50)}...]`;
  }

  public getChatModel(_options?: AiWorkflowOptions): BaseChatModel {
    return this.customChatModel ?? new MockChatModel();
  }
}

/**
 * OpenAI Provider implementing LangChain ChatOpenAI.
 */
export class OpenAiChatProvider implements IAiModelProvider {
  public readonly providerName: AiProviderType = "openai";
  public readonly modelName: string;
  private readonly client: BaseChatModel;

  constructor(config: AiConfiguration) {
    this.modelName = config.model;
    this.client = new ChatOpenAI({
      apiKey: config.apiKey,
      modelName: config.model,
      timeout: config.requestTimeoutMs,
      temperature: 0.1,
    });
  }

  public isAvailable(): boolean {
    return true;
  }

  public async executePrompt(prompt: string, _options?: AiWorkflowOptions): Promise<string> {
    const res = await this.client.invoke(prompt);
    return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  }

  public getChatModel(): BaseChatModel {
    return this.client;
  }
}

/**
 * Google Gemini Provider implementing LangChain ChatGoogleGenerativeAI.
 */
export class GoogleChatProvider implements IAiModelProvider {
  public readonly providerName: AiProviderType = "google";
  public readonly modelName: string;
  private readonly client: BaseChatModel;

  constructor(config: AiConfiguration) {
    // Map retired/legacy models to gemini-3.1-flash-lite for fast, reliable responses
    let resolvedModel = config.model;
    if (
      resolvedModel === "gemini-1.5-flash" ||
      resolvedModel === "gemini-1.5-pro" ||
      resolvedModel === "gemini-2.5-flash" ||
      !resolvedModel
    ) {
      resolvedModel = "gemini-3.1-flash-lite";
    }

    this.modelName = resolvedModel;
    this.client = new ChatGoogleGenerativeAI({
      apiKey: config.apiKey,
      model: resolvedModel,
      temperature: 0.1,
    });
  }

  public isAvailable(): boolean {
    return true;
  }

  public async executePrompt(prompt: string, _options?: AiWorkflowOptions): Promise<string> {
    const res = await this.client.invoke(prompt);
    return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  }

  public getChatModel(): BaseChatModel {
    return this.client;
  }
}

/**
 * Factory class responsible for instantiating the appropriate AI provider adapter.
 */
export class AiProviderFactory {
  public static createProvider(config: AiConfiguration = aiConfig): IAiModelProvider {
    if (config.provider === "none" || !config.apiKey) {
      if (config.provider !== "none" && !config.apiKey) {
        logger.warn(
          `AI provider '${config.provider}' was specified without an API key. Falling back to NullAiProvider.`,
        );
      }
      return new NullAiProvider();
    }

    if (config.provider === "mock") {
      return new MockAiProvider();
    }

    if (config.provider === "openai") {
      logger.info(
        { provider: config.provider, model: config.model },
        "OpenAI AI provider adapter initialized.",
      );
      return new OpenAiChatProvider(config);
    }

    if (config.provider === "google") {
      logger.info(
        { provider: config.provider, model: config.model },
        "Google Gemini AI provider adapter initialized.",
      );
      return new GoogleChatProvider(config);
    }

    logger.info(
      { provider: config.provider, model: config.model },
      "AI provider adapter initialized.",
    );

    return new MockAiProvider();
  }
}

export const aiProvider = AiProviderFactory.createProvider();
