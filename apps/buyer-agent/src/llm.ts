import OpenAI from "openai";

export interface LlmConfig {
  apiKey: string;
  model: string;
  
  baseUrl?: string;
}

export function createLlmClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? "https://openrouter.ai/api/v1",
  });
}
