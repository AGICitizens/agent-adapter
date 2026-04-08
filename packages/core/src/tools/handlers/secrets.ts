import type { SecretsBackend } from "@agent-adapter/contracts";
import type { HandlerGroup } from "../types.js";

export const createSecretsHandlers = (secrets: SecretsBackend): HandlerGroup => ({
  tools: [
    {
      name: "secrets__get",
      description: "Retrieve an encrypted credential",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string" },
          key: { type: "string" },
        },
        required: ["platform", "key"],
      },
    },
    {
      name: "secrets__set",
      description: "Store an encrypted credential",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string" },
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["platform", "key", "value"],
      },
    },
    {
      name: "secrets__list_keys",
      description: "List credential keys for a platform",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string" },
        },
        required: ["platform"],
      },
    },
  ],

  async execute(toolName, args) {
    switch (toolName) {
      case "secrets__get": {
        const value = await secrets.get(
          args.platform as string,
          args.key as string,
        );
        return { value };
      }
      case "secrets__set": {
        await secrets.set(
          args.platform as string,
          args.key as string,
          args.value as string,
        );
        return { ok: true };
      }
      case "secrets__list_keys": {
        const keys = await secrets.listKeys(args.platform as string);
        return { keys };
      }
      default:
        throw new Error(`Unknown secrets tool: ${toolName}`);
    }
  },
});
