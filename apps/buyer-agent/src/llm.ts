import OpenAI from "openai";

export interface LlmConfig {
  apiKey: string;
  model: string;
  /** OpenRouter base URL — `https://openrouter.ai/api/v1`. */
  baseUrl?: string;
}

/**
 * Build an OpenAI-compatible client targeted at OpenRouter. OpenRouter exposes
 * the OpenAI Chat Completions wire format for hundreds of underlying models;
 * `model` selects which one (e.g. google/gemini-2.0-flash-001).
 */
export function createLlmClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? "https://openrouter.ai/api/v1",
  });
}
