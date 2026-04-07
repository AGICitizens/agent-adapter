/**
 * Tool plugin interface for community-built tool extensions.
 *
 * Unlike PlatformDriver, a ToolPlugin is for generic utilities
 * (e.g. file ops, notification tools) that aren't tied to a platform.
 */

import type { RuntimeAPI } from "./runtime.js";
import type { ToolDefinition } from "./types.js";

export interface ToolPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /** Tools this plugin exposes. */
  readonly tools: ToolDefinition[];

  /** Called when the plugin is loaded into the runtime. */
  initialize(runtime: RuntimeAPI): Promise<void>;

  /** Called when the runtime is shutting down. */
  shutdown(): Promise<void>;

  /** Execute a tool by name with the given arguments. */
  execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
