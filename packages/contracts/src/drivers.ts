/**
 * Platform driver interface.
 *
 * A driver represents an external platform the agent can interact with.
 * It provides metadata for the dashboard/system prompt and exposes
 * platform-specific operations as tools — no hardcoded methods.
 */

import type { RuntimeAPI } from "./runtime.js";
import type { ToolDefinition } from "./types.js";

export interface PlatformDriver {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly docsUrl: string | null;
  readonly apiBase: string | null;

  /**
   * Additional driver metadata — OpenAPI spec URLs, doc links, config hints,
   * or anything else the agent or dashboard might find useful.
   */
  readonly meta: Record<string, unknown>;

  /** Tools this driver exposes to the agent. */
  readonly tools: ToolDefinition[];

  /** Called when the driver is loaded into the runtime. */
  initialize(runtime: RuntimeAPI): Promise<void>;

  /** Called when the runtime is shutting down. */
  shutdown(): Promise<void>;

  /** Execute a tool by name with the given arguments. */
  execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /** Optional health check for dashboard status display. */
  healthCheck?(): Promise<{ ok: boolean; detail?: string }>;
}
