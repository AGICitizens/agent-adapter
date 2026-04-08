import type { ToolDefinition } from "@agent-adapter/contracts";
import type { CapabilityRegistry } from "../../capabilities/registry.js";
import type { HandlerGroup } from "../types.js";
import { httpRequest } from "../http-client.js";

const CAP_PREFIX = "cap__";

export const createCapabilityHandlers = (
  capabilities: CapabilityRegistry,
): HandlerGroup => ({
  // Dynamic — reads from registry each time so newly enabled caps appear immediately
  get tools(): ToolDefinition[] {
    return capabilities
      .listCapabilities()
      .filter((c) => c.enabled)
      .map((c) => ({
        name: `${CAP_PREFIX}${c.name}`,
        description: c.description,
        parameters: c.inputSchema,
      }));
  },

  async execute(toolName, args) {
    const capName = toolName.slice(CAP_PREFIX.length);
    const cap = capabilities.getCapability(capName);

    if (!cap) throw new Error(`Capability not found: ${capName}`);
    if (!cap.enabled) throw new Error(`Capability is disabled: ${capName}`);

    const { executionPlan } = cap;

    // Build request headers from execution plan
    const headers: Record<string, string> = { ...executionPlan.headers };

    // Build request body by merging template with tool args
    let body: unknown;
    if (executionPlan.bodyTemplate) {
      body = { ...executionPlan.bodyTemplate, ...args };
    } else if (Object.keys(args).length > 0) {
      body = args;
    }

    const response = await httpRequest({
      method: executionPlan.method,
      url: executionPlan.url,
      headers,
      body,
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
    };
  },
});
