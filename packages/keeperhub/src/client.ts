import { z } from "zod";

export interface KeeperHubClientConfig {
  apiKey: string;
  baseUrl: string;
  
  timeoutMs?: number;
}

export const TriggerWorkflowResponseSchema = z.object({
  executionId: z.string().min(1),
  status: z.string().default("running"),
});

export type TriggerWorkflowResponse = z.infer<typeof TriggerWorkflowResponseSchema>;

export class KeeperHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = "KeeperHubError";
  }
}

export class KeeperHubClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: KeeperHubClientConfig) {
    if (!config.apiKey) throw new Error("KeeperHubClient requires apiKey");
    if (!config.baseUrl) throw new Error("KeeperHubClient requires baseUrl");
    this.apiKey = config.apiKey;
    this.baseUrl = stripTrailingSlash(config.baseUrl);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  
  async triggerWorkflow(slug: string, body: unknown): Promise<TriggerWorkflowResponse> {
    if (!slug) throw new Error("triggerWorkflow: slug is required");

    const url = `${this.baseUrl}/mcp/workflows/${encodeURIComponent(slug)}/call`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new KeeperHubError(
        `KeeperHub network error calling workflow '${slug}': ${describeError(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new KeeperHubError(
        `KeeperHub returned ${response.status} for workflow '${slug}'`,
        response.status,
        text.slice(0, 500),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new KeeperHubError(
        `KeeperHub returned non-JSON response for workflow '${slug}'`,
        response.status,
        text.slice(0, 500),
      );
    }

    const validated = TriggerWorkflowResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new KeeperHubError(
        `KeeperHub response failed schema validation: ${validated.error.message}`,
        response.status,
        text.slice(0, 500),
      );
    }

    return validated.data;
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "AbortError" ? "request timed out" : err.message;
  }
  return String(err);
}
