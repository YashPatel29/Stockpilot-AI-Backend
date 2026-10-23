import { appConfig } from "../../config/app.config";
import type { AiProviderType } from "./ai.interface";

export interface AiConfiguration {
  provider: AiProviderType;
  model: string;
  apiKey?: string;
  requestTimeoutMs: number;
  maxGraphSteps: number;
}

export const aiConfig: AiConfiguration = {
  provider: appConfig.ai.provider as AiProviderType,
  model: appConfig.ai.model,
  apiKey: appConfig.ai.apiKey,
  requestTimeoutMs: appConfig.ai.requestTimeoutMs,
  maxGraphSteps: appConfig.ai.maxGraphSteps,
};
