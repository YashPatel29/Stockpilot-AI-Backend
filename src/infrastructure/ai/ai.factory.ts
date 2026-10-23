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
}

/**
 * Mock provider for testing and offline local development.
 */
export class MockAiProvider implements IAiModelProvider {
  public readonly providerName: AiProviderType = "mock";
  public readonly modelName: string = "mock-model";

  public isAvailable(): boolean {
    return true;
  }

  public async executePrompt(prompt: string, _options?: AiWorkflowOptions): Promise<string> {
    return `[Mock AI Response for: ${prompt.substring(0, 50)}...]`;
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

    // In future modules, specific vendor adapters (e.g. OpenAIAdapter, AnthropicAdapter)
    // using @langchain/core and @langchain/langgraph will be instantiated here.
    logger.info(
      { provider: config.provider, model: config.model },
      "AI provider adapter initialized.",
    );

    // For initialization, return Mock provider when configured with key
    return new MockAiProvider();
  }
}

export const aiProvider = AiProviderFactory.createProvider();
