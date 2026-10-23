/**
 * AI Provider Types supported by StockPilot AI architecture.
 */
export type AiProviderType = "none" | "openai" | "anthropic" | "google" | "mock";

export interface AiWorkflowOptions {
  timeoutMs?: number;
  maxSteps?: number;
  sessionId?: string;
}

/**
 * Interface boundary for AI Model Providers and LangChain/LangGraph adapters.
 * Protects core business services from direct dependencies on vendor-specific LLM SDKs.
 */
export interface IAiModelProvider {
  readonly providerName: AiProviderType;
  readonly modelName: string;

  /**
   * Indicates whether the AI provider is configured and available for workflows.
   */
  isAvailable(): boolean;

  /**
   * Executes a prompt or workflow step within LangChain/LangGraph bounds.
   */
  executePrompt(prompt: string, options?: AiWorkflowOptions): Promise<string>;
}
