/**
 * Tool handler dispatch — the shared execution engine.
 * Both the agent loop and the server API call into these handlers.
 */

import type { ToolDefinition, ToolPlugin } from "@agent-adapter/contracts";
import type { ToolHandlerDeps, HandlerGroup } from "./types.js";
import { createStatusHandlers } from "./handlers/status.js";
import { createNetHandlers } from "./handlers/net.js";
import { createCapabilityHandlers } from "./handlers/capabilities.js";
import { createWalletHandlers } from "./handlers/wallet.js";
import { createSecretsHandlers } from "./handlers/secrets.js";
import { createStateHandlers } from "./handlers/state.js";
import { createPaymentHandlers } from "./handlers/payment.js";
import { createJobsHandlers } from "./handlers/jobs.js";

export type { ToolHandlerDeps } from "./types.js";
export { httpRequest } from "./http-client.js";
export type { HttpRequestOptions, HttpResponse } from "./http-client.js";

export class ToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(`Unknown tool: "${toolName}"`);
    this.name = "ToolNotFoundError";
  }
}

export interface ToolHandlers {
  execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  listTools(): ToolDefinition[];
  /** Register a 3rd-party plugin's tools into the dispatch. */
  registerPlugin(plugin: ToolPlugin): void;
}

const CAP_PREFIX = "cap__";

export const createToolHandlers = (deps: ToolHandlerDeps): ToolHandlers => {
  const capHandlers = createCapabilityHandlers(deps.capabilities);

  // Core handler groups
  const staticGroups: HandlerGroup[] = [
    createStatusHandlers(deps.provider, deps.capabilities, deps.wallets),
    createNetHandlers(),
    createWalletHandlers(deps.wallets),
    createSecretsHandlers(deps.secrets),
    createStateHandlers(deps.state),
    createPaymentHandlers(deps.payments),
    createJobsHandlers(deps.jobs),
  ];

  // O(1) dispatch by tool name
  const dispatch = new Map<string, HandlerGroup>();
  for (const group of staticGroups) {
    for (const tool of group.tools) {
      dispatch.set(tool.name, group);
    }
  }

  // 3rd-party plugins registered at runtime
  const plugins: ToolPlugin[] = [];

  return {
    async execute(toolName, args) {
      // Dynamic cap__* routing
      if (toolName.startsWith(CAP_PREFIX)) {
        return capHandlers.execute(toolName, args);
      }

      // Core static tools
      const group = dispatch.get(toolName);
      if (group) return group.execute(toolName, args);

      // 3rd-party plugin tools (checked in registration order)
      for (const plugin of plugins) {
        if (plugin.tools.some((t) => t.name === toolName)) {
          return plugin.execute(toolName, args);
        }
      }

      throw new ToolNotFoundError(toolName);
    },

    listTools() {
      const tools: ToolDefinition[] = [];

      // Static core tools
      for (const group of staticGroups) {
        tools.push(...group.tools);
      }

      // Dynamic cap__* tools from enabled capabilities
      tools.push(...capHandlers.tools);

      // 3rd-party plugin tools
      for (const plugin of plugins) {
        tools.push(...plugin.tools);
      }

      return tools;
    },

    registerPlugin(plugin) {
      plugins.push(plugin);
    },
  };
};
